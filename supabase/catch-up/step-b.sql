-- Database catch-up, step B: run once in the Supabase SQL Editor (project supabase-fuchsia-island).
-- Applies two migrations that are in the repo but were never applied to production:
--   20261206000010_field_issues.sql           (issues reported from the field, assignee alerts)
--   20261207000010_issue_related_records.sql  (link issues to change orders and schedule activities, review requests)
-- Then re-applies the tenant-isolation rules (20270103 / 20270105) so the new tables and the recreated
-- issue policies follow the same company/project checks and signed-in-only access as everything else.
-- Safe to re-run. Tested against production in a rolled-back transaction on 2026-11-17.

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


-- Issue related records: change-order and schedule-activity links, plus lightweight review requests.
-- Additive only. Requires 20261206000010_field_issues.sql.

-- ============ Price pending: an unknown price is never treated as $0 ============
alter table public.change_orders add column if not exists price_pending boolean not null default false;

create or replace function public.change_orders_price_pending_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.price_adjustment_cents is distinct from old.price_adjustment_cents then
    new.price_pending := false;
  end if;
  if new.price_pending and new.status in ('awaiting_homeowner', 'approved') then
    raise exception 'Enter the price before sending this change order to the homeowner';
  end if;
  return new;
end;
$$;

drop trigger if exists change_orders_price_pending_guard on public.change_orders;
create trigger change_orders_price_pending_guard
  before insert or update on public.change_orders
  for each row execute function public.change_orders_price_pending_guard();

-- Deliberately confirms the current amount (including $0) as the price.
create or replace function public.confirm_change_order_price(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  update public.change_orders c set price_pending = false, updated_by = auth.uid()
  where c.id = p_id and c.price_pending and c.status in ('draft', 'internal_review');
  if not found then
    raise exception 'Change order not found, already priced, or no longer editable';
  end if;
end;
$$;
revoke all on function public.confirm_change_order_price(uuid) from public, anon;
grant execute on function public.confirm_change_order_price(uuid) to authenticated;

-- ============ Link tables ============
create table if not exists public.project_issue_change_orders (
  issue_id uuid not null references public.project_issues(id) on delete cascade,
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  created_from_issue boolean not null default false,
  client_request_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (issue_id, change_order_id)
);
create unique index if not exists project_issue_change_orders_request_idx
  on public.project_issue_change_orders (issue_id, client_request_id) where client_request_id is not null;
create index if not exists project_issue_change_orders_co_idx on public.project_issue_change_orders (change_order_id);

create table if not exists public.project_issue_schedule_activities (
  issue_id uuid not null references public.project_issues(id) on delete cascade,
  activity_id uuid not null references public.schedule_activities(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (issue_id, activity_id)
);
create index if not exists project_issue_schedule_activities_activity_idx on public.project_issue_schedule_activities (activity_id);

-- Reads follow the linked record's own visibility. Writes go only through the RPCs below.
alter table public.project_issue_change_orders enable row level security;
drop policy if exists project_issue_change_orders_select on public.project_issue_change_orders;
create policy project_issue_change_orders_select on public.project_issue_change_orders for select to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

alter table public.project_issue_schedule_activities enable row level security;
drop policy if exists project_issue_schedule_activities_select on public.project_issue_schedule_activities;
create policy project_issue_schedule_activities_select on public.project_issue_schedule_activities for select to authenticated
  using (public.can_view_project_internal(project_id) and public.is_feature_enabled(organization_id, 'schedule'));

revoke insert, update, delete on public.project_issue_change_orders from anon, authenticated;
revoke insert, update, delete on public.project_issue_schedule_activities from anon, authenticated;

-- ============ History event types ============
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
  'homeowner_comment', 'evidence_photo_added', 'returned_for_work',
  'change_order_draft_created', 'change_order_linked', 'change_order_unlinked',
  'schedule_activity_linked', 'schedule_activity_unlinked',
  'review_requested', 'review_responded'
));

