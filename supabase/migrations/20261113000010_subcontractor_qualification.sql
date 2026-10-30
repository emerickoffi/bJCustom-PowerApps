-- Subcontractor Vetting & Qualification. FOR REVIEW — not yet applied.
-- Additive only: new tables, one view, RPCs, a private storage bucket, and a replacement body for the existing
-- subcontractor_project_assignments_before_write() trigger function (same name and binding). Nothing is dropped,
-- no existing row is changed, and existing project assignments are untouched.
--
-- Apply after 20261104000010_subcontractor_project_assignment_history.sql.
--
-- Model
-- * subcontractor_qualification_policies     one row per organization: assignment mode + checklist (template) version.
-- * subcontractor_qualification_requirements organization-scoped checklist. Configurable applicability
--                                            (required | conditional | optional), trade filter, jurisdiction label.
-- * subcontractor_qualification_items        one row per company and requirement: review state, dates, reviewer.
-- * subcontractor_qualification_evidence     versioned, append-only file metadata in the private
--                                            'subcontractor-vetting' bucket. Tax (restricted) evidence is admin-only.
-- * subcontractor_qualification_decisions    append-only final approval / not-cleared decisions.
-- * subcontractor_qualification_events       append-only history of every vetting action.
-- * subcontractor_qualification_summary      THE single status computation (view, security invoker) used by the
--                                            directory, profile, dashboard, and assignment enforcement.
--
-- Status rules (computed at read time against current_date, so expired evidence can never stay green):
-- * not_started  no checklist items exist for the company.
-- * not_cleared  any mandatory item is rejected or its verified evidence has expired, or the latest decision is
--                "not cleared".
-- * qualified    every applicable mandatory item is satisfied (verified with current evidence, or approved Not
--                Applicable), AND the latest decision is "approved" for the current checklist version.
-- * pending      everything else (in progress, awaiting review, or awaiting final approval).
-- Mandatory = 'required' or 'conditional'. Conditional items count until an administrator marks them Not Applicable.
-- A company that is Inactive is never "ready for work", whatever its qualification status.
--
-- Permissions
-- * Read: organization admins and project managers, only while the 'subcontractors' feature is on.
-- * Start vetting, upload evidence, verify/reject: admins and project managers. Restricted (tax) requirements: admins.
-- * Not Applicable, final approval, policy mode, checklist configuration: organization admins only.
-- * All writes go through the SECURITY DEFINER functions below; tables have no insert/update/delete policies.

-- ============ Tables ============
create table public.subcontractor_qualification_policies (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  assignment_mode text not null default 'advisory' check (assignment_mode in ('advisory', 'enforcement')),
  template_version integer not null default 1 check (template_version >= 1),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.subcontractor_qualification_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,60}$'),
  category text not null check (category in ('business_tax', 'insurance', 'licenses_safety', 'experience_references', 'agreements')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  guidance text check (guidance is null or char_length(guidance) <= 1000),
  applicability text not null check (applicability in ('required', 'conditional', 'optional')),
  applies_to_trades text[],
  jurisdiction text check (jurisdiction is null or char_length(btrim(jurisdiction)) between 1 and 120),
  evidence_required boolean not null default false,
  expiration_tracked boolean not null default false,
  restricted boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);
create index subcontractor_qualification_requirements_org_idx
  on public.subcontractor_qualification_requirements (organization_id, sort_order);

create table public.subcontractor_qualification_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  requirement_id uuid not null references public.subcontractor_qualification_requirements(id) on delete restrict,
  state text not null default 'not_started'
    check (state in ('not_started', 'submitted', 'verified', 'rejected', 'not_applicable')),
  current_evidence_id uuid,
  effective_date date,
  expiration_date date,
  reference_number text check (reference_number is null or char_length(reference_number) <= 80),
  issuing_authority text check (issuing_authority is null or char_length(issuing_authority) <= 160),
  notes text check (notes is null or char_length(notes) <= 2000),
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  not_applicable_reason text check (not_applicable_reason is null or char_length(not_applicable_reason) <= 1000),
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subcontractor_company_id, requirement_id),
  check (expiration_date is null or effective_date is null or expiration_date >= effective_date)
);
create index subcontractor_qualification_items_org_idx
  on public.subcontractor_qualification_items (organization_id, state);
create index subcontractor_qualification_items_expiry_idx
  on public.subcontractor_qualification_items (organization_id, expiration_date) where expiration_date is not null;

create table public.subcontractor_qualification_evidence (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  item_id uuid not null references public.subcontractor_qualification_items(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 255),
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  restricted boolean not null default false,
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  unique (item_id, version_number)
);
alter table public.subcontractor_qualification_items
  add constraint subcontractor_qualification_items_evidence_fkey
  foreign key (current_evidence_id) references public.subcontractor_qualification_evidence(id) on delete restrict;

