-- Project completion readiness gate.
-- Additive only: two audit tables, an authoritative blocker evaluation, a single completion RPC,
-- a guard trigger that closes every other path to "completed", and exception resolution.
-- Projects already completed are untouched; the gate applies prospectively.

create table public.project_completion_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null unique references public.projects(id) on delete restrict,
  outcome text not null check (outcome in ('ready', 'with_exceptions')),
  from_status public.project_status not null,
  completion_date date not null,
  assessment jsonb not null,
  blocker_count integer not null check (blocker_count >= 0),
  exception_count integer not null check (exception_count >= 0),
  note text check (note is null or char_length(note) <= 500),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  check ((outcome = 'ready') = (exception_count = 0))
);

create table public.project_completion_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  review_id uuid not null references public.project_completion_reviews(id) on delete restrict,
  requirement_key text not null check (requirement_key ~ '^[a-z_]{2,40}$'),
  requirement_label text not null,
  requirement_detail text,
  reason text not null check (char_length(btrim(reason)) between 3 and 200),
  justification text not null check (char_length(btrim(justification)) between 20 and 2000),
  follow_up_user_id uuid not null references auth.users(id) on delete restrict,
  target_resolution_date date,
  evidence_reference text check (evidence_reference is null or char_length(evidence_reference) <= 500),
  approved_by uuid not null references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (resolution_note is null or char_length(btrim(resolution_note)) between 10 and 2000),
  unique (review_id, requirement_key),
  check (status = 'open' or (resolved_at is not null and resolution_note is not null))
);
create index project_completion_exceptions_project_idx on public.project_completion_exceptions (project_id, status);

alter table public.project_completion_reviews enable row level security;
alter table public.project_completion_exceptions enable row level security;
create policy completion_reviews_select on public.project_completion_reviews for select to authenticated
  using (public.is_org_staff(organization_id));
create policy completion_exceptions_select on public.project_completion_exceptions for select to authenticated
  using (public.is_org_staff(organization_id));
-- Writes happen only through the security-definer functions below.
revoke insert, update, delete on public.project_completion_reviews from anon, authenticated;
revoke insert, update, delete on public.project_completion_exceptions from anon, authenticated;

