-- Field issues: staff-reported project issues that are not tied to a walkthrough checklist item.
-- Additive only. Existing walkthrough issues keep their homeowner confirmation workflow unchanged.
-- Field issues (walkthrough_id is null) follow Open -> In progress -> Ready for verification (resolved) -> Closed,
-- are closed or returned by an administrator / project manager, and are never visible to homeowners.

alter table public.project_issues
  alter column walkthrough_id drop not null,
  alter column item_id drop not null,
  add column if not exists location text,
  add column if not exists source_daily_log_id uuid references public.daily_logs(id) on delete restrict,
  add column if not exists source_walkthrough_id uuid references public.walkthroughs(id) on delete restrict,
  add column if not exists client_request_id uuid;

alter table public.project_issues
  drop constraint if exists project_issues_location_check,
  add constraint project_issues_location_check check (location is null or char_length(location) <= 120),
  drop constraint if exists project_issues_origin_check,
  add constraint project_issues_origin_check check (
    (walkthrough_id is null) = (item_id is null)
    and (walkthrough_id is not null or reported_source = 'staff')
    and (walkthrough_id is null or (source_daily_log_id is null and source_walkthrough_id is null))
    and (source_daily_log_id is null or source_walkthrough_id is null)
  );

create unique index if not exists project_issues_client_request_idx
  on public.project_issues (organization_id, client_request_id) where client_request_id is not null;
create index if not exists project_issues_source_daily_log_idx on public.project_issues (source_daily_log_id) where source_daily_log_id is not null;
create index if not exists project_issues_source_walkthrough_idx on public.project_issues (source_walkthrough_id) where source_walkthrough_id is not null;

-- History: a reviewer returning work is its own event so the reason is kept next to the prior resolution.
do $$
declare v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.project_issue_events'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%event_type%'
  loop
    execute format('alter table public.project_issue_events drop constraint %I', v_name);
  end loop;
end $$;

alter table public.project_issue_events add constraint project_issue_events_event_type_check check (event_type in (
  'reported', 'status_changed', 'assigned', 'repair_recorded', 'priority_changed', 'due_date_changed',
  'builder_approved', 'homeowner_accepted', 'homeowner_rejected', 'repair_photo_added', 'builder_reply',
  'homeowner_comment', 'evidence_photo_added', 'returned_for_work'
));

-- Eligible assignee: active builder staff who can already see the project. Assignment never grants access.
create or replace function public.issue_assignee_eligible(p_project uuid, p_user uuid)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.projects p
    join public.organization_memberships m on m.organization_id = p.organization_id and m.user_id = p_user and m.status = 'active'
    where p.id = p_project
      and (
        m.role in ('org_admin', 'project_manager')
        or (m.role = 'builder_staff'
            and (p.project_manager_id = p_user
                 or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = p_user)))
      )
  );
$$;

create or replace function public.guard_project_issue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_system boolean := coalesce(current_setting('app.issue_homeowner_validation', true), '') = 'on';
  v_review boolean := coalesce(current_setting('app.issue_field_review', true), '') = 'on';
  v_field boolean;