create table public.subcontractor_qualification_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  outcome text not null check (outcome in ('approved', 'not_cleared')),
  template_version integer not null,
  notes text check (notes is null or char_length(notes) <= 2000),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now()
);
create index subcontractor_qualification_decisions_company_idx
  on public.subcontractor_qualification_decisions (subcontractor_company_id, decided_at desc);

create table public.subcontractor_qualification_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  item_id uuid references public.subcontractor_qualification_items(id) on delete restrict,
  action text not null,
  from_state text,
  to_state text,
  notes text check (notes is null or char_length(notes) <= 1000),
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index subcontractor_qualification_events_company_idx
  on public.subcontractor_qualification_events (subcontractor_company_id, created_at desc);

-- History tables are append-only for every role.
create or replace function public.subcontractor_qualification_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Qualification history cannot be changed or deleted';
end;
$$;
create trigger subcontractor_qualification_evidence_append_only
  before update or delete on public.subcontractor_qualification_evidence
  for each row execute function public.subcontractor_qualification_append_only();
create trigger subcontractor_qualification_decisions_append_only
  before update or delete on public.subcontractor_qualification_decisions
  for each row execute function public.subcontractor_qualification_append_only();
create trigger subcontractor_qualification_events_append_only
  before update or delete on public.subcontractor_qualification_events
  for each row execute function public.subcontractor_qualification_append_only();

create trigger audit_subcontractor_qualification_policies
  after insert or update or delete on public.subcontractor_qualification_policies
  for each row execute function public.write_audit_event();
create trigger audit_subcontractor_qualification_requirements
  after insert or update or delete on public.subcontractor_qualification_requirements
  for each row execute function public.write_audit_event();
create trigger audit_subcontractor_qualification_decisions
  after insert on public.subcontractor_qualification_decisions
  for each row execute function public.write_audit_event();

-- ============ RLS ============
alter table public.subcontractor_qualification_policies enable row level security;
alter table public.subcontractor_qualification_requirements enable row level security;
alter table public.subcontractor_qualification_items enable row level security;
alter table public.subcontractor_qualification_evidence enable row level security;
alter table public.subcontractor_qualification_decisions enable row level security;
alter table public.subcontractor_qualification_events enable row level security;

revoke all on public.subcontractor_qualification_policies, public.subcontractor_qualification_requirements,
  public.subcontractor_qualification_items, public.subcontractor_qualification_evidence,
  public.subcontractor_qualification_decisions, public.subcontractor_qualification_events from anon;
revoke insert, update, delete, truncate on public.subcontractor_qualification_policies,
  public.subcontractor_qualification_requirements, public.subcontractor_qualification_items,
  public.subcontractor_qualification_evidence, public.subcontractor_qualification_decisions,
  public.subcontractor_qualification_events from authenticated;

create policy sq_policies_select on public.subcontractor_qualification_policies for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));
create policy sq_requirements_select on public.subcontractor_qualification_requirements for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));
create policy sq_items_select on public.subcontractor_qualification_items for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));
create policy sq_evidence_select on public.subcontractor_qualification_evidence for select to authenticated
  using (
    public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors')
    and (not restricted or public.is_org_admin(organization_id))
  );
create policy sq_decisions_select on public.subcontractor_qualification_decisions for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));
create policy sq_events_select on public.subcontractor_qualification_events for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));

