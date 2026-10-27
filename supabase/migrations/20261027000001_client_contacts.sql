create or replace function public.validate_client_child_org()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_project uuid;
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id) then
    raise exception 'Client does not belong to this organization';
  end if;
  if tg_table_name = 'client_activity' then
    v_project := (to_jsonb(new) ->> 'project_id')::uuid;
    if v_project is not null
       and not exists (select 1 from public.projects p where p.id = v_project and p.organization_id = new.organization_id) then
      raise exception 'Project does not belong to this organization';
    end if;
  end if;
  return new;
end;
$$;

alter table public.client_contacts
  add column if not exists middle_name text,
  add column if not exists alternate_phone text,
  add column if not exists preferred_communication public.communication_method not null default 'email',
  add column if not exists archived_at timestamptz,
  add column if not exists portal_enabled boolean not null default false,
  add column if not exists portal_view_reports boolean not null default false,
  add column if not exists portal_validate_issues boolean not null default false,
  add column if not exists portal_acknowledge boolean not null default false,
  add column if not exists portal_sign boolean not null default false;

alter table public.client_contacts drop constraint if exists client_contacts_relationship_check;
alter table public.client_contacts add constraint client_contacts_relationship_check check (relationship in
  ('primary_owner', 'spouse', 'partner', 'co_owner', 'trustee', 'authorized_representative',
   'family', 'agent', 'attorney', 'property_manager', 'other'));
alter table public.client_contacts add constraint client_contacts_name_check
  check (char_length(btrim(first_name)) between 1 and 80 and char_length(btrim(last_name)) between 1 and 80);
alter table public.client_contacts add constraint client_contacts_email_check
  check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
alter table public.client_contacts add constraint client_contacts_primary_active_check
  check (not (is_primary and archived_at is not null));

create unique index if not exists client_contacts_one_primary
  on public.client_contacts (client_id) where is_primary and archived_at is null;
create index if not exists client_contacts_email_idx on public.client_contacts (organization_id, lower(email));

insert into public.client_contacts (organization_id, client_id, first_name, middle_name, last_name, relationship,
    email, phone, alternate_phone, preferred_communication, is_primary,
    portal_enabled, portal_view_reports, portal_validate_issues, portal_acknowledge, portal_sign)
select c.organization_id, c.id, c.first_name, c.middle_name, c.last_name, 'primary_owner',
       c.email, c.phone, c.alternate_phone, c.preferred_communication, true,
       true, true, true, true, true
from public.clients c
where not exists (select 1 from public.client_contacts cc where cc.client_id = c.id and cc.is_primary);

update public.portal_accounts pa set contact_id = cc.id
from public.client_contacts cc
where pa.contact_id is null and cc.client_id = pa.client_id and cc.is_primary and cc.archived_at is null;