-- Authoritative blocking rules. Mirrors lib/completion-readiness.ts (keys must stay in sync).
create or replace function public.project_completion_blockers(p_project uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_out jsonb := '[]'::jsonb;
  v_n integer;
  v_has_final boolean;
  v_signoff text;
begin
  select organization_id into v_org from public.projects where id = p_project;
  if v_org is null or not public.is_org_staff(v_org) then
    raise exception 'Project not found or access denied';
  end if;

  if public.is_feature_enabled(v_org, 'schedule') then
    select count(*) into v_n from public.schedule_activities where project_id = p_project and status <> 'skipped';
    if v_n = 0 then
      v_out := v_out || jsonb_build_object('key', 'schedule_recorded', 'label', 'Construction schedule',
        'detail', 'No construction schedule is recorded for this project.', 'overridable', true);
    else
      select count(*) into v_n from public.schedule_activities
        where project_id = p_project and status not in ('completed', 'skipped') and activity_type <> 'inspection';
      if v_n > 0 then
        v_out := v_out || jsonb_build_object('key', 'schedule_activities', 'label', 'Construction milestones',
          'detail', v_n || ' schedule ' || case when v_n = 1 then 'activity is' else 'activities are' end || ' not completed.',
          'overridable', true);
      end if;
    end if;
  end if;

  -- Inspections can never be waived by a software override; complete or mark them not applicable in the schedule.
  select count(*) into v_n from public.schedule_activities
    where project_id = p_project and activity_type = 'inspection' and status not in ('completed', 'skipped');
  if v_n > 0 then
    v_out := v_out || jsonb_build_object('key', 'inspections', 'label', 'Inspections',
      'detail', v_n || ' inspection ' || case when v_n = 1 then 'activity is' else 'activities are' end || ' not recorded as passed.',
      'overridable', false);
  end if;

  select count(*) into v_n from public.project_issues where project_id = p_project and status in ('open', 'in_progress');
  if v_n > 0 then
    v_out := v_out || jsonb_build_object('key', 'punch_list', 'label', 'Punch list',
      'detail', v_n || ' punch-list ' || case when v_n = 1 then 'item is' else 'items are' end || ' still open.',
      'overridable', true);
  end if;

  if public.is_feature_enabled(v_org, 'walkthroughs') then
    select exists (select 1 from public.walkthroughs
                    where project_id = p_project and walkthrough_type = 'final' and status = 'submitted')
      into v_has_final;
    if not v_has_final then
      v_out := v_out || jsonb_build_object('key', 'final_walkthrough', 'label', 'Final walkthrough',
        'detail', 'No submitted final walkthrough is recorded.', 'overridable', true);
    else
      select s.decision into v_signoff
        from public.report_builder_signoffs s
        join public.walkthrough_reports r on r.id = s.report_id
        join public.walkthroughs w on w.id = r.walkthrough_id
       where s.project_id = p_project and w.walkthrough_type = 'final'
       order by s.created_at desc limit 1;
      if v_signoff is distinct from 'verified' then
        v_out := v_out || jsonb_build_object('key', 'builder_signoff', 'label', 'Builder sign-off',
          'detail', case when v_signoff = 'rejected' then 'The latest builder review of the final walkthrough report was rejected.'
                         else 'The final walkthrough report has no builder sign-off.' end,
          'overridable', true);
      end if;
    end if;
  end if;

  if not exists (select 1 from public.project_clients where project_id = p_project) then
    v_out := v_out || jsonb_build_object('key', 'homeowner_linked', 'label', 'Homeowner handover',
      'detail', 'No homeowner is linked to receive the handover.', 'overridable', true);
  end if;

  return v_out;
end;
$$;
revoke execute on function public.project_completion_blockers(uuid) from public, anon;
grant execute on function public.project_completion_blockers(uuid) to authenticated;

-- The only supported way to move a project to Completed.
create or replace function public.complete_project(
  p_project uuid,
  p_completion_date date,
  p_note text default null,
  p_exceptions jsonb default '[]'::jsonb
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.projects;
  v_blockers jsonb;
  v_blocked text;
  v_review uuid;
  v_count integer;
  b jsonb;
  e jsonb;
begin
  select * into p from public.projects where id = p_project for update;
  if p.id is null or not public.is_org_manager(p.organization_id) then
    raise exception 'Project not found or access denied';
  end if;
  if p.status = 'completed' or exists (select 1 from public.project_completion_reviews where project_id = p_project) then
    raise exception 'This project has already been completed';
  end if;
  if not public.project_status_transition_allowed(p.status, 'completed') then
    raise exception 'A % project cannot be completed directly', p.status;
  end if;
  if p_completion_date is null or p_completion_date > current_date then
    raise exception 'Enter the actual completion date; it cannot be in the future';
  end if;
  if p_exceptions is null or jsonb_typeof(p_exceptions) <> 'array' then
    raise exception 'Invalid exception list';
  end if;

  v_blockers := public.project_completion_blockers(p_project);

  select string_agg(x ->> 'label', ', ') into v_blocked
    from jsonb_array_elements(v_blockers) x where not (x ->> 'overridable')::boolean;
  if v_blocked is not null then
    raise exception 'Completion is blocked by requirements that cannot be waived: %', v_blocked;
  end if;

  if jsonb_array_length(p_exceptions) > 0 and not public.is_org_admin(p.organization_id) then
    raise exception 'Only an administrator can approve completion exceptions';
  end if;
  if (select count(distinct x ->> 'key') from jsonb_array_elements(p_exceptions) x) <> jsonb_array_length(p_exceptions) then
    raise exception 'Each requirement can only have one exception';
  end if;

  select string_agg(x ->> 'label', ', ') into v_blocked
    from jsonb_array_elements(v_blockers) x
   where not exists (select 1 from jsonb_array_elements(p_exceptions) y where y ->> 'key' = x ->> 'key');
  if v_blocked is not null then
    raise exception 'Requirements not satisfied: %', v_blocked;
  end if;
  if exists (select 1 from jsonb_array_elements(p_exceptions) y
              where not exists (select 1 from jsonb_array_elements(v_blockers) x where x ->> 'key' = y ->> 'key')) then
    raise exception 'Readiness changed since the review was opened. Review the requirements again.';
  end if;

  for e in select * from jsonb_array_elements(p_exceptions) loop
    if char_length(btrim(coalesce(e ->> 'reason', ''))) < 3
       or char_length(btrim(coalesce(e ->> 'justification', ''))) < 20
       or lower(btrim(e ->> 'justification')) in ('n/a', 'na', 'skip', 'none', 'not applicable') then
      raise exception 'Each exception needs a reason and a substantive justification';
    end if;
    if not exists (select 1 from public.organization_memberships m
                    where m.organization_id = p.organization_id and m.status = 'active'
                      and m.role in ('org_admin', 'project_manager', 'builder_staff')
                      and m.user_id = nullif(e ->> 'follow_up_user_id', '')::uuid) then
      raise exception 'Each exception needs an active team member responsible for follow-up';
    end if;
    if nullif(e ->> 'target_resolution_date', '')::date < p_completion_date then
      raise exception 'Target resolution dates cannot be before the completion date';
    end if;
  end loop;

  v_count := jsonb_array_length(p_exceptions);
  insert into public.project_completion_reviews (organization_id, project_id, outcome, from_status, completion_date,
                                                 assessment, blocker_count, exception_count, note, approved_by)
    values (p.organization_id, p.id, case when v_count = 0 then 'ready' else 'with_exceptions' end, p.status,
            p_completion_date,
            jsonb_build_object('rules_version', 1, 'evaluated_at', now(), 'blockers', v_blockers),
            jsonb_array_length(v_blockers), v_count, nullif(left(btrim(coalesce(p_note, '')), 500), ''), auth.uid())
    returning id into v_review;

  for b in select * from jsonb_array_elements(v_blockers) loop
    select y into e from jsonb_array_elements(p_exceptions) y where y ->> 'key' = b ->> 'key';
    insert into public.project_completion_exceptions (organization_id, project_id, review_id, requirement_key,
        requirement_label, requirement_detail, reason, justification, follow_up_user_id, target_resolution_date,
        evidence_reference, approved_by)
      values (p.organization_id, p.id, v_review, b ->> 'key', b ->> 'label', b ->> 'detail',
              btrim(e ->> 'reason'), btrim(e ->> 'justification'), (e ->> 'follow_up_user_id')::uuid,
              nullif(e ->> 'target_resolution_date', '')::date,
              nullif(left(btrim(coalesce(e ->> 'evidence_reference', '')), 500), ''), auth.uid());
  end loop;

  perform set_config('app.status_note',
    coalesce(nullif(left(btrim(coalesce(p_note, '')), 500), ''),
             case when v_count = 0 then 'Completed after readiness review'
                  else 'Completed with ' || v_count || ' approved ' || case when v_count = 1 then 'exception' else 'exceptions' end end),
    true);
  perform set_config('app.completion_review', p_project::text, true);
  update public.projects
     set status = 'completed', completion_date = p_completion_date, updated_by = auth.uid()
   where id = p_project;
  perform set_config('app.completion_review', '', true);
  return v_review;
end;
$$;
revoke execute on function public.complete_project(uuid, date, text, jsonb) from public, anon;
grant execute on function public.complete_project(uuid, date, text, jsonb) to authenticated;

-- Blocks every other route (change_project_status, direct updates, scripts) from completing a project.
create or replace function public.guard_project_completion()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and coalesce(current_setting('app.completion_review', true), '') <> new.id::text then
    raise exception 'Projects can only be completed through the completion readiness review';
  end if;
  return new;
end;
$$;
create trigger projects_guard_completion before update of status on public.projects
  for each row execute function public.guard_project_completion();

create or replace function public.resolve_completion_exception(p_exception uuid, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare x public.project_completion_exceptions;
begin
  select * into x from public.project_completion_exceptions where id = p_exception for update;
  if x.id is null or not (public.is_org_manager(x.organization_id)
                          or (x.follow_up_user_id = auth.uid() and public.is_org_staff(x.organization_id))) then
    raise exception 'Exception not found or access denied';
  end if;
  if x.status = 'resolved' then
    raise exception 'This exception is already resolved';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 10 then
    raise exception 'Describe how the outstanding item was resolved';
  end if;
  update public.project_completion_exceptions
     set status = 'resolved', resolved_by = auth.uid(), resolved_at = now(), resolution_note = left(btrim(p_note), 2000)
   where id = p_exception;
end;
$$;
revoke execute on function public.resolve_completion_exception(uuid, text) from public, anon;
grant execute on function public.resolve_completion_exception(uuid, text) to authenticated;