-- ============ Default checklist ============
-- Starting points only: every item can be re-scoped, limited to trades, or retired by an administrator.
create or replace function public.seed_subcontractor_qualification_defaults(p_org uuid)
returns void language sql security definer set search_path = '' as $$
  insert into public.subcontractor_qualification_policies (organization_id) values (p_org)
  on conflict (organization_id) do nothing;
  insert into public.subcontractor_qualification_requirements
    (organization_id, key, category, title, guidance, applicability, evidence_required, expiration_tracked, restricted, sort_order)
  values
    (p_org, 'legal_name_address', 'business_tax', 'Legal business name and address verified', 'Confirm the legal entity name and mailing address match the agreement and insurance.', 'required', false, false, false, 10),
    (p_org, 'authorized_representative', 'business_tax', 'Owner or authorized representative identified', 'Record who can sign on behalf of the company.', 'required', false, false, false, 20),
    (p_org, 'w9', 'business_tax', 'W-9 received and verified', 'Where applicable. Tax documents are visible to administrators only. Never type tax identifiers into notes.', 'conditional', true, false, true, 30),
    (p_org, 'good_standing', 'business_tax', 'Business registration / good standing', 'Where your jurisdiction requires it.', 'conditional', true, false, false, 40),
    (p_org, 'general_liability', 'insurance', 'General Liability certificate of insurance', 'Upload the current COI and enter its expiration date.', 'required', true, true, false, 110),
    (p_org, 'coverage_limits', 'insurance', 'Coverage limits reviewed against builder policy', 'Compare limits on the COI with your company''s minimums.', 'required', false, false, false, 120),
    (p_org, 'workers_comp', 'insurance', 'Workers'' compensation or approved alternative', 'Upload proof of coverage or an approved exemption.', 'required', true, true, false, 130),
    (p_org, 'commercial_auto', 'insurance', 'Commercial auto insurance', 'When the company drives to or operates vehicles on site.', 'conditional', true, true, false, 140),
    (p_org, 'endorsements', 'insurance', 'Contractually required endorsements', 'For example additional insured or waiver of subrogation, when your contract requires them.', 'conditional', true, false, false, 150),
    (p_org, 'trade_license', 'licenses_safety', 'Required trade license', 'Record the licensing authority, license number, and expiration date.', 'conditional', true, true, false, 210),
    (p_org, 'safety_orientation', 'licenses_safety', 'Safety orientation or training', 'Where applicable to the trade or site.', 'conditional', false, false, false, 220),
    (p_org, 'specialization', 'experience_references', 'Trade specialization reviewed', 'Confirm the company performs the scope you intend to hire them for.', 'required', false, false, false, 310),
    (p_org, 'experience', 'experience_references', 'Relevant experience or portfolio', 'Optional supporting material.', 'optional', false, false, false, 320),
    (p_org, 'references', 'experience_references', 'References received', 'Two references unless your company policy requires a different number.', 'required', false, false, false, 330),
    (p_org, 'reference_review', 'experience_references', 'Reference review completed', 'Record who was contacted and the outcome.', 'required', false, false, false, 340),
    (p_org, 'subcontractor_agreement', 'agreements', 'Signed subcontractor agreement', 'Upload the fully executed agreement.', 'required', true, false, false, 410),
    (p_org, 'terms_acknowledged', 'agreements', 'Scope, payment, and change-order terms acknowledged', null, 'required', false, false, false, 420),
    (p_org, 'warranty_acknowledged', 'agreements', 'Warranty obligations acknowledged', null, 'required', false, false, false, 430),
    (p_org, 'site_rules_acknowledged', 'agreements', 'Safety and site rules acknowledged', null, 'required', false, false, false, 440)
  on conflict (organization_id, key) do nothing;
$$;
revoke all on function public.seed_subcontractor_qualification_defaults(uuid) from public, anon, authenticated;

select public.seed_subcontractor_qualification_defaults(o.id) from public.organizations o;

-- ============ Status (single source of truth) ============
create or replace view public.subcontractor_qualification_checklist with (security_invoker = true) as
select
  c.id as subcontractor_company_id,
  c.organization_id,
  r.id as requirement_id,
  r.applicability,
  r.applicability in ('required', 'conditional') as mandatory,
  r.expiration_tracked,
  i.id as item_id,
  i.state,
  i.expiration_date,
  i.reviewed_at,
  case
    when i.id is null or i.state = 'not_started' then 'missing'
    when i.state = 'not_applicable' then 'satisfied'
    when i.state = 'rejected' then 'rejected'
    when i.state = 'submitted' then 'awaiting_review'
    when r.evidence_required and i.current_evidence_id is null then 'missing'
    when r.expiration_tracked and (i.expiration_date is null or i.expiration_date < current_date) then 'expired'
    else 'satisfied'
  end as effective
from public.subcontractor_companies c
join public.subcontractor_qualification_requirements r
  on r.organization_id = c.organization_id
 and r.archived_at is null
 and (r.applies_to_trades is null or cardinality(r.applies_to_trades) = 0
      or exists (select 1 from unnest(r.applies_to_trades) t where c.trade ilike '%' || t || '%'))
left join public.subcontractor_qualification_items i
  on i.subcontractor_company_id = c.id and i.requirement_id = r.id;