-- Change-order entries are manager-only; link and review entries never reach homeowners.
drop policy if exists project_issue_events_select on public.project_issue_events;
create policy project_issue_events_select on public.project_issue_events for select using (
  exists (
    select 1 from public.project_issues pi
    where pi.id = project_issue_events.issue_id
      and (
        (public.can_view_project_internal(pi.project_id)
          and (project_issue_events.event_type not like 'change_order_%' or public.is_org_manager(pi.organization_id)))
        or (pi.walkthrough_id is not null and public.is_project_homeowner(pi.project_id)
          and project_issue_events.event_type not in (
            'change_order_draft_created', 'change_order_linked', 'change_order_unlinked',
            'schedule_activity_linked', 'schedule_activity_unlinked', 'review_requested', 'review_responded'))
      )
  )
);

-- ============ Helpers ============
create or replace function public.issue_for_change_order_link(p_issue uuid)
returns public.project_issues language plpgsql stable security definer set search_path = '' as $$
declare v_issue public.project_issues;
begin
  select * into v_issue from public.project_issues pi where pi.id = p_issue;
  if v_issue.id is null or auth.uid() is null
     or not public.can_view_project_internal(v_issue.project_id) or not public.is_org_manager(v_issue.organization_id) then
    raise exception 'Only an administrator or project manager on this project can link change orders' using errcode = '42501';
  end if;
  if not public.is_feature_enabled(v_issue.organization_id, 'change_orders') then
    raise exception 'Change orders are not enabled for this organization' using errcode = '42501';
  end if;
  return v_issue;
end;
$$;
revoke all on function public.issue_for_change_order_link(uuid) from public, anon, authenticated;

-- ============ Change-order draft from issue (atomic, retry-safe) ============
create or replace function public.create_change_order_from_issue(
  p_issue uuid,
  p_request uuid,
  p_title text,
  p_description text,
  p_reason text,
  p_requested_by text,
  p_price_cents bigint,
  p_schedule_days integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.project_issues;
  v_co uuid;
  v_uid uuid := auth.uid();
begin
  if p_request is null then raise exception 'Missing request id' using errcode = '22023'; end if;
  v_issue := public.issue_for_change_order_link(p_issue);
  -- Serializes concurrent retries of the same draft on this issue.
  perform 1 from public.project_issues pi where pi.id = p_issue for update;

  select l.change_order_id into v_co from public.project_issue_change_orders l
  where l.issue_id = p_issue and l.client_request_id = p_request;
  if v_co is not null then
    return jsonb_build_object('change_order_id', v_co, 'replayed', true);
  end if;

  if char_length(btrim(coalesce(p_title, ''))) not between 2 and 160 then
    raise exception 'Enter a title between 2 and 160 characters' using errcode = '22023';
  end if;
  if p_schedule_days is not null and p_schedule_days not between -365 and 3650 then
    raise exception 'Enter whole days between -365 and 3650' using errcode = '22023';
  end if;

  insert into public.change_orders (organization_id, project_id, number, title, description, reason, requested_by,
    schedule_impact_days, price_adjustment_cents, price_pending, created_by, updated_by)
  values (v_issue.organization_id, v_issue.project_id, 1, btrim(p_title),
    nullif(btrim(coalesce(p_description, '')), ''), nullif(btrim(coalesce(p_reason, '')), ''),
    nullif(btrim(coalesce(p_requested_by, '')), ''),
    p_schedule_days, coalesce(p_price_cents, 0), p_price_cents is null, v_uid, v_uid)
  returning id into v_co;

  insert into public.project_issue_change_orders (issue_id, change_order_id, organization_id, project_id,
    created_from_issue, client_request_id, created_by)
  values (p_issue, v_co, v_issue.organization_id, v_issue.project_id, true, p_request, v_uid);

  insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, to_value)
  values (v_issue.organization_id, p_issue, 'change_order_draft_created', v_uid, v_co::text);

  return jsonb_build_object('change_order_id', v_co, 'replayed', false);
end;
$$;
revoke all on function public.create_change_order_from_issue(uuid, uuid, text, text, text, text, bigint, integer) from public, anon;
grant execute on function public.create_change_order_from_issue(uuid, uuid, text, text, text, text, bigint, integer) to authenticated;

