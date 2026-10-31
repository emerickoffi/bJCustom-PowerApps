-- Subcontractor vetting workflow stages.
-- Additive on top of 20261113000010_subcontractor_qualification.sql:
--   * Conditional final decisions (usable with documented warnings)
--   * Extra optional checklist items (emergency contact, service area, payment setup, compliance notes)
--   * Request documents + internal notes, both recorded in the vetting history
--   * Every subcontractor gets a checklist automatically (existing and new), while staying in "New" until vetting is
--     actually started or documents are requested
--   * `vetting_status` on the summary view: new | requested | in_review | missing_items | conditional | qualified | not_qualified
-- The existing `status` column keeps its meaning for assignment enforcement; Conditional counts as usable there.

-- ============ Conditional decisions ============
alter table public.subcontractor_qualification_decisions
  drop constraint if exists subcontractor_qualification_decisions_outcome_check;
alter table public.subcontractor_qualification_decisions
  add constraint subcontractor_qualification_decisions_outcome_check
  check (outcome in ('approved', 'conditional', 'not_cleared'));

-- ============ Extra optional requirements ============
create or replace function public.seed_subcontractor_vetting_extras(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.subcontractor_qualification_requirements
    (organization_id, key, category, title, guidance, applicability, evidence_required, expiration_tracked, restricted, sort_order)
  values
    (p_org, 'service_area', 'business_tax', 'Service area confirmed',
     'Confirm the towns or regions this subcontractor will travel to.', 'optional', false, false, false, 15),
    (p_org, 'emergency_contact', 'business_tax', 'Emergency contact on file',
     'A reachable after-hours contact for job-site emergencies.', 'optional', false, false, false, 25),
    (p_org, 'payment_setup', 'business_tax', 'Payment setup confirmed',
     'Confirm how payments will be made. Do not record bank account numbers here.', 'optional', false, false, true, 45),
    (p_org, 'compliance_notes', 'licenses_safety', 'Background / compliance review',
     'Record any background or compliance checks your company performs.', 'optional', false, false, false, 230)
  on conflict (organization_id, key) do nothing;
$$;
revoke all on function public.seed_subcontractor_vetting_extras(uuid) from public, anon, authenticated;

-- Creates missing checklist items for one company. Internal: callers check permissions first.
create or replace function public.sq_seed_company_items(p_company uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.subcontractor_companies; v_added int;
begin
  select * into c from public.subcontractor_companies where id = p_company;
  if not found then return 0; end if;
  perform public.seed_subcontractor_qualification_defaults(c.organization_id);
  perform public.seed_subcontractor_vetting_extras(c.organization_id);
  insert into public.subcontractor_qualification_items (organization_id, subcontractor_company_id, requirement_id)
  select c.organization_id, c.id, r.id
    from public.subcontractor_qualification_requirements r
   where r.organization_id = c.organization_id and r.archived_at is null
     and (r.applies_to_trades is null or cardinality(r.applies_to_trades) = 0
          or exists (select 1 from unnest(r.applies_to_trades) t where c.trade ilike '%' || t || '%'))
  on conflict (subcontractor_company_id, requirement_id) do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;
revoke all on function public.sq_seed_company_items(uuid) from public, anon, authenticated;

-- ============ Start / request / notes ============
create or replace function public.start_subcontractor_vetting(p_company uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.subcontractor_companies; v_added int; v_first boolean;
begin
  c := public.sq_manager_company(p_company);
  v_first := not exists (
    select 1 from public.subcontractor_qualification_events
     where subcontractor_company_id = c.id and action in ('vetting_started', 'documents_requested'));
  v_added := public.sq_seed_company_items(c.id);
  if v_first or v_added > 0 then
    perform public.sq_log(c.organization_id, c.id, null, case when v_first then 'vetting_started' else 'checklist_synced' end,
                          null, null, case when v_added > 0 then v_added || ' checklist items added' else null end);
  end if;
  return v_added;
end;
$$;
revoke all on function public.start_subcontractor_vetting(uuid) from public, anon;
grant execute on function public.start_subcontractor_vetting(uuid) to authenticated;

create or replace function public.request_subcontractor_documents(p_company uuid, p_notes text default null)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare c public.subcontractor_companies;
begin
  c := public.sq_manager_company(p_company);
  perform public.sq_seed_company_items(c.id);
  perform public.sq_log(c.organization_id, c.id, null, 'documents_requested', null, null, p_notes);
  return now();
end;
$$;
revoke all on function public.request_subcontractor_documents(uuid, text) from public, anon;
grant execute on function public.request_subcontractor_documents(uuid, text) to authenticated;

create or replace function public.add_subcontractor_vetting_note(p_company uuid, p_notes text)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.subcontractor_companies;
begin
  c := public.sq_manager_company(p_company);
  if nullif(btrim(coalesce(p_notes, '')), '') is null then raise exception 'Enter a note'; end if;
  perform public.sq_log(c.organization_id, c.id, null, 'note_added', null, null, p_notes);
end;
$$;
revoke all on function public.add_subcontractor_vetting_note(uuid, text) from public, anon;
grant execute on function public.add_subcontractor_vetting_note(uuid, text) to authenticated;

-- ============ Final decision (adds Conditional) ============
create or replace function public.decide_subcontractor_qualification(p_company uuid, p_outcome text, p_notes text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.subcontractor_companies; s record; v_version int; v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  c := public.sq_manager_company(p_company);
  if not public.is_org_admin(c.organization_id) then
    raise exception 'Only administrators can record a final qualification decision';
  end if;
  perform 1 from public.subcontractor_companies where id = c.id for update;
  select * into s from public.subcontractor_qualification_summary where subcontractor_company_id = c.id;
  v_version := coalesce(s.template_version, 1);

  if p_outcome = 'approved' then
    if s.started_at is null then raise exception 'Start vetting before approving this subcontractor'; end if;
    if not s.criteria_met then
      raise exception 'Every mandatory requirement must be verified or approved Not Applicable before final approval';
    end if;
  elsif p_outcome = 'conditional' then
    if s.started_at is null then raise exception 'Start vetting before recording a conditional approval'; end if;
    if v_notes is null then raise exception 'Enter the conditions or warnings for this approval'; end if;
  elsif p_outcome = 'not_cleared' then
    if v_notes is null then raise exception 'Enter why this subcontractor is not qualified'; end if;
  else
    raise exception 'Unknown qualification outcome';
  end if;

  insert into public.subcontractor_qualification_decisions (organization_id, subcontractor_company_id, outcome, template_version, notes, decided_by)
  values (c.organization_id, c.id, p_outcome, v_version, left(v_notes, 2000), auth.uid());
  perform public.sq_log(c.organization_id, c.id, null, 'decision_' || p_outcome, s.vetting_status, null, v_notes);
  return public.subcontractor_qualification_status(c.id);
end;
$$;
revoke all on function public.decide_subcontractor_qualification(uuid, text, text) from public, anon;
grant execute on function public.decide_subcontractor_qualification(uuid, text, text) to authenticated;

-- ============ Summary view with workflow stage ============
create or replace view public.subcontractor_qualification_summary with (security_invoker = true) as
with agg as (
  select subcontractor_company_id,
    count(*) filter (where mandatory) as mandatory_total,
    count(*) filter (where mandatory and effective = 'satisfied') as mandatory_satisfied,
    count(*) filter (where mandatory and effective = 'rejected') as rejected_count,
    count(*) filter (where mandatory and effective = 'expired') as expired_count,
    count(*) filter (where effective = 'awaiting_review') as awaiting_review_count,
    count(*) filter (where mandatory and effective = 'missing') as missing_count,
    count(*) filter (where mandatory and effective = 'satisfied' and expiration_tracked and expiration_date <= (current_date + 30)) as expiring_soon_count,
    min(expiration_date) filter (where mandatory and effective = 'satisfied' and expiration_tracked) as next_expiration,
    max(reviewed_at) as last_reviewed_at,
    count(*) filter (where not mandatory and effective in ('awaiting_review', 'rejected', 'expired')) as optional_open_count
  from public.subcontractor_qualification_checklist
  group by subcontractor_company_id
),
started as (
  select subcontractor_company_id, min(created_at) as started_at,
         count(*) filter (where state <> 'not_started') as progressed_count,
         min(coalesce(submitted_at, reviewed_at, updated_at)) filter (where state <> 'not_started') as first_progress_at
  from public.subcontractor_qualification_items group by subcontractor_company_id
),
latest as (
  select distinct on (subcontractor_company_id)
    subcontractor_company_id, outcome, template_version, decided_at, decided_by, notes
  from public.subcontractor_qualification_decisions
  order by subcontractor_company_id, decided_at desc, id desc
),
activity as (
  select subcontractor_company_id,
         min(created_at) filter (where action in ('vetting_started', 'documents_requested')) as first_activity_at,
         max(created_at) filter (where action = 'documents_requested') as requested_at
  from public.subcontractor_qualification_events group by subcontractor_company_id
)
select
  c.id as subcontractor_company_id,
  c.organization_id,
  c.status as company_status,
  s.started_at,
  coalesce(a.mandatory_total, 0)::int as mandatory_total,
  coalesce(a.mandatory_satisfied, 0)::int as mandatory_satisfied,
  coalesce(a.rejected_count, 0)::int as rejected_count,
  coalesce(a.expired_count, 0)::int as expired_count,
  coalesce(a.awaiting_review_count, 0)::int as awaiting_review_count,
  coalesce(a.missing_count, 0)::int as missing_count,
  coalesce(a.expiring_soon_count, 0)::int as expiring_soon_count,
  a.next_expiration,
  a.last_reviewed_at,
  l.outcome as decision_outcome,
  l.decided_at as decision_at,
  l.decided_by as decision_by,
  l.template_version as decision_template_version,
  coalesce(p.template_version, 1) as template_version,
  coalesce(p.assignment_mode, 'advisory') as assignment_mode,
  (coalesce(a.mandatory_total, 0) > 0 and a.mandatory_satisfied = a.mandatory_total) as criteria_met,
  case
    when s.started_at is null then 'not_started'
    when coalesce(a.rejected_count, 0) > 0 or coalesce(a.expired_count, 0) > 0 then 'not_cleared'
    when l.outcome = 'not_cleared' then 'not_cleared'
    when coalesce(a.mandatory_total, 0) > 0 and a.mandatory_satisfied = a.mandatory_total
         and l.outcome = 'approved' and l.template_version = coalesce(p.template_version, 1) then 'qualified'
    when l.outcome = 'conditional' and l.template_version = coalesce(p.template_version, 1) then 'qualified'
    else 'pending'
  end as status,
  -- Appended columns (create or replace view only allows additions at the end).
  coalesce(ev.first_activity_at, s.first_progress_at) as activated_at,
  ev.requested_at,
  coalesce(s.progressed_count, 0)::int as progressed_count,
  coalesce(a.optional_open_count, 0)::int as optional_open_count,
  l.notes as decision_notes,
  case when coalesce(a.mandatory_total, 0) = 0 then 0
       else round(100.0 * a.mandatory_satisfied / a.mandatory_total)::int end as completion_percent,
  case
    when l.outcome = 'not_cleared' then 'not_qualified'
    when ev.first_activity_at is null and coalesce(s.progressed_count, 0) = 0 then 'new'
    when coalesce(a.rejected_count, 0) > 0 or coalesce(a.expired_count, 0) > 0 then 'missing_items'
    when l.template_version = coalesce(p.template_version, 1) and l.outcome = 'approved'
         and coalesce(a.mandatory_total, 0) > 0 and a.mandatory_satisfied = a.mandatory_total then
      case when coalesce(a.expiring_soon_count, 0) > 0 or coalesce(a.optional_open_count, 0) > 0
           then 'conditional' else 'qualified' end
    when l.template_version = coalesce(p.template_version, 1) and l.outcome = 'conditional' then 'conditional'
    when coalesce(a.awaiting_review_count, 0) > 0
         or (coalesce(a.mandatory_total, 0) > 0 and a.mandatory_satisfied = a.mandatory_total) then 'in_review'
    when coalesce(s.progressed_count, 0) > 0 then 'missing_items'
    else 'requested'
  end as vetting_status
from public.subcontractor_companies c
left join agg a on a.subcontractor_company_id = c.id
left join started s on s.subcontractor_company_id = c.id
left join latest l on l.subcontractor_company_id = c.id
left join activity ev on ev.subcontractor_company_id = c.id
left join public.subcontractor_qualification_policies p on p.organization_id = c.organization_id;

revoke all on public.subcontractor_qualification_summary from anon;
grant select on public.subcontractor_qualification_summary to authenticated;

-- ============ Automatic checklist for new subcontractors ============
-- Seeding never blocks creating the company; vetting can always be synced later from the profile.
create or replace function public.sq_seed_new_company()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  begin
    perform public.sq_seed_company_items(new.id);
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function public.sq_seed_new_company() from public, anon, authenticated;

drop trigger if exists subcontractor_companies_seed_vetting on public.subcontractor_companies;
create trigger subcontractor_companies_seed_vetting
  after insert on public.subcontractor_companies
  for each row execute function public.sq_seed_new_company();

-- ============ Backfill existing subcontractors ============
do $$
declare r record;
begin
  for r in select id from public.subcontractor_companies loop
    perform public.sq_seed_company_items(r.id);
  end loop;
end;
$$;