create or replace view public.subcontractor_qualification_summary with (security_invoker = true) as
with agg as (
  select
    subcontractor_company_id,
    count(*) filter (where mandatory) as mandatory_total,
    count(*) filter (where mandatory and effective = 'satisfied') as mandatory_satisfied,
    count(*) filter (where mandatory and effective = 'rejected') as rejected_count,
    count(*) filter (where mandatory and effective = 'expired') as expired_count,
    count(*) filter (where effective = 'awaiting_review') as awaiting_review_count,
    count(*) filter (where mandatory and effective = 'missing') as missing_count,
    count(*) filter (where mandatory and effective = 'satisfied' and expiration_tracked
                     and expiration_date <= current_date + 30) as expiring_soon_count,
    min(expiration_date) filter (where mandatory and effective = 'satisfied' and expiration_tracked) as next_expiration,
    max(reviewed_at) as last_reviewed_at
  from public.subcontractor_qualification_checklist
  group by subcontractor_company_id
),
started as (
  select subcontractor_company_id, min(created_at) as started_at
  from public.subcontractor_qualification_items group by subcontractor_company_id
),
latest as (
  select distinct on (subcontractor_company_id)
    subcontractor_company_id, outcome, template_version, decided_at, decided_by, notes
  from public.subcontractor_qualification_decisions
  order by subcontractor_company_id, decided_at desc, id desc
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
    else 'pending'
  end as status
from public.subcontractor_companies c
left join agg a on a.subcontractor_company_id = c.id
left join started s on s.subcontractor_company_id = c.id
left join latest l on l.subcontractor_company_id = c.id
left join public.subcontractor_qualification_policies p on p.organization_id = c.organization_id;

revoke all on public.subcontractor_qualification_checklist, public.subcontractor_qualification_summary from anon;
grant select on public.subcontractor_qualification_checklist, public.subcontractor_qualification_summary to authenticated;

-- Definer read for triggers and RPCs; never exposed to callers.
create or replace function public.subcontractor_qualification_status(p_company uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce((select s.status from public.subcontractor_qualification_summary s where s.subcontractor_company_id = p_company), 'not_started');
$$;
revoke all on function public.subcontractor_qualification_status(uuid) from public, anon, authenticated;

-- ============ Helpers ============
create or replace function public.sq_manager_company(p_company uuid)
returns public.subcontractor_companies language plpgsql stable security definer set search_path = '' as $$
declare c public.subcontractor_companies;
begin
  select * into c from public.subcontractor_companies where id = p_company;
  if not found or not public.is_org_manager(c.organization_id)
     or not public.is_feature_enabled(c.organization_id, 'subcontractors') then
    raise exception 'Subcontractor not found';
  end if;
  return c;
end;
$$;
revoke all on function public.sq_manager_company(uuid) from public, anon, authenticated;

create or replace function public.sq_log(p_org uuid, p_company uuid, p_item uuid, p_action text, p_from text, p_to text, p_notes text)
returns void language sql security definer set search_path = '' as $$
  insert into public.subcontractor_qualification_events (organization_id, subcontractor_company_id, item_id, action, from_state, to_state, notes, actor)
  values (p_org, p_company, p_item, p_action, p_from, p_to, nullif(left(btrim(coalesce(p_notes, '')), 1000), ''), auth.uid());
$$;
revoke all on function public.sq_log(uuid, uuid, uuid, text, text, text, text) from public, anon, authenticated;

-- ============ Start / continue vetting ============
-- Idempotent: seeds the organization checklist if missing and adds items for any applicable requirement the company
-- does not have yet. Existing items and their history are never touched.
create or replace function public.start_subcontractor_vetting(p_company uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare c public.subcontractor_companies; v_added int; v_first boolean;
begin
  c := public.sq_manager_company(p_company);
  perform public.seed_subcontractor_qualification_defaults(c.organization_id);
  v_first := not exists (select 1 from public.subcontractor_qualification_items where subcontractor_company_id = c.id);

  insert into public.subcontractor_qualification_items (organization_id, subcontractor_company_id, requirement_id)
  select c.organization_id, c.id, r.id
    from public.subcontractor_qualification_requirements r
   where r.organization_id = c.organization_id and r.archived_at is null
     and (r.applies_to_trades is null or cardinality(r.applies_to_trades) = 0
          or exists (select 1 from unnest(r.applies_to_trades) t where c.trade ilike '%' || t || '%'))
  on conflict (subcontractor_company_id, requirement_id) do nothing;
  get diagnostics v_added = row_count;

  if v_first or v_added > 0 then
    perform public.sq_log(c.organization_id, c.id, null, case when v_first then 'vetting_started' else 'checklist_synced' end,
                          null, null, v_added || ' checklist items added');
  end if;
  return v_added;
end;
$$;
revoke all on function public.start_subcontractor_vetting(uuid) from public, anon;
grant execute on function public.start_subcontractor_vetting(uuid) to authenticated;

-- ============ Private evidence storage ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subcontractor-vetting', 'subcontractor-vetting', false, 26214400,
        array['application/pdf', 'image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Path: {organization}/{company}/{item}/{evidence-uuid}.{pdf|png|jpg|webp}
create or replace function public.can_upload_qualification_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_org uuid; v_company uuid; v_item uuid; v_restricted boolean;
begin
  if auth.uid() is null or p_name is null or array_length(string_to_array(p_name, '/'), 1) <> 4 then return false; end if;
  v_org := public.media_path_uuid(p_name, 1);
  v_company := public.media_path_uuid(p_name, 2);
  v_item := public.media_path_uuid(p_name, 3);
  if v_org is null or v_company is null or v_item is null then return false; end if;
  if split_part(p_name, '/', 4) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg|webp)$' then return false; end if;
  if not public.is_org_manager(v_org) or not public.is_feature_enabled(v_org, 'subcontractors') then return false; end if;
  select r.restricted into v_restricted
    from public.subcontractor_qualification_items i
    join public.subcontractor_qualification_requirements r on r.id = i.requirement_id
   where i.id = v_item and i.organization_id = v_org and i.subcontractor_company_id = v_company;
  if not found then return false; end if;
  if v_restricted and not public.is_org_admin(v_org) then return false; end if;
  return not exists (select 1 from public.subcontractor_qualification_evidence e where e.storage_path = p_name);
end;
$$;

create or replace function public.can_read_qualification_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subcontractor_qualification_evidence e
     where e.storage_path = p_name
       and public.is_org_manager(e.organization_id)
       and public.is_feature_enabled(e.organization_id, 'subcontractors')
       and (not e.restricted or public.is_org_admin(e.organization_id))
  );
$$;

create policy subcontractor_vetting_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'subcontractor-vetting' and public.can_upload_qualification_object(name));
create policy subcontractor_vetting_select on storage.objects for select to authenticated
  using (bucket_id = 'subcontractor-vetting' and public.can_read_qualification_object(name));
create policy subcontractor_vetting_delete_unregistered on storage.objects for delete to authenticated
  using (
    bucket_id = 'subcontractor-vetting' and owner_id = (auth.uid())::text
    and not exists (select 1 from public.subcontractor_qualification_evidence e where e.storage_path = name)
  );

-- Records an uploaded file as the next evidence version for an item and moves it to Submitted (never Verified).
create or replace function public.register_qualification_evidence(
  p_storage_path text, p_original_filename text, p_effective_date date default null, p_expiration_date date default null,
  p_reference_number text default null, p_issuing_authority text default null, p_notes text default null)
returns json language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_company uuid; v_item uuid; v_evidence uuid; v_ext text; v_mime text; v_size bigint; v_expected text;
  v_number int; i public.subcontractor_qualification_items; r public.subcontractor_qualification_requirements;
begin
  if not public.can_upload_qualification_object(p_storage_path) then
    raise exception 'You do not have permission to upload evidence for this requirement';
  end if;
  v_org := public.media_path_uuid(p_storage_path, 1);
  v_company := public.media_path_uuid(p_storage_path, 2);
  v_item := public.media_path_uuid(p_storage_path, 3);
  v_evidence := split_part(split_part(p_storage_path, '/', 4), '.', 1)::uuid;
  v_ext := split_part(split_part(p_storage_path, '/', 4), '.', 2);
  v_expected := case v_ext when 'pdf' then 'application/pdf' when 'png' then 'image/png' when 'jpg' then 'image/jpeg' when 'webp' then 'image/webp' end;

  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint into v_mime, v_size
    from storage.objects o
   where o.bucket_id = 'subcontractor-vetting' and o.name = p_storage_path and o.owner_id = (auth.uid())::text;
  if not found then raise exception 'The uploaded file could not be found. Please upload it again.'; end if;
  if v_size is null or v_size <= 0 then raise exception 'The uploaded file is empty.'; end if;
  if v_size > 26214400 then raise exception 'Files must be 25 MB or smaller.'; end if;
  if v_mime is distinct from v_expected then raise exception 'The file type does not match its contents. Upload a PDF, PNG, JPEG, or WebP file.'; end if;
  if p_original_filename is null or char_length(btrim(p_original_filename)) = 0 then raise exception 'The original file name is missing.'; end if;

  select * into i from public.subcontractor_qualification_items where id = v_item for update;
  select * into r from public.subcontractor_qualification_requirements where id = i.requirement_id;
  if r.expiration_tracked and p_expiration_date is null then
    raise exception 'Enter the expiration date shown on the document';
  end if;
  if p_expiration_date is not null and p_effective_date is not null and p_expiration_date < p_effective_date then
    raise exception 'The expiration date must be on or after the effective date';
  end if;
  if r.restricted and nullif(btrim(coalesce(p_reference_number, '')), '') is not null then
    raise exception 'Do not record tax identifiers. Leave the reference number empty for tax documents';
  end if;

  select coalesce(max(version_number), 0) + 1 into v_number from public.subcontractor_qualification_evidence where item_id = v_item;
  insert into public.subcontractor_qualification_evidence
    (id, organization_id, subcontractor_company_id, item_id, version_number, storage_path, original_filename, content_type, size_bytes, restricted, uploaded_by)
  values (v_evidence, v_org, v_company, v_item, v_number, p_storage_path, left(btrim(p_original_filename), 255), v_mime, v_size, r.restricted, auth.uid());

  update public.subcontractor_qualification_items
     set state = 'submitted', current_evidence_id = v_evidence,
         effective_date = p_effective_date, expiration_date = p_expiration_date,
         reference_number = case when r.restricted then null else nullif(left(btrim(coalesce(p_reference_number, '')), 80), '') end,
         issuing_authority = nullif(left(btrim(coalesce(p_issuing_authority, '')), 160), ''),
         notes = coalesce(nullif(left(btrim(coalesce(p_notes, '')), 2000), ''), notes),
         submitted_by = auth.uid(), submitted_at = now(),
         reviewed_by = null, reviewed_at = null, rejection_reason = null, not_applicable_reason = null,
         updated_at = now()
   where id = v_item;

  perform public.sq_log(v_org, v_company, v_item, 'evidence_submitted', i.state, 'submitted', 'Version ' || v_number || ' uploaded');
  return json_build_object('evidence_id', v_evidence, 'version_number', v_number);
end;
$$;
revoke all on function public.register_qualification_evidence(text, text, date, date, text, text, text) from public, anon;
grant execute on function public.register_qualification_evidence(text, text, date, date, text, text, text) to authenticated;

-- ============ Review ============
-- p_decision: 'verified' | 'rejected' | 'not_applicable' | 'reopen'
create or replace function public.review_qualification_item(
  p_item uuid, p_decision text, p_notes text default null, p_reason text default null,
  p_effective_date date default null, p_expiration_date date default null,
  p_reference_number text default null, p_issuing_authority text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  i public.subcontractor_qualification_items; r public.subcontractor_qualification_requirements;
  c public.subcontractor_companies; v_to text; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_exp date; v_eff date;
begin
  select * into i from public.subcontractor_qualification_items where id = p_item for update;
  if not found then raise exception 'Checklist item not found'; end if;
  c := public.sq_manager_company(i.subcontractor_company_id);
  select * into r from public.subcontractor_qualification_requirements where id = i.requirement_id;
  if r.restricted and not public.is_org_admin(c.organization_id) then
    raise exception 'Only administrators can review tax documents';
  end if;
  v_exp := coalesce(p_expiration_date, i.expiration_date);
  v_eff := coalesce(p_effective_date, i.effective_date);

  if p_decision = 'verified' then
    if r.evidence_required and i.current_evidence_id is null then
      raise exception 'Upload the supporting document before verifying this requirement';
    end if;
    if r.expiration_tracked and (v_exp is null or v_exp < current_date) then
      raise exception 'Enter a current expiration date. Expired evidence cannot be verified';
    end if;
    if v_exp is not null and v_eff is not null and v_exp < v_eff then
      raise exception 'The expiration date must be on or after the effective date';
    end if;
    v_to := 'verified';
  elsif p_decision = 'rejected' then
    if v_reason is null then raise exception 'Enter what needs to be corrected'; end if;
    v_to := 'rejected';
  elsif p_decision = 'not_applicable' then
    if not public.is_org_admin(c.organization_id) then
      raise exception 'Only administrators can mark a requirement Not Applicable';
    end if;
    if v_reason is null or char_length(v_reason) < 3 then raise exception 'Enter why this requirement does not apply'; end if;
    v_to := 'not_applicable';
  elsif p_decision = 'reopen' then
    v_to := case when i.current_evidence_id is not null then 'submitted' else 'not_started' end;
  else
    raise exception 'Unknown review decision';
  end if;

  if r.restricted and nullif(btrim(coalesce(p_reference_number, '')), '') is not null then
    raise exception 'Do not record tax identifiers. Leave the reference number empty for tax documents';
  end if;

  update public.subcontractor_qualification_items
     set state = v_to,
         effective_date = v_eff,
         expiration_date = v_exp,
         reference_number = case when r.restricted then null
                                 else coalesce(nullif(left(btrim(coalesce(p_reference_number, '')), 80), ''), reference_number) end,
         issuing_authority = coalesce(nullif(left(btrim(coalesce(p_issuing_authority, '')), 160), ''), issuing_authority),
         notes = coalesce(nullif(left(btrim(coalesce(p_notes, '')), 2000), ''), notes),
         rejection_reason = case when v_to = 'rejected' then left(v_reason, 1000) else null end,
         not_applicable_reason = case when v_to = 'not_applicable' then left(v_reason, 1000) else null end,
         reviewed_by = case when v_to in ('verified', 'rejected', 'not_applicable') then auth.uid() else null end,
         reviewed_at = case when v_to in ('verified', 'rejected', 'not_applicable') then now() else null end,
         updated_at = now()
   where id = i.id;

  perform public.sq_log(c.organization_id, c.id, i.id, 'item_' || p_decision, i.state, v_to,
                        coalesce(v_reason, nullif(btrim(coalesce(p_notes, '')), '')));
  return v_to;
end;
$$;
revoke all on function public.review_qualification_item(uuid, text, text, text, date, date, text, text) from public, anon;
grant execute on function public.review_qualification_item(uuid, text, text, text, date, date, text, text) to authenticated;

-- ============ Final decision ============
create or replace function public.decide_subcontractor_qualification(p_company uuid, p_outcome text, p_notes text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare c public.subcontractor_companies; s record; v_version int; v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  c := public.sq_manager_company(p_company);
  if not public.is_org_admin(c.organization_id) then
    raise exception 'Only administrators can record a final qualification decision';
  end if;
  -- Serialize decisions per company so two approvals cannot race against an item change.
  perform 1 from public.subcontractor_companies where id = c.id for update;
  select * into s from public.subcontractor_qualification_summary where subcontractor_company_id = c.id;
  v_version := coalesce(s.template_version, 1);

  if p_outcome = 'approved' then
    if s.started_at is null then raise exception 'Start vetting before approving this subcontractor'; end if;
    if not s.criteria_met then
      raise exception 'Every mandatory requirement must be verified or approved Not Applicable before final approval';
    end if;
  elsif p_outcome = 'not_cleared' then
    if v_notes is null then raise exception 'Enter why this subcontractor is not cleared'; end if;
  else
    raise exception 'Unknown qualification outcome';
  end if;

  insert into public.subcontractor_qualification_decisions (organization_id, subcontractor_company_id, outcome, template_version, notes, decided_by)
  values (c.organization_id, c.id, p_outcome, v_version, left(v_notes, 2000), auth.uid());
  perform public.sq_log(c.organization_id, c.id, null, 'decision_' || p_outcome, s.status, null, v_notes);
  return public.subcontractor_qualification_status(c.id);
end;
$$;
revoke all on function public.decide_subcontractor_qualification(uuid, text, text) from public, anon;
grant execute on function public.decide_subcontractor_qualification(uuid, text, text) to authenticated;

-- ============ Policy configuration (admins) ============
create or replace function public.set_subcontractor_qualification_mode(p_organization_id uuid, p_mode text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_org_admin(p_organization_id) then raise exception 'Only administrators can change the assignment mode'; end if;
  if p_mode not in ('advisory', 'enforcement') then raise exception 'Unknown assignment mode'; end if;
  perform public.seed_subcontractor_qualification_defaults(p_organization_id);
  update public.subcontractor_qualification_policies
     set assignment_mode = p_mode, updated_by = auth.uid(), updated_at = now()
   where organization_id = p_organization_id;
end;
$$;
revoke all on function public.set_subcontractor_qualification_mode(uuid, text) from public, anon;
grant execute on function public.set_subcontractor_qualification_mode(uuid, text) to authenticated;

-- Changing what is required bumps the checklist version, so earlier approvals need to be renewed.
create or replace function public.update_subcontractor_qualification_requirement(
  p_requirement uuid, p_applicability text, p_applies_to_trades text[] default null,
  p_jurisdiction text default null, p_archived boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.subcontractor_qualification_requirements; v_trades text[];
begin
  select * into r from public.subcontractor_qualification_requirements where id = p_requirement for update;
  if not found or not public.is_org_admin(r.organization_id) then raise exception 'Requirement not found'; end if;
  if p_applicability not in ('required', 'conditional', 'optional') then raise exception 'Unknown applicability'; end if;
  select nullif(array_agg(distinct left(btrim(t), 60)) filter (where btrim(t) <> ''), '{}') into v_trades
    from unnest(coalesce(p_applies_to_trades, array[]::text[])) t;
  if cardinality(coalesce(v_trades, array[]::text[])) > 20 then raise exception 'List 20 trades or fewer'; end if;

  if r.applicability is distinct from p_applicability or r.applies_to_trades is distinct from v_trades
     or (r.archived_at is not null) is distinct from coalesce(p_archived, false)
     or r.jurisdiction is distinct from nullif(btrim(coalesce(p_jurisdiction, '')), '') then
    update public.subcontractor_qualification_requirements
       set applicability = p_applicability, applies_to_trades = v_trades,
           jurisdiction = nullif(left(btrim(coalesce(p_jurisdiction, '')), 120), ''),
           archived_at = case when coalesce(p_archived, false) then coalesce(archived_at, now()) else null end,
           updated_at = now()
     where id = r.id;
    update public.subcontractor_qualification_policies
       set template_version = template_version + 1, updated_by = auth.uid(), updated_at = now()
     where organization_id = r.organization_id;
  end if;
end;
$$;
revoke all on function public.update_subcontractor_qualification_requirement(uuid, text, text[], text, boolean) from public, anon;
grant execute on function public.update_subcontractor_qualification_requirement(uuid, text, text[], text, boolean) to authenticated;

-- ============ Expiration notices ============
-- In-app notifications to organization admins at 30 / 14 / 7 days and on expiry. Deduplicated per item, expiration
-- date, and threshold, so it is safe to call repeatedly. Called when managers open the dashboard; can also be run
-- on a schedule (for example pg_cron) as the service role. Status never depends on this having run.
create or replace function public.refresh_subcontractor_qualification_notices(p_organization_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_count int;
begin
  if auth.uid() is not null and not public.is_org_manager(p_organization_id) then return 0; end if;
  if not public.is_feature_enabled(p_organization_id, 'subcontractors') then return 0; end if;

  insert into public.notifications (organization_id, user_id, title, body, link, kind, dedupe_key, action_required)
  select x.organization_id, m.user_id,
         case when x.tier = 'expired' then x.company_name || ': ' || x.title || ' expired'
              else x.company_name || ': ' || x.title || ' expires in ' || (x.expiration_date - current_date) || ' days' end,
         'Expiration date ' || to_char(x.expiration_date, 'Mon DD, YYYY') || '. Upload current evidence to keep this subcontractor qualified.',
         '/subcontractors/' || x.company_id || '#qualification',
         'subcontractor_qualification',
         'sq-expiry:' || x.item_id || ':' || x.expiration_date || ':' || x.tier,
         x.tier in ('expired', '7')
    from (
      select i.id as item_id, i.organization_id, i.expiration_date, c.id as company_id, c.company_name, r.title,
             case when i.expiration_date < current_date then 'expired'
                  when i.expiration_date <= current_date + 7 then '7'
                  when i.expiration_date <= current_date + 14 then '14'
                  else '30' end as tier
        from public.subcontractor_qualification_items i
        join public.subcontractor_qualification_requirements r on r.id = i.requirement_id
        join public.subcontractor_companies c on c.id = i.subcontractor_company_id
       where i.organization_id = p_organization_id and i.state = 'verified' and r.expiration_tracked
         and r.archived_at is null and r.applicability in ('required', 'conditional')
         and c.status = 'active'
         and i.expiration_date is not null and i.expiration_date <= current_date + 30
    ) x
    join public.organization_memberships m
      on m.organization_id = x.organization_id and m.role = 'org_admin' and m.status = 'active'
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.refresh_subcontractor_qualification_notices(uuid) from public, anon;
grant execute on function public.refresh_subcontractor_qualification_notices(uuid) to authenticated;

-- ============ Project assignment integration ============
-- Same trigger name and binding as 20261104000010; the body is identical except for the enforcement check.
-- Advisory mode (the default for every organization) never blocks; only new INSERTs are checked, so existing
-- assignments and ending them are unaffected.
create or replace function public.subcontractor_project_assignments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project record;
  v_company record;
  v_mode text;
begin
  if tg_op = 'DELETE' then
    raise exception 'Project assignments are kept as history and cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if old.ended_at is not null then
      raise exception 'This project assignment has already ended';
    end if;
    if new.ended_at is null then
      raise exception 'Project assignments can only be ended, not changed';
    end if;
    if new.id <> old.id or new.organization_id <> old.organization_id or new.project_id <> old.project_id
       or new.subcontractor_company_id <> old.subcontractor_company_id
       or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
      raise exception 'Project assignments can only be ended, not changed';
    end if;
    new.ended_at := now();
    new.ended_by := auth.uid();
    new.end_reason := nullif(btrim(new.end_reason), '');
    return new;
  end if;

  select p.organization_id, p.status into v_project from public.projects p where p.id = new.project_id;
  if v_project.organization_id is null then
    raise exception 'Project not found';
  end if;
  new.organization_id := v_project.organization_id;

  select c.organization_id, c.status into v_company
    from public.subcontractor_companies c where c.id = new.subcontractor_company_id;
  if v_company.organization_id is null or v_company.organization_id <> new.organization_id then
    raise exception 'Subcontractor and project must belong to the same organization';
  end if;
  if v_company.status <> 'active' then
    raise exception 'Inactive subcontractors cannot be assigned to projects';
  end if;
  if not public.project_accepts_new_assignments(v_project.status) then
    raise exception 'Subcontractors can only be assigned to projects in preconstruction, construction, or closeout';
  end if;

  select q.assignment_mode into v_mode
    from public.subcontractor_qualification_policies q where q.organization_id = new.organization_id;
  if v_mode = 'enforcement' and public.subcontractor_qualification_status(new.subcontractor_company_id) <> 'qualified' then
    raise exception 'This subcontractor is not qualified for new project work. Complete vetting and final approval first';
  end if;

  new.created_by := auth.uid();
  new.created_at := now();
  new.ended_at := null;
  new.ended_by := null;
  new.end_reason := null;
  return new;
end;
$$;