create or replace function public.portal_contact_can(p_project uuid, p_permission text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_found boolean := false; v_allowed boolean := false; r record;
begin
  if auth.uid() is null then return false; end if;
  for r in
    select cc.id as contact_id, cc.archived_at, cc.portal_enabled, cc.portal_view_reports,
           cc.portal_validate_issues, cc.portal_acknowledge, cc.portal_sign
    from public.portal_project_access a
    join public.portal_accounts pa on pa.id = a.portal_account_id
    left join public.client_contacts cc on cc.id = pa.contact_id
    where a.project_id = p_project and pa.user_id = auth.uid()
  loop
    v_found := true;
    if r.contact_id is null then return true; end if;
    if r.archived_at is null and r.portal_enabled and (
         p_permission = 'portal'
      or (p_permission = 'view_reports' and r.portal_view_reports)
      or (p_permission = 'validate_issues' and r.portal_validate_issues)
      or (p_permission = 'acknowledge' and r.portal_acknowledge)
      or (p_permission = 'sign' and r.portal_sign)) then
      v_allowed := true;
    end if;
  end loop;
  return (not v_found) or v_allowed;
end;
$$;
grant execute on function public.portal_contact_can(uuid, text) to authenticated;

do $$
declare v_def text;
begin
  if to_regprocedure('public.is_project_homeowner_base(uuid)') is null then
    v_def := pg_get_functiondef('public.is_project_homeowner(uuid)'::regprocedure);
    v_def := replace(v_def, 'public.is_project_homeowner(', 'public.is_project_homeowner_base(');
    execute v_def;
  end if;
end $$;

create or replace function public.is_project_homeowner(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_project_homeowner_base(p_project) and public.portal_contact_can(p_project, 'portal')
$$;

create or replace function public.client_contacts_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_primary and old.archived_at is null then
      raise exception 'Choose another primary contact before removing this one';
    end if;
    if exists (select 1 from public.portal_accounts where contact_id = old.id) then
      raise exception 'This contact has portal history. Remove them instead of deleting the record.';
    end if;
    return old;
  end if;
  new.email := nullif(lower(btrim(coalesce(new.email, ''))), '');
  if tg_op = 'UPDATE' and old.is_primary and old.archived_at is null and new.archived_at is not null then
    raise exception 'Choose another primary contact before removing this one';
  end if;
  if new.archived_at is not null then
    new.portal_enabled := false;
    new.is_primary := false;
  end if;
  if not new.portal_enabled then
    new.portal_view_reports := false;
    new.portal_validate_issues := false;
    new.portal_acknowledge := false;
    new.portal_sign := false;
  end if;
  return new;
end;
$$;
drop trigger if exists client_contacts_guard on public.client_contacts;
create trigger client_contacts_guard before insert or update or delete on public.client_contacts
  for each row execute function public.client_contacts_guard();

create or replace function public.set_primary_client_contact(p_contact uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.client_contacts;
begin
  select * into c from public.client_contacts where id = p_contact for update;
  if c.id is null or not public.is_org_manager(c.organization_id) or not public.can_view_client(c.client_id) then
    raise exception 'Contact not found';
  end if;
  if c.archived_at is not null then raise exception 'Restore this contact before making them primary'; end if;
  update public.client_contacts set is_primary = false
    where client_id = c.client_id and is_primary and id <> c.id;
  update public.client_contacts set is_primary = true where id = c.id;
end;
$$;
grant execute on function public.set_primary_client_contact(uuid) to authenticated;

create or replace function public.portal_contact_action_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_perm text;
begin
  if tg_table_name = 'report_acknowledgments' then
    v_perm := case when new.decision = 'acknowledged' then 'acknowledge' else 'sign' end;
  elsif tg_table_name = 'warranty_claim_events' then
    if new.actor_role <> 'homeowner' or new.event_type not in ('accept_repair', 'reject_repair') then return new; end if;
    v_perm := 'validate_issues';
  elsif tg_table_name = 'project_issues' then
    if coalesce(public.user_org_role(new.organization_id)::text, '') <> 'client' then return new; end if;
    v_perm := 'validate_issues';
  end if;
  if not public.portal_contact_can(new.project_id, v_perm) then
    raise exception 'Your builder has not given you permission to do this. Contact your builder for access.';
  end if;
  return new;
end;
$$;
drop trigger if exists portal_contact_ack_guard on public.report_acknowledgments;
create trigger portal_contact_ack_guard before insert on public.report_acknowledgments
  for each row execute function public.portal_contact_action_guard();
drop trigger if exists portal_contact_claim_guard on public.warranty_claim_events;
create trigger portal_contact_claim_guard before insert on public.warranty_claim_events
  for each row execute function public.portal_contact_action_guard();
drop trigger if exists portal_contact_issue_guard on public.project_issues;
create trigger portal_contact_issue_guard before update on public.project_issues
  for each row execute function public.portal_contact_action_guard();

drop policy if exists walkthrough_reports_contact_permission on public.walkthrough_reports;
create policy walkthrough_reports_contact_permission on public.walkthrough_reports as restrictive
  for select to authenticated using (public.portal_contact_can(project_id, 'view_reports'));