begin
  if tg_op = 'DELETE' then
    raise exception 'Reported issues cannot be deleted';
  end if;

  if new.homeowner_description is distinct from old.homeowner_description
     or new.category is distinct from old.category
     or new.item_label is distinct from old.item_label
     or new.reported_by is distinct from old.reported_by
     or new.reported_at is distinct from old.reported_at
     or new.walkthrough_id is distinct from old.walkthrough_id
     or new.item_id is distinct from old.item_id
     or new.project_id is distinct from old.project_id
     or new.organization_id is distinct from old.organization_id
     or new.source_daily_log_id is distinct from old.source_daily_log_id
     or new.source_walkthrough_id is distinct from old.source_walkthrough_id
     or new.client_request_id is distinct from old.client_request_id
     or new.reported_source is distinct from old.reported_source then
    raise exception 'The original report cannot be modified';
  end if;

  v_field := new.walkthrough_id is null;

  if v_field then
    if old.status = 'closed' then
      raise exception 'Closed issues cannot be changed';
    end if;
    if v_review then
      return new;
    end if;
    if new.status = 'closed' then
      raise exception 'An administrator or project manager closes the issue after verifying the work';
    end if;
    if old.status = 'resolved' and new.status in ('open', 'in_progress') then
      raise exception 'Use Return for more work and give a reason';
    end if;
    if new.status = 'resolved' and old.status <> 'resolved' and coalesce(btrim(new.corrective_action), '') = '' then
      raise exception 'Describe the work completed before marking the issue ready for verification';
    end if;
    if new.builder_approved_at is distinct from old.builder_approved_at or new.builder_approved_by is distinct from old.builder_approved_by
       or new.homeowner_validation is distinct from old.homeowner_validation
       or new.homeowner_validation_note is distinct from old.homeowner_validation_note
       or new.homeowner_validated_by is distinct from old.homeowner_validated_by
       or new.homeowner_validated_at is distinct from old.homeowner_validated_at then
      raise exception 'Verify this issue with Close issue or Return for more work';
    end if;
    if new.responsible_user_id is not null and new.responsible_user_id is distinct from old.responsible_user_id
       and not public.issue_assignee_eligible(new.project_id, new.responsible_user_id) then
      raise exception 'Responsible person must be active builder staff with access to this project';
    end if;
    return new;
  end if;

  if not v_system then
    if new.homeowner_validation is distinct from old.homeowner_validation
       or new.homeowner_validation_note is distinct from old.homeowner_validation_note
       or new.homeowner_validated_by is distinct from old.homeowner_validated_by
       or new.homeowner_validated_at is distinct from old.homeowner_validated_at then
      raise exception 'Only the homeowner can validate a repair';
    end if;
    if new.status = 'closed' and old.status <> 'closed' then
      raise exception 'Issues close when the homeowner confirms the repair';
    end if;
    if old.status = 'closed' then
      raise exception 'Closed issues cannot be changed';
    end if;

    if new.responsible_user_id is not null and new.responsible_user_id is distinct from old.responsible_user_id
       and not exists (
         select 1 from public.organization_memberships m
         where m.organization_id = new.organization_id and m.user_id = new.responsible_user_id
           and m.status = 'active' and m.role in ('org_admin', 'project_manager', 'builder_staff')
       ) then
      raise exception 'Responsible person must be active builder staff';
    end if;

    if new.status <> 'resolved' then
      new.builder_approved_by := null;
      new.builder_approved_at := null;
    end if;

    if new.builder_approved_at is distinct from old.builder_approved_at and new.builder_approved_at is not null then
      if not public.is_org_manager(new.organization_id) then
        raise exception 'Only an administrator or project manager can approve a repair';
      end if;
      if new.status <> 'resolved' then
        raise exception 'Mark the repair complete before approving it';
      end if;
      new.builder_approved_by := auth.uid();
      new.builder_approved_at := now();
      new.homeowner_validation := 'pending';
    end if;
  end if;
  return new;
end;
$$;

