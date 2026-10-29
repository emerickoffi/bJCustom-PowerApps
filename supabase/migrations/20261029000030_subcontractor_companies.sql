-- Subcontractor management MVP: tenant-scoped subcontractor company directory. FOR REVIEW — not yet applied.
-- Additive only: one new table, its guard/audit triggers, RLS policies, and the 'subcontractors' feature key.
--
-- Security model:
-- * Subcontractor companies are directory records owned by a builder organization. They are NOT users:
--   nothing here touches org_role, organization_memberships, project members, or any existing policy.
-- * Only organization admins and project managers (public.is_org_manager) can read, create, or update rows,
--   and only inside their own organization. Builder Staff, homeowners, anon, and other tenants get nothing.
-- * Restrictive feature policies block access while the 'subcontractors' feature is off for the organization
--   (admins keep read access, matching invoices). The feature defaults OFF and must be turned on per organization.
-- * Rows are never deleted; set status to 'inactive' instead. Every change is written to audit_events.
--
-- Apply after 20261029000020_daily_logs.sql. feature_registry() below is that file's list plus 'subcontractors'.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation',   true,  array[]::text[]),
    ('schedule',       true,  array[]::text[]),
    ('estimates',      true,  array[]::text[]),
    ('walkthroughs',   true,  array[]::text[]),
    ('issues',         true,  array[]::text[]),
    ('warranty',       true,  array[]::text[]),
    ('portal',         true,  array[]::text[]),
    ('documents',      false, array[]::text[]),
    ('e_signatures',   false, array['documents']),
    ('reports',        true,  array['walkthroughs']),
    ('invoices',       false, array[]::text[]),
    ('payments',       false, array['estimates']),
    ('quickbooks',     false, array['estimates']),
    ('ai_assistant',   false, array[]::text[]),
    ('daily_logs',     false, array[]::text[]),
    ('subcontractors', false, array[]::text[])
$$;

create table public.subcontractor_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_name text not null check (char_length(btrim(company_name)) between 1 and 160),
  trade text not null check (char_length(btrim(trade)) between 1 and 120),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  phone text check (phone is null or phone ~ '^[0-9+().\-\s]{7,30}$'),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index subcontractor_companies_org_name_key
  on public.subcontractor_companies (organization_id, lower(btrim(company_name)));
create index subcontractor_companies_org_idx
  on public.subcontractor_companies (organization_id, status, company_name);

create trigger subcontractor_companies_updated_at before update on public.subcontractor_companies
  for each row execute function public.set_updated_at();

create or replace function public.subcontractor_companies_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Subcontractor companies cannot be deleted; mark them inactive instead.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
    return new;
  end if;
  if new.organization_id <> old.organization_id
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Subcontractor company identity fields cannot be changed';
  end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger subcontractor_companies_before_write before insert or update or delete on public.subcontractor_companies
  for each row execute function public.subcontractor_companies_before_write();
create trigger audit_subcontractor_companies after insert or update or delete on public.subcontractor_companies
  for each row execute function public.write_audit_event();

-- ============ RLS ============
alter table public.subcontractor_companies enable row level security;
revoke all on public.subcontractor_companies from anon;

create policy subcontractor_companies_select on public.subcontractor_companies for select to authenticated
  using (public.is_org_manager(organization_id));
create policy subcontractor_companies_insert on public.subcontractor_companies for insert to authenticated
  with check (public.is_org_manager(organization_id));
create policy subcontractor_companies_update on public.subcontractor_companies for update to authenticated
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id));
-- No delete policy: deletes are denied for every role.

create policy subcontractor_companies_feature_read on public.subcontractor_companies
  as restrictive for select to authenticated
  using (public.is_feature_enabled(organization_id, 'subcontractors') or public.is_org_admin(organization_id));
create policy subcontractor_companies_feature_insert on public.subcontractor_companies
  as restrictive for insert to authenticated
  with check (public.is_feature_enabled(organization_id, 'subcontractors'));
create policy subcontractor_companies_feature_update on public.subcontractor_companies
  as restrictive for update to authenticated
  using (public.is_feature_enabled(organization_id, 'subcontractors'))
  with check (public.is_feature_enabled(organization_id, 'subcontractors'));
