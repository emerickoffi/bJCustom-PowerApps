-- Synthetic tenants for supabase/tests/tenant_isolation/isolation.sql.
-- Run only against a disposable database (local Supabase or a Supabase branch) that already holds every migration.
-- Never run against a real environment: it disables triggers while it inserts fixed-id rows.
set session_replication_role = replica;

create schema if not exists test;
create table if not exists test.results (id serial primary key, label text, pass boolean, detail text);
create or replace function test.record(p_label text, p_pass boolean, p_detail text) returns void
language sql security definer as $$ insert into test.results (label, pass, detail) values (p_label, p_pass, p_detail) $$;
create or replace function test.eq(p_label text, p_actual text, p_expected text) returns void
language sql as $$ select test.record(p_label, p_actual is not distinct from p_expected, 'got ' || coalesce(p_actual, 'NULL') || ', want ' || coalesce(p_expected, 'NULL')) $$;
create or replace function test.throws(p_label text, p_sql text, p_pattern text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    perform test.record(p_label, sqlerrm ~* p_pattern, sqlstate || ' ' || sqlerrm);
    return;
  end;
  perform test.record(p_label, false, 'no error raised');
end $$;
create or replace function test.as(p_user uuid) returns void
language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), false);
  execute 'set role authenticated';
end $$;
grant usage on schema test to authenticated, anon;
grant execute on all functions in schema test to authenticated, anon;

-- Organization A (…0a) and Organization B (…0b).
insert into public.organizations (id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Tenant A Builder'),
  ('00000000-0000-0000-0000-00000000000b', 'Tenant B Builder');

-- a1 A admin, a3 A staff on PA1, b1 A sub (Acme, assigned to PA1), b3 A sub (Beta, unassigned),
-- c1 A homeowner on PA1, d1 B admin, d3 B staff on PB1.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@tenant-a.dev'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff@tenant-a.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'sub@acme.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'sub@beta.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'owner@home.dev'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@tenant-b.dev'),
  ('00000000-0000-0000-0000-0000000000d3', 'staff@tenant-b.dev');
insert into public.profiles (id, full_name, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ada Admin', 'admin@tenant-a.dev'),
  ('00000000-0000-0000-0000-0000000000a3', 'Sam Staff', 'staff@tenant-a.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'Eli Electric', 'sub@acme.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'Bo Plumber', 'sub@beta.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'Holly Homeowner', 'owner@home.dev'),
  ('00000000-0000-0000-0000-0000000000d1', 'Dana B Admin', 'admin@tenant-b.dev'),
  ('00000000-0000-0000-0000-0000000000d3', 'Ben B Staff', 'staff@tenant-b.dev');

insert into public.clients (id, organization_id, client_number, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 1, 'Holly', 'Homeowner');

insert into public.organization_memberships (organization_id, user_id, role, status, activation_required, client_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'org_admin', 'active', false, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', 'builder_staff', 'active', false, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'client', 'active', false, '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000d1', 'org_admin', 'active', false, null),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000d3', 'builder_staff', 'active', false, null);

insert into public.projects (id, organization_id, project_number, name, address_line1, city, state, postal_code, status, project_manager_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'A-001', 'A Maple Residence', '1 Maple St', 'Austin', 'TX', '78701', 'under_construction', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000a', 'A-002', 'A Oak Remodel', '2 Oak Ave', 'Austin', 'TX', '78702', 'under_construction', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000000b', 'B-001', 'B Elm Residence', '9 Elm St', 'Dallas', 'TX', '75001', 'under_construction', '00000000-0000-0000-0000-0000000000d1');
insert into public.project_members (organization_id, project_id, user_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000d3');

insert into public.organization_features (organization_id, feature_key, enabled) values
  ('00000000-0000-0000-0000-00000000000a', 'documents', true),
  ('00000000-0000-0000-0000-00000000000a', 'subcontractors', true),
  ('00000000-0000-0000-0000-00000000000b', 'documents', true),
  ('00000000-0000-0000-0000-00000000000b', 'subcontractors', true);

insert into public.subcontractor_companies (id, organization_id, company_name, trade, status) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-00000000000a', 'Acme Electric', 'Electrical', 'active'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-00000000000a', 'Beta Plumbing', 'Plumbing', 'active');
insert into public.subcontractor_portal_accounts (organization_id, subcontractor_company_id, user_id, full_name, email, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000b1', 'Eli Electric', 'sub@acme.dev', 'active'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000b3', 'Bo Plumber', 'sub@beta.dev', 'active');
insert into public.subcontractor_project_assignments (organization_id, project_id, subcontractor_company_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000c01');

insert into public.project_clients (organization_id, project_id, client_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1');
insert into public.portal_accounts (id, organization_id, client_id, user_id) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1');
insert into public.portal_project_access (organization_id, portal_account_id, user_id, project_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1');

-- Documents: A internal on PA1, A internal on PA2, B internal on PB1.
insert into public.project_documents (id, organization_id, project_id, name, category, visibility, scope, created_by, current_version_id, current_version_number) values
  ('00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'A Floor Plan', 'floor_plans', 'internal', 'project', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d0a11', 1),
  ('00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 'A Oak Permit', 'permits', 'internal', 'project', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d0a21', 1),
  ('00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f9', 'B Floor Plan', 'floor_plans', 'internal', 'project', '00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000d0b11', 1);
insert into public.project_document_versions (id, document_id, organization_id, project_id, version_number, storage_path, original_filename, content_type, size_bytes, uploaded_by) values
  ('00000000-0000-0000-0000-0000000d0a11', '00000000-0000-0000-0000-00000000d0a1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 1, 'library/a/f1/plan.pdf', 'plan.pdf', 'application/pdf', 1000, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000d0a21', '00000000-0000-0000-0000-00000000d0a2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 1, 'library/a/f2/permit.pdf', 'permit.pdf', 'application/pdf', 1000, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000d0b11', '00000000-0000-0000-0000-00000000d0b1', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f9', 1, 'library/b/f9/plan.pdf', 'plan.pdf', 'application/pdf', 1000, '00000000-0000-0000-0000-0000000000d1');

-- Restricted builder financials on PA1 and PB1.
insert into public.estimates (id, organization_id, project_id, family_id, name) values
  ('00000000-0000-0000-0000-0000000e5a01', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000e5a01', 'A Base Estimate'),
  ('00000000-0000-0000-0000-0000000e5b01', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000e5b01', 'B Base Estimate');
insert into public.project_commitments (id, organization_id, project_id, vendor_name, cost_category, description, amount_cents) values
  ('00000000-0000-0000-0000-0000000c0a01', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'Lumber Co', 'Framing', 'Framing package', 1500000),
  ('00000000-0000-0000-0000-0000000c0b01', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000f9', 'B Lumber', 'Framing', 'Framing package', 900000);

set session_replication_role = origin;
