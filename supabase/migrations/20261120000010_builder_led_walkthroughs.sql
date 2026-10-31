-- Builder-led walkthroughs: a single lead (homeowner by default, or one staff member)
-- owns the checklist. Staff can only take the lead before the homeowner has saved anything.

alter table public.walkthroughs
  add column if not exists conducted_by text not null default 'homeowner'
    check (conducted_by in ('homeowner', 'staff')),
  add column if not exists conducted_by_user uuid references auth.users(id) on delete set null;

alter table public.project_issues
  add column if not exists reported_source text not null default 'homeowner'
    check (reported_source in ('homeowner', 'staff'));

-- Ownership can only be changed by the checklist workflow RPCs.
create or replace function public.guard_walkthrough()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  v_system boolean := coalesce(current_setting('app.walkthrough_system', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    if not v_system and (new.conducted_by <> 'homeowner' or new.conducted_by_user is not null) then
      raise exception 'Walkthrough ownership is managed by the checklist workflow';
    end if;
    return new;
  end if;
  if old.status = 'submitted' and not v_system then
    raise exception 'A submitted walkthrough cannot be changed';
  end if;
  if new.status is distinct from old.status and not v_system then
    raise exception 'Walkthrough status is managed by the checklist workflow';
  end if;
  if (new.conducted_by is distinct from old.conducted_by or new.conducted_by_user is distinct from old.conducted_by_user)
     and not v_system then
    raise exception 'Walkthrough ownership is managed by the checklist workflow';
  end if;
  return new;
end;
$$;

drop trigger if exists walkthroughs_guard_insert on public.walkthroughs;
create trigger walkthroughs_guard_insert before insert on public.walkthroughs
  for each row execute function public.guard_walkthrough();

create or replace function public.is_walkthrough_lead(p_walkthrough uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.walkthroughs w
    where w.id = p_walkthrough
      and w.conducted_by = 'staff'
      and w.conducted_by_user = auth.uid()
      and public.can_view_project_internal(w.project_id)
      and coalesce(public.user_org_role(w.organization_id) in ('org_admin', 'project_manager', 'builder_staff'), false)
  );
$$;

create or replace function public.is_homeowner_walkthrough(p_walkthrough uuid)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select exists (
    select 1 from public.walkthroughs w
    where w.id = p_walkthrough
      and w.conducted_by = 'homeowner'
      and public.is_project_homeowner(w.project_id)
  );
$$;

-- Shared submission logic for both leads. Callers must authorize and lock the walkthrough first.
create or replace function public.finalize_walkthrough(p_walkthrough uuid, p_source text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  w record;
  v_uid uuid := auth.uid();
  v_unanswered integer;
  v_missing_notes integer;
  v_created integer := 0;
  v_project record;
  v_link text;
begin
  select * into w from public.walkthroughs where id = p_walkthrough;
  if w.status = 'submitted' then
    return jsonb_build_object('already_submitted', true, 'issues_created', 0);
  end if;

  select count(*) into v_unanswered
    from public.walkthrough_items i
    left join public.walkthrough_responses r on r.item_id = i.id
    where i.walkthrough_id = w.id and r.response is null;
  if v_unanswered > 0 then
    raise exception 'Please respond to every checklist item before submitting (% remaining)', v_unanswered;
  end if;

  select count(*) into v_missing_notes
    from public.walkthrough_responses r
    where r.walkthrough_id = w.id and r.response = 'needs_attention'
      and coalesce(btrim(r.draft_description), '') = '';
  if v_missing_notes > 0 then
    raise exception 'Please describe the issue for every item marked Needs Attention (% missing)', v_missing_notes;
  end if;

  with inserted as (
    insert into public.project_issues (
      organization_id, project_id, walkthrough_id, item_id, category, item_label,
      homeowner_description, reported_by, reported_at, reported_source
    )
    select w.organization_id, w.project_id, w.id, i.id, i.category, i.label,
           r.draft_description, v_uid, now(), p_source
    from public.walkthrough_responses r
    join public.walkthrough_items i on i.id = r.item_id
    where r.walkthrough_id = w.id and r.response = 'needs_attention'
    on conflict (item_id) do nothing
    returning id
  )
  select count(*) into v_created from inserted;

  insert into public.issue_attachments (
    organization_id, issue_id, attachment_kind, storage_path, file_name, mime_type, size_bytes, media_kind, uploaded_by, created_at
  )
  select a.organization_id, pi.id, 'original', a.storage_path, a.file_name, a.mime_type, a.size_bytes, a.media_kind, a.uploaded_by, a.created_at
  from public.walkthrough_attachments a
  join public.project_issues pi on pi.item_id = a.item_id
  where a.walkthrough_id = w.id
  on conflict (issue_id, storage_path) do nothing;

  perform set_config('app.walkthrough_system', 'on', true);
  update public.walkthroughs set status = 'submitted', submitted_by = v_uid, submitted_at = now() where id = w.id;
  perform set_config('app.walkthrough_system', '', true);

  select p.project_number, p.name, p.project_manager_id into v_project from public.projects p where p.id = w.project_id;
  v_link := '/projects/' || w.project_id::text || '/walkthroughs/' || w.id::text;

  insert into public.notifications (organization_id, user_id, title, body, link)
  select distinct w.organization_id, recipient,
         case when v_created > 0
           then v_created || ' issue' || case when v_created = 1 then '' else 's' end
                || case when p_source = 'staff' then ' recorded by builder on ' else ' reported on ' end
                || v_project.project_number
           else 'Walkthrough submitted for ' || v_project.project_number end,
         w.title || ' · ' || v_project.name,
         v_link
  from (
    select v_project.project_manager_id as recipient where v_project.project_manager_id is not null
    union
    select pm.user_id from public.project_members pm where pm.project_id = w.project_id and pm.project_role = 'project_manager'
    union
    select m.user_id from public.organization_memberships m
      where m.organization_id = w.organization_id and m.status = 'active' and m.role = 'org_admin'
        and v_project.project_manager_id is null
  ) recipients
  where recipient is not null
    and recipient is distinct from v_uid
    and exists (
      select 1 from public.organization_memberships m
      where m.organization_id = w.organization_id and m.user_id = recipient and m.status = 'active'
        and m.role in ('org_admin', 'project_manager', 'builder_staff')
    );

  return jsonb_build_object('already_submitted', false, 'issues_created', v_created);
end;
$$;

revoke execute on function public.finalize_walkthrough(uuid, text) from public, anon, authenticated;

-- Homeowner RPCs: unchanged behaviour, but refuse staff-led walkthroughs.
create or replace function public.save_walkthrough_response(p_item uuid, p_response public.walkthrough_response_value, p_description text)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item record;
  v_now timestamptz := now();
begin
  select i.id, i.organization_id, i.walkthrough_id, w.project_id, w.status, w.conducted_by
    into v_item
    from public.walkthrough_items i
    join public.walkthroughs w on w.id = i.walkthrough_id
    where i.id = p_item;
  if v_item.id is null or not public.is_project_homeowner(v_item.project_id) then
    raise exception 'Checklist item not found';
  end if;
  if v_item.conducted_by <> 'homeowner' then
    raise exception 'Your builder is conducting this walkthrough';
  end if;
  if v_item.status = 'submitted' then
    raise exception 'This walkthrough has already been submitted';
  end if;
  if p_description is not null and char_length(p_description) > 5000 then
    raise exception 'Issue descriptions are limited to 5,000 characters';
  end if;

  insert into public.walkthrough_responses (organization_id, walkthrough_id, item_id, response, draft_description, updated_by)
    values (v_item.organization_id, v_item.walkthrough_id, p_item, p_response, p_description, auth.uid())
    on conflict (item_id) do update
      set response = excluded.response,
          draft_description = excluded.draft_description,
          updated_by = excluded.updated_by;

  if v_item.status = 'draft' then
    perform set_config('app.walkthrough_system', 'on', true);
    update public.walkthroughs set status = 'in_progress' where id = v_item.walkthrough_id;
    perform set_config('app.walkthrough_system', '', true);
  end if;
  return v_now;
end;
$$;

create or replace function public.submit_walkthrough(p_walkthrough uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  w record;
begin
  select * into w from public.walkthroughs where id = p_walkthrough for update;
  if w.id is null or not public.is_project_homeowner(w.project_id) then
    raise exception 'Walkthrough not found';
  end if;
  if w.conducted_by <> 'homeowner' then
    raise exception 'Your builder is conducting this walkthrough';
  end if;
  return public.finalize_walkthrough(w.id, 'homeowner');
end;
$$;

-- Staff RPCs.
create or replace function public.start_staff_walkthrough(p_walkthrough uuid, p_take_over boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  w record;
  v_uid uuid := auth.uid();
begin
  select * into w from public.walkthroughs where id = p_walkthrough for update;
  if w.id is null
     or not public.is_feature_enabled(w.organization_id, 'walkthroughs')
     or not public.can_view_project_internal(w.project_id)
     or not coalesce(public.user_org_role(w.organization_id) in ('org_admin', 'project_manager', 'builder_staff'), false) then
    raise exception 'Walkthrough not found';
  end if;
  if w.status = 'submitted' then
    raise exception 'This walkthrough has already been submitted';
  end if;

  if w.conducted_by = 'staff' then
    if w.conducted_by_user = v_uid then
      return jsonb_build_object('resumed', true);
    end if;
    if not (p_take_over and public.is_org_manager(w.organization_id)) then
      raise exception 'Another team member is leading this walkthrough';
    end if;
  elsif exists (select 1 from public.walkthrough_responses r where r.walkthrough_id = w.id)
     or exists (select 1 from public.walkthrough_attachments a where a.walkthrough_id = w.id) then
    raise exception 'The homeowner has already started this walkthrough, so their responses cannot be replaced';
  end if;

  perform set_config('app.walkthrough_system', 'on', true);
  update public.walkthroughs
    set conducted_by = 'staff',
        conducted_by_user = v_uid,
        status = case when status = 'draft' then 'in_progress'::public.walkthrough_status else status end
    where id = w.id;
  perform set_config('app.walkthrough_system', '', true);
  return jsonb_build_object('resumed', false);
end;
$$;

create or replace function public.save_staff_walkthrough_response(p_item uuid, p_response public.walkthrough_response_value, p_description text)
returns timestamptz
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_item record;
  v_now timestamptz := now();
begin
  select i.id, i.organization_id, i.walkthrough_id, w.status
    into v_item
    from public.walkthrough_items i
    join public.walkthroughs w on w.id = i.walkthrough_id
    where i.id = p_item;
  if v_item.id is null or not public.is_walkthrough_lead(v_item.walkthrough_id) then
    raise exception 'You are not leading this walkthrough';
  end if;
  if v_item.status = 'submitted' then
    raise exception 'This walkthrough has already been submitted';
  end if;
  if p_description is not null and char_length(p_description) > 5000 then
    raise exception 'Issue descriptions are limited to 5,000 characters';
  end if;

  insert into public.walkthrough_responses (organization_id, walkthrough_id, item_id, response, draft_description, updated_by)
    values (v_item.organization_id, v_item.walkthrough_id, p_item, p_response, p_description, auth.uid())
    on conflict (item_id) do update
      set response = excluded.response,
          draft_description = excluded.draft_description,
          updated_by = excluded.updated_by;
  return v_now;
end;
$$;

create or replace function public.submit_staff_walkthrough(p_walkthrough uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  w record;
begin
  select * into w from public.walkthroughs where id = p_walkthrough for update;
  if w.id is null or not public.is_walkthrough_lead(w.id) then
    raise exception 'You are not leading this walkthrough';
  end if;
  return public.finalize_walkthrough(w.id, 'staff');
end;
$$;

grant execute on function public.start_staff_walkthrough(uuid, boolean) to authenticated;
grant execute on function public.save_staff_walkthrough_response(uuid, public.walkthrough_response_value, text) to authenticated;
grant execute on function public.submit_staff_walkthrough(uuid) to authenticated;

-- Draft attachments: the current lead may add/remove their own files.
drop policy if exists walkthrough_attachments_insert on public.walkthrough_attachments;
create policy walkthrough_attachments_insert on public.walkthrough_attachments
  for insert with check (
    uploaded_by = auth.uid()
    and storage_path like ('walkthroughs/' || walkthrough_id::text || '/' || item_id::text || '/%')
    and exists (select 1 from public.walkthroughs w where w.id = walkthrough_id and w.status <> 'submitted')
    and (public.is_homeowner_walkthrough(walkthrough_id) or public.is_walkthrough_lead(walkthrough_id))
  );

drop policy if exists walkthrough_attachments_delete on public.walkthrough_attachments;
create policy walkthrough_attachments_delete on public.walkthrough_attachments
  for delete using (
    uploaded_by = auth.uid()
    and exists (select 1 from public.walkthroughs w where w.id = walkthrough_id and w.status <> 'submitted')
    and (public.is_homeowner_walkthrough(walkthrough_id) or public.is_walkthrough_lead(walkthrough_id))
  );

-- Homeowners cannot read a staff lead's drafts until submission.
drop policy if exists walkthrough_attachments_select on public.walkthrough_attachments;
create policy walkthrough_attachments_select on public.walkthrough_attachments
  for select using (
    exists (
      select 1 from public.walkthroughs w
      where w.id = walkthrough_id
        and (public.can_view_project_internal(w.project_id)
          or (public.is_project_homeowner(w.project_id) and (w.conducted_by = 'homeowner' or w.status = 'submitted')))
    )
  );

drop policy if exists walkthrough_responses_select on public.walkthrough_responses;
create policy walkthrough_responses_select on public.walkthrough_responses
  for select using (
    exists (
      select 1 from public.walkthroughs w
      where w.id = walkthrough_id
        and (public.can_view_project_internal(w.project_id)
          or (public.is_project_homeowner(w.project_id) and (w.conducted_by = 'homeowner' or w.status = 'submitted')))
    )
  );

create or replace function public.can_upload_media_path(p_path text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w
      join public.walkthrough_items i on i.walkthrough_id = w.id and i.id = public.media_path_uuid(p_path, 3)
      where w.id = public.media_path_uuid(p_path, 2)
        and w.status <> 'submitted'
        and (public.is_homeowner_walkthrough(w.id) or public.is_walkthrough_lead(w.id))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and pi.status <> 'closed'
        and (public.can_view_project_internal(pi.project_id)
          or (split_part(p_path, '/', 3) = 'feedback'
              and public.is_project_homeowner(pi.project_id)
              and public.portal_contact_can(pi.project_id, 'validate_issues')))
    )
    when 'covers' then coalesce(public.is_org_manager(public.media_path_uuid(p_path, 2)), false)
    when 'daily-logs' then exists (
      select 1 from public.daily_logs l where l.id = public.media_path_uuid(p_path, 2)
        and l.status = 'draft'
        and public.is_org_staff(l.organization_id)
        and public.can_view_project_internal(l.project_id)
        and public.is_feature_enabled(l.organization_id, 'daily_logs')
    )
    else false
  end;
$$;

create or replace function public.can_view_media_path(p_path text)
returns boolean
language sql
stable security definer
set search_path to ''
as $$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w where w.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(w.project_id)
          or (public.is_project_homeowner(w.project_id) and (w.conducted_by = 'homeowner' or w.status = 'submitted')))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(pi.project_id) or public.is_project_homeowner(pi.project_id))
    )
    when 'covers' then
      coalesce(public.is_org_manager(public.media_path_uuid(p_path, 2)), false)
      or exists (
        select 1 from public.projects p where p.cover_image_path = p_path
          and (public.can_view_project_internal(p.id) or public.is_project_homeowner(p.id))
      )
    when 'daily-logs' then exists (
      select 1 from public.daily_logs l where l.id = public.media_path_uuid(p_path, 2)
        and public.is_org_staff(l.organization_id)
        and public.can_view_project_internal(l.project_id)
        and public.is_feature_enabled(l.organization_id, 'daily_logs')
    )
    else false
  end;
$$;