-- Assignment notifications through the existing in-app notifications table (no external email).
create or replace function public.notify_issue_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_number text;
begin
  if new.responsible_user_id is null
     or (tg_op = 'UPDATE' and new.responsible_user_id is not distinct from old.responsible_user_id)
     or new.responsible_user_id = auth.uid() then
    return new;
  end if;
  select p.project_number into v_number from public.projects p where p.id = new.project_id;
  insert into public.notifications (organization_id, user_id, title, body, link, project_id, kind, dedupe_key)
  values (
    new.organization_id, new.responsible_user_id,
    'Issue assigned to you' || coalesce(' · ' || v_number, ''),
    left(new.item_label, 200),
    '/projects/' || new.project_id::text || '/issues/' || new.id::text,
    new.project_id,
    'issue_assigned',
    'issue-assigned:' || new.id::text || ':' || new.responsible_user_id::text || ':' || extract(epoch from clock_timestamp())::text
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists project_issues_notify_assignee on public.project_issues;
create trigger project_issues_notify_assignee
  after insert or update of responsible_user_id on public.project_issues
  for each row when (new.walkthrough_id is null)
  execute function public.notify_issue_assignee();

-- Create a field issue. Retries with the same request id return the original issue instead of a duplicate.
create or replace function public.report_field_issue(
  p_request_id uuid,
  p_project uuid,
  p_title text,
  p_description text,
  p_category text,
  p_location text,
  p_priority text,
  p_due_date date,
  p_responsible uuid,
  p_source_daily_log uuid,
  p_source_walkthrough uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_existing record;
  v_id uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_description text := btrim(coalesce(p_description, ''));
  v_category text := coalesce(nullif(btrim(coalesce(p_category, '')), ''), 'General');
  v_location text := nullif(btrim(coalesce(p_location, '')), '');
  v_priority text := coalesce(nullif(p_priority, ''), 'normal');
begin
  if v_uid is null then
    raise exception 'Sign in again to report an issue' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'Missing request id';
  end if;

  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null or not public.is_org_staff(v_org) or not public.can_view_project_internal(p_project) then
    raise exception 'Project not found or you do not have access' using errcode = '42501';
  end if;
  if not public.is_feature_enabled(v_org, 'issues') then
    raise exception 'Issues are turned off for this organization';
  end if;

  select id, project_id, reported_by into v_existing
  from public.project_issues where organization_id = v_org and client_request_id = p_request_id;
  if found then
    if v_existing.project_id <> p_project or v_existing.reported_by <> v_uid then
      raise exception 'This request was already used for a different issue';
    end if;
    return jsonb_build_object('id', v_existing.id, 'replayed', true);
  end if;

  if char_length(v_title) < 2 or char_length(v_title) > 160 then
    raise exception 'Enter a title between 2 and 160 characters';
  end if;
  if char_length(v_description) < 1 or char_length(v_description) > 5000 then
    raise exception 'Describe the issue (up to 5,000 characters)';
  end if;
  if char_length(v_category) > 80 then
    raise exception 'Categories are limited to 80 characters';
  end if;
  if v_location is not null and char_length(v_location) > 120 then
    raise exception 'Locations are limited to 120 characters';
  end if;
  if v_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Choose a valid priority';
  end if;
  if p_responsible is not null and not public.issue_assignee_eligible(p_project, p_responsible) then
    raise exception 'Responsible person must be active builder staff with access to this project';
  end if;
  if p_source_daily_log is not null and p_source_walkthrough is not null then
    raise exception 'Link the issue to one source record';
  end if;
  if p_source_daily_log is not null and not exists (
    select 1 from public.daily_logs l where l.id = p_source_daily_log and l.project_id = p_project and l.organization_id = v_org
  ) then
    raise exception 'That daily log is not part of this project';
  end if;
  if p_source_walkthrough is not null and not exists (
    select 1 from public.walkthroughs w where w.id = p_source_walkthrough and w.project_id = p_project and w.organization_id = v_org
  ) then
    raise exception 'That walkthrough is not part of this project';
  end if;

  begin
    insert into public.project_issues (
      organization_id, project_id, walkthrough_id, item_id, category, item_label, homeowner_description,
      reported_by, reported_source, priority, due_date, responsible_user_id, location,
      source_daily_log_id, source_walkthrough_id, client_request_id
    ) values (
      v_org, p_project, null, null, v_category, v_title, v_description,
      v_uid, 'staff', v_priority, p_due_date, p_responsible, v_location,
      p_source_daily_log, p_source_walkthrough, p_request_id
    )
    returning id into v_id;
  exception when unique_violation then
    select id into v_id from public.project_issues where organization_id = v_org and client_request_id = p_request_id;
    return jsonb_build_object('id', v_id, 'replayed', true);
  end;

  if p_responsible is not null then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value)
    values (v_org, v_id, 'assigned', v_uid, null, p_responsible::text);
  end if;

  return jsonb_build_object('id', v_id, 'replayed', false);
end;
$$;

-- Close or return a field issue that is ready for verification.
create or replace function public.review_field_issue(
  p_issue uuid,
  p_decision text,
  p_reason text,
  p_expected_updated_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v record;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_uid is null then
    raise exception 'Sign in again to review this issue' using errcode = '42501';
  end if;
  if p_decision not in ('close', 'return') then
    raise exception 'Choose Close issue or Return for more work';
  end if;

  select * into v from public.project_issues where id = p_issue for update;
  if not found or not public.can_view_project_internal(v.project_id) or not public.issue_feature_visible(v.organization_id, v.id) then
    raise exception 'Issue not found or you do not have access' using errcode = '42501';
  end if;
  if not public.is_org_manager(v.organization_id) then
    raise exception 'Only an administrator or project manager can verify issues' using errcode = '42501';
  end if;
  if v.walkthrough_id is not null then
    raise exception 'Walkthrough issues are confirmed by the homeowner';
  end if;
  if p_decision = 'close' and v.status = 'closed' then
    return jsonb_build_object('status', 'closed', 'replayed', true, 'updated_at', v.updated_at);
  end if;
  if v.status <> 'resolved' then
    raise exception 'Only issues that are ready for verification can be reviewed';
  end if;
  if p_expected_updated_at is not null and v.updated_at <> p_expected_updated_at then
    raise exception 'This issue changed since you opened it. Reload to see the latest before reviewing.' using errcode = '40001';
  end if;
  if p_decision = 'return' and (v_reason is null or char_length(v_reason) > 2000) then
    raise exception 'Give a reason (up to 2,000 characters) for returning the issue';
  end if;

  perform set_config('app.issue_field_review', 'on', true);
  if p_decision = 'close' then
    update public.project_issues
      set status = 'closed', builder_approved_by = v_uid, builder_approved_at = now()
      where id = v.id
      returning * into v;
  else
    update public.project_issues set status = 'in_progress' where id = v.id returning * into v;
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value, details)
    values (v.organization_id, v.id, 'returned_for_work', v_uid, 'resolved', 'in_progress', v_reason);
  end if;
  perform set_config('app.issue_field_review', '', true);

  return jsonb_build_object('status', v.status, 'replayed', false, 'updated_at', v.updated_at);
end;
$$;

revoke all on function public.report_field_issue(uuid, uuid, text, text, text, text, text, date, uuid, uuid, uuid) from public, anon;
grant execute on function public.report_field_issue(uuid, uuid, text, text, text, text, text, date, uuid, uuid, uuid) to authenticated;
revoke all on function public.review_field_issue(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.review_field_issue(uuid, text, text, timestamptz) to authenticated;
revoke all on function public.issue_assignee_eligible(uuid, uuid) from public, anon;
grant execute on function public.issue_assignee_eligible(uuid, uuid) to authenticated;

-- Homeowners only ever see walkthrough issues; field issues stay internal.
drop policy if exists project_issues_select on public.project_issues;
create policy project_issues_select on public.project_issues for select using (
  public.can_view_project_internal(project_id)
  or (walkthrough_id is not null and public.is_project_homeowner(project_id))
);

drop policy if exists issue_attachments_select on public.issue_attachments;
create policy issue_attachments_select on public.issue_attachments for select using (
  exists (
    select 1 from public.project_issues pi
    where pi.id = issue_attachments.issue_id
      and (public.can_view_project_internal(pi.project_id)
           or (pi.walkthrough_id is not null and public.is_project_homeowner(pi.project_id)))
  )
);

drop policy if exists project_issue_events_select on public.project_issue_events;
create policy project_issue_events_select on public.project_issue_events for select using (
  exists (
    select 1 from public.project_issues pi
    where pi.id = project_issue_events.issue_id
      and (public.can_view_project_internal(pi.project_id)
           or (pi.walkthrough_id is not null and public.is_project_homeowner(pi.project_id)))
  )
);

drop policy if exists project_issue_notes_homeowner_select on public.project_issue_notes;
create policy project_issue_notes_homeowner_select on public.project_issue_notes for select using (
  visibility = 'shared'
  and exists (
    select 1 from public.project_issues pi
    where pi.id = project_issue_notes.issue_id and pi.walkthrough_id is not null and public.is_project_homeowner(pi.project_id)
  )
);

-- The reporter attaches original photos to a field issue right after creating it.
drop policy if exists issue_attachments_field_original_insert on public.issue_attachments;
create policy issue_attachments_field_original_insert on public.issue_attachments for insert to authenticated with check (
  attachment_kind = 'original'
  and uploaded_by = auth.uid()
  and note_id is null
  and exists (
    select 1 from public.project_issues pi
    where pi.id = issue_attachments.issue_id
      and pi.organization_id = issue_attachments.organization_id
      and pi.walkthrough_id is null
      and pi.reported_by = auth.uid()
      and pi.status <> 'closed'
      and public.can_view_project_internal(pi.project_id)
  )
);

create or replace function public.guard_issue_attachment_paths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.project_issues pi where pi.id = new.issue_id and pi.organization_id = new.organization_id) then
    raise exception 'Issue does not belong to this organization';
  end if;
  if new.attachment_kind = 'repair' and new.storage_path not like ('issues/' || new.issue_id::text || '/%') then
    raise exception 'Invalid repair photo path';
  end if;
  if new.attachment_kind = 'feedback' and new.storage_path not like ('issues/' || new.issue_id::text || '/feedback/%') then
    raise exception 'Invalid photo path';
  end if;
  if new.attachment_kind = 'supplemental' and new.storage_path not like ('issues/' || new.issue_id::text || '/supplemental/%') then
    raise exception 'Invalid supplemental photo path';
  end if;
  if new.attachment_kind = 'original'
     and exists (select 1 from public.project_issues pi where pi.id = new.issue_id and pi.walkthrough_id is null)
     and new.storage_path not like ('issues/' || new.issue_id::text || '/original/%') then
    raise exception 'Invalid issue photo path';
  end if;
  return new;
end;
$$;

-- Storage access: homeowners can only reach media for walkthrough issues.
create or replace function public.can_view_media_path(p_path text)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w where w.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(w.project_id)
          or (public.is_project_homeowner(w.project_id) and (w.conducted_by = 'homeowner' or w.status = 'submitted')))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(pi.project_id)
          or (pi.walkthrough_id is not null and public.is_project_homeowner(pi.project_id)))
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

create or replace function public.can_upload_media_path(p_path text)
returns boolean
language sql
stable security definer
set search_path = ''
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
              and pi.walkthrough_id is not null
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
