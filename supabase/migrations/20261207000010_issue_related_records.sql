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
