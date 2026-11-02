-- Projects may be created before a homeowner is known ("Assign later").
-- Only the NOT NULL constraint is relaxed; the FK, index, and every existing row stay as they are.

alter table public.projects alter column primary_client_id drop not null;

create or replace function public.validate_project_refs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.primary_client_id is not null and not exists (
    select 1 from public.clients c where c.id = new.primary_client_id and c.organization_id = new.organization_id
  ) then
    raise exception 'Primary client does not belong to this organization';
  end if;
  if new.project_manager_id is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = new.organization_id and m.user_id = new.project_manager_id
      and m.status = 'active' and m.role in ('org_admin', 'project_manager')
  ) then
    raise exception 'Project manager must be an active administrator or project manager of this organization';
  end if;
  return new;
end;
$$;

create or replace function public.after_project_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.primary_client_id is not null then
      insert into public.project_clients (organization_id, project_id, client_id, relationship, created_by)
        values (new.organization_id, new.id, new.primary_client_id, 'primary_owner', auth.uid())
        on conflict (project_id, client_id) do update set relationship = 'primary_owner';
      insert into public.client_activity (organization_id, client_id, project_id, activity_type, summary, created_by)
        values (new.organization_id, new.primary_client_id, new.id, 'system',
                'Project ' || new.project_number || ' "' || new.name || '" created', auth.uid());
    end if;
    insert into public.project_status_history (organization_id, project_id, from_status, to_status, note, changed_by)
      values (new.organization_id, new.id, null, new.status, 'Project created', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.project_status_history (organization_id, project_id, from_status, to_status, note, changed_by)
      values (new.organization_id, new.id, old.status, new.status,
              nullif(current_setting('app.status_note', true), ''), auth.uid());
  end if;

  if tg_op = 'UPDATE' and new.primary_client_id is distinct from old.primary_client_id then
    if new.primary_client_id is not null then
      insert into public.project_clients (organization_id, project_id, client_id, relationship, created_by)
        values (new.organization_id, new.id, new.primary_client_id, 'primary_owner', auth.uid())
        on conflict (project_id, client_id) do update set relationship = 'primary_owner';
      insert into public.client_activity (organization_id, client_id, project_id, activity_type, summary, created_by)
        values (new.organization_id, new.primary_client_id, new.id, 'system',
                'Linked as primary homeowner on project ' || new.project_number || ' "' || new.name || '"', auth.uid());
    end if;
    if old.primary_client_id is not null then
      if new.primary_client_id is null then
        -- Removing the primary homeowner unlinks them; it never deletes the client record.
        delete from public.project_clients
          where project_id = new.id and client_id = old.primary_client_id and relationship = 'primary_owner';
        insert into public.client_activity (organization_id, client_id, project_id, activity_type, summary, created_by)
          values (new.organization_id, old.primary_client_id, new.id, 'system',
                  'Removed as primary homeowner from project ' || new.project_number || ' "' || new.name || '"', auth.uid());
      else
        update public.project_clients set relationship = 'co_owner'
          where project_id = new.id and client_id = old.primary_client_id;
      end if;
    end if;
  end if;
  return new;
end;
$$;
