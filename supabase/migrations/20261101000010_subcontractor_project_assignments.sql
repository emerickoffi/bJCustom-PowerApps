-- Company-to-project associations for subcontractor companies. FOR REVIEW — not yet applied.
-- Additive only: one new table, its guard/audit triggers, RLS policies, and one atomic create function.
--
-- What this is (and is not):
-- * A subcontractor_project_assignments row means "this trade partner company works on this project".
--   It is separate from schedule_activity_assignments, which links a company to a single schedule activity.
-- * It grants NO login or portal access. Subcontractor companies are directory records, not users; nothing here
--   touches organization_memberships, project_members, portal access, or any existing policy.
--
-- Rules:
-- * Organization always comes from the project, never from the caller, and must match the company's organization.
-- * New associations are only allowed on projects that accept new assignments (public.project_accepts_new_assignments,
--   mirroring ASSIGNABLE_PROJECT_STATUSES in lib/domain.ts) and only for active companies.
-- * Rows are never updated or deleted, so associations on projects that later complete are kept as history.
-- * One association per company and project (unique index), so duplicates are impossible.
-- * Only organization admins and project managers can read or create rows, only in their own organization,
--   and only while the 'subcontractors' feature is on (admins keep read access, matching subcontractor_companies).
--
-- Apply after 20261031000001_assignment_project_eligibility.sql.

create table public.subcontractor_project_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index subcontractor_project_assignments_company_project_key
  on public.subcontractor_project_assignments (subcontractor_company_id, project_id);
create index subcontractor_project_assignments_project_idx
  on public.subcontractor_project_assignments (project_id);
create index subcontractor_project_assignments_org_idx
  on public.subcontractor_project_assignments (organization_id);

create or replace function public.subcontractor_project_assignments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project record;
  v_company record;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Project assignments are kept as history and cannot be changed or deleted';
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

  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
create trigger subcontractor_project_assignments_before_write
  before insert or update or delete on public.subcontractor_project_assignments
  for each row execute function public.subcontractor_project_assignments_before_write();
create trigger audit_subcontractor_project_assignments
  after insert or update or delete on public.subcontractor_project_assignments
  for each row execute function public.write_audit_event();

-- ============ RLS ============
alter table public.subcontractor_project_assignments enable row level security;
revoke all on public.subcontractor_project_assignments from anon;

create policy subcontractor_project_assignments_select on public.subcontractor_project_assignments
  for select to authenticated
  using (public.is_org_manager(organization_id));
create policy subcontractor_project_assignments_insert on public.subcontractor_project_assignments
  for insert to authenticated
  with check (public.is_org_manager(organization_id));
-- No update or delete policies: both are denied for every role.

create policy subcontractor_project_assignments_feature_read on public.subcontractor_project_assignments
  as restrictive for select to authenticated
  using (public.is_feature_enabled(organization_id, 'subcontractors') or public.is_org_admin(organization_id));
create policy subcontractor_project_assignments_feature_insert on public.subcontractor_project_assignments
  as restrictive for insert to authenticated
  with check (public.is_feature_enabled(organization_id, 'subcontractors'));

-- ============ Atomic create ============
-- Creates a subcontractor company and its project associations in one transaction. Runs as the caller
-- (security invoker), so every RLS policy and trigger above still applies; any failure rolls back everything.
create or replace function public.create_subcontractor_with_projects(
  p_organization_id uuid,
  p_company_name text,
  p_trade text,
  p_email text,
  p_phone text,
  p_status text,
  p_project_ids uuid[]
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_company_id uuid;
  v_project_ids uuid[];
begin
  select coalesce(array_agg(distinct x), array[]::uuid[]) into v_project_ids
    from unnest(coalesce(p_project_ids, array[]::uuid[])) as x where x is not null;
  if cardinality(v_project_ids) > 50 then
    raise exception 'Choose 50 projects or fewer';
  end if;

  insert into public.subcontractor_companies (organization_id, company_name, trade, email, phone, status)
  values (p_organization_id, p_company_name, p_trade, p_email, p_phone, p_status)
  returning id into v_company_id;

  insert into public.subcontractor_project_assignments (project_id, subcontractor_company_id)
  select pid, v_company_id from unnest(v_project_ids) as pid;

  return v_company_id;
end;
$$;
revoke all on function public.create_subcontractor_with_projects(uuid, text, text, text, text, text, uuid[]) from public, anon;
grant execute on function public.create_subcontractor_with_projects(uuid, text, text, text, text, text, uuid[]) to authenticated;