-- ============ Link / unlink existing change order ============
create or replace function public.link_issue_change_order(p_issue uuid, p_change_order uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.project_issues;
  v_co record;
  v_rows integer;
begin
  v_issue := public.issue_for_change_order_link(p_issue);
  select c.id, c.organization_id, c.project_id into v_co from public.change_orders c where c.id = p_change_order;
  if v_co.id is null or v_co.organization_id <> v_issue.organization_id or v_co.project_id <> v_issue.project_id then
    raise exception 'Choose a change order from this project' using errcode = '42501';
  end if;
  insert into public.project_issue_change_orders (issue_id, change_order_id, organization_id, project_id, created_by)
  values (p_issue, p_change_order, v_issue.organization_id, v_issue.project_id, auth.uid())
  on conflict (issue_id, change_order_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, to_value)
    values (v_issue.organization_id, p_issue, 'change_order_linked', auth.uid(), p_change_order::text);
  end if;
  return v_rows > 0;
end;
$$;
revoke all on function public.link_issue_change_order(uuid, uuid) from public, anon;
grant execute on function public.link_issue_change_order(uuid, uuid) to authenticated;

create or replace function public.unlink_issue_change_order(p_issue uuid, p_change_order uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.project_issues;
  v_rows integer;
begin
  v_issue := public.issue_for_change_order_link(p_issue);
  delete from public.project_issue_change_orders l where l.issue_id = p_issue and l.change_order_id = p_change_order;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value)
    values (v_issue.organization_id, p_issue, 'change_order_unlinked', auth.uid(), p_change_order::text);
  end if;
  return v_rows > 0;
end;
$$;
revoke all on function public.unlink_issue_change_order(uuid, uuid) from public, anon;
grant execute on function public.unlink_issue_change_order(uuid, uuid) to authenticated;

-- ============ Link / unlink schedule activity (no schedule fields are touched) ============
create or replace function public.issue_for_activity_link(p_issue uuid)
returns public.project_issues language plpgsql stable security definer set search_path = '' as $$
declare v_issue public.project_issues;
begin
  select * into v_issue from public.project_issues pi where pi.id = p_issue;
  if v_issue.id is null or auth.uid() is null
     or not public.can_view_project_internal(v_issue.project_id) or not public.is_org_staff(v_issue.organization_id) then
    raise exception 'Only builder staff on this project can link schedule activities' using errcode = '42501';
  end if;
  if not public.is_feature_enabled(v_issue.organization_id, 'schedule') then
    raise exception 'Scheduling is not enabled for this organization' using errcode = '42501';
  end if;
  return v_issue;
end;
$$;
revoke all on function public.issue_for_activity_link(uuid) from public, anon, authenticated;

create or replace function public.link_issue_schedule_activity(p_issue uuid, p_activity uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.project_issues;
  v_act record;
  v_rows integer;
begin
  v_issue := public.issue_for_activity_link(p_issue);
  select a.id, a.organization_id, a.project_id into v_act from public.schedule_activities a where a.id = p_activity;
  if v_act.id is null or v_act.organization_id <> v_issue.organization_id or v_act.project_id <> v_issue.project_id then
    raise exception 'Choose a schedule activity from this project' using errcode = '42501';
  end if;
  insert into public.project_issue_schedule_activities (issue_id, activity_id, organization_id, project_id, created_by)
  values (p_issue, p_activity, v_issue.organization_id, v_issue.project_id, auth.uid())
  on conflict (issue_id, activity_id) do nothing;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, to_value)
    values (v_issue.organization_id, p_issue, 'schedule_activity_linked', auth.uid(), p_activity::text);
  end if;
  return v_rows > 0;
end;
$$;
revoke all on function public.link_issue_schedule_activity(uuid, uuid) from public, anon;
grant execute on function public.link_issue_schedule_activity(uuid, uuid) to authenticated;

create or replace function public.unlink_issue_schedule_activity(p_issue uuid, p_activity uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.project_issues;
  v_rows integer;
begin
  v_issue := public.issue_for_activity_link(p_issue);
  delete from public.project_issue_schedule_activities l where l.issue_id = p_issue and l.activity_id = p_activity;
  get diagnostics v_rows = row_count;
  if v_rows > 0 then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value)
    values (v_issue.organization_id, p_issue, 'schedule_activity_unlinked', auth.uid(), p_activity::text);
  end if;
  return v_rows > 0;
end;
$$;
revoke all on function public.unlink_issue_schedule_activity(uuid, uuid) from public, anon;
grant execute on function public.unlink_issue_schedule_activity(uuid, uuid) to authenticated;

-- ============ Review requests (distinct from verification and financial approval) ============
create or replace function public.request_issue_review(p_issue uuid, p_reviewer uuid, p_question text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_issue public.project_issues;
  v_uid uuid := auth.uid();
  v_event uuid;
  v_question text := btrim(coalesce(p_question, ''));
begin
  select * into v_issue from public.project_issues pi where pi.id = p_issue;
  if v_issue.id is null or v_uid is null
     or not public.can_view_project_internal(v_issue.project_id) or not public.is_org_staff(v_issue.organization_id) then
    raise exception 'Only builder staff on this project can request a review' using errcode = '42501';
  end if;
  if p_reviewer = v_uid then
    raise exception 'Choose someone other than yourself' using errcode = '22023';
  end if;
  -- Eligibility requires existing project access; a review request never grants it.
  if not public.issue_assignee_eligible(v_issue.project_id, p_reviewer) then
    raise exception 'Choose a reviewer who already has access to this project' using errcode = '42501';
  end if;
  if char_length(v_question) not between 2 and 1000 then
    raise exception 'Enter a question between 2 and 1,000 characters' using errcode = '22023';
  end if;

  insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, to_value, details)
  values (v_issue.organization_id, p_issue, 'review_requested', v_uid, p_reviewer::text, v_question)
  returning id into v_event;

  insert into public.notifications (organization_id, user_id, title, body, link, project_id, kind, dedupe_key, action_required)
  values (v_issue.organization_id, p_reviewer, 'Review requested: ' || v_issue.item_label, left(v_question, 300),
    '/projects/' || v_issue.project_id || '/issues/' || p_issue, v_issue.project_id,
    'issue_review_requested', 'issue_review:' || v_event, true);

  return v_event;
end;
$$;
revoke all on function public.request_issue_review(uuid, uuid, text) from public, anon;
grant execute on function public.request_issue_review(uuid, uuid, text) to authenticated;

create or replace function public.respond_issue_review(p_request_event uuid, p_response text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_req public.project_issue_events;
  v_issue public.project_issues;
  v_uid uuid := auth.uid();
  v_event uuid;
  v_response text := btrim(coalesce(p_response, ''));
begin
  select * into v_req from public.project_issue_events e where e.id = p_request_event and e.event_type = 'review_requested' for update;
  if v_req.id is null or v_uid is null or v_req.to_value is distinct from v_uid::text then
    raise exception 'Only the requested reviewer can respond' using errcode = '42501';
  end if;
  select * into v_issue from public.project_issues pi where pi.id = v_req.issue_id;
  if not public.can_view_project_internal(v_issue.project_id) then
    raise exception 'You no longer have access to this project' using errcode = '42501';
  end if;
  if exists (select 1 from public.project_issue_events e where e.event_type = 'review_responded' and e.from_value = p_request_event::text) then
    raise exception 'This review request already has a response' using errcode = '40001';
  end if;
  if char_length(v_response) not between 1 and 2000 then
    raise exception 'Enter a response up to 2,000 characters' using errcode = '22023';
  end if;

  insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value, details)
  values (v_req.organization_id, v_req.issue_id, 'review_responded', v_uid, p_request_event::text, v_req.actor_id::text, v_response)
  returning id into v_event;

  update public.notifications n set acknowledged_at = now(), read_at = coalesce(n.read_at, now())
  where n.user_id = v_uid and n.dedupe_key = 'issue_review:' || p_request_event;

  if v_req.actor_id is not null then
    insert into public.notifications (organization_id, user_id, title, body, link, project_id, kind, dedupe_key)
    values (v_req.organization_id, v_req.actor_id, 'Review answered: ' || v_issue.item_label, left(v_response, 300),
      '/projects/' || v_issue.project_id || '/issues/' || v_issue.id, v_issue.project_id,
      'issue_review_answered', 'issue_review_answer:' || v_event);
  end if;

  return v_event;
end;
$$;
revoke all on function public.respond_issue_review(uuid, text) from public, anon;
grant execute on function public.respond_issue_review(uuid, text) to authenticated;


-- ═════════ Re-apply tenant isolation (from 20270103 and 20270105) ═════════
-- ───────── 1. Organization must match the project's organization ─────────

-- Stop before changing anything if existing data already breaks the rule.
do $$
declare
  t record;
  n bigint;
  bad text := '';
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join pg_class k on k.relname = c.table_name and k.relnamespace = 'public'::regnamespace and k.relkind = 'r'
    where c.table_schema = 'public' and c.column_name = 'project_id'
      and exists (select 1 from information_schema.columns o
                  where o.table_schema = 'public' and o.table_name = c.table_name and o.column_name = 'organization_id')
  loop
    execute format(
      'select count(*) from public.%I c join public.projects p on p.id = c.project_id where c.organization_id <> p.organization_id',
      t.table_name) into n;
    if n > 0 then bad := bad || format('%s (%s rows) ', t.table_name, n); end if;
  end loop;
  if bad <> '' then
    raise exception 'Rows whose organization differs from their project''s organization: %', bad;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_id_organization_id_key'
                 and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_id_organization_id_key unique (id, organization_id);
  end if;
end $$;

-- Add the composite key next to each existing project_id foreign key, with the same delete behaviour.
do $$
declare
  f record;
  cname text;
  on_delete text;
begin
  for f in
    select c.conrelid::regclass as tbl, k.relname as table_name, c.confdeltype as del
    from pg_constraint c
    join pg_class k on k.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.projects'::regclass
      and k.relnamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and a.attname = 'project_id'
      and exists (select 1 from pg_attribute o
                  where o.attrelid = c.conrelid and o.attname = 'organization_id' and not o.attisdropped)
  loop
    cname := left(f.table_name, 46) || '_project_org_fkey';
    continue when exists (select 1 from pg_constraint where conname = cname and conrelid = f.tbl);
    on_delete := case f.del
      when 'c' then 'on delete cascade'
      when 'r' then 'on delete restrict'
      when 'n' then 'on delete set null (project_id)'
      when 'd' then 'on delete set default (project_id)'
      else 'on delete no action'
    end;
    execute format(
      'alter table %s add constraint %I foreign key (project_id, organization_id) references public.projects (id, organization_id) %s not valid',
      f.tbl, cname, on_delete);
    execute format('alter table %s validate constraint %I', f.tbl, cname);
  end loop;
end $$;


-- The composite (project_id, organization_id) keys added in tenant_isolation_hardening fully cover the
-- old single-column project_id keys (same delete behaviour, and they also check the project exists).
-- Keeping both gave PostgREST two relationships to projects, so embeds like projects(...) failed
-- with PGRST201. Drop the old single-column key wherever the composite key exists.
do $$
declare f record;
begin
  for f in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_class k on k.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.projects'::regclass
      and k.relnamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and a.attname = 'project_id'
      and exists (select 1 from pg_constraint x
                  where x.conrelid = c.conrelid and x.contype = 'f'
                    and x.confrelid = 'public.projects'::regclass
                    and x.conname = left(k.relname, 46) || '_project_org_fkey'
                    and x.convalidated)
  loop
    execute format('alter table %s drop constraint %I', f.tbl, f.conname);
  end loop;
end $$;



-- ───────── 3. Policies apply to signed-in users only ─────────

do $$
declare
  p record;
begin
  for p in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public' and roles = array['public']::name[]
  loop
    execute format('alter policy %I on %I.%I to authenticated', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

notify pgrst, 'reload schema';
