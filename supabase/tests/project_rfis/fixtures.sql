-- Test data for supabase/tests/project_rfis/workflow.sql.
-- Run only against a disposable database that already holds the schema and 20261211000010_project_rfis.sql.
-- Never run against a real environment: it disables triggers while it inserts fixed-id rows.
set session_replication_role = replica;

create schema if not exists test;
create table test.results (id serial primary key, label text, pass boolean, detail text);
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

insert into public.organizations (id, display_name) values
  ('00000000-0000-0000-0000-00000000000a', 'Test Builder'),
  ('00000000-0000-0000-0000-00000000000b', 'Other Builder');

-- a1 admin, a2 project manager, a3 staff on P1, a4 staff not on P1, a5 staff on P1 pending activation,
-- b1/b2 portal users of Acme Electric (assigned to P1), b3 portal user of Beta Plumbing (not assigned),
-- c1 homeowner linked to P1, c2 homeowner linked to P2, d1 admin of the other organization.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'pm@test.dev'),
  ('00000000-0000-0000-0000-0000000000a3', 'staff.on@test.dev'),
  ('00000000-0000-0000-0000-0000000000a4', 'staff.off@test.dev'),
  ('00000000-0000-0000-0000-0000000000a5', 'staff.pending@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'sub.one@acme.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'sub.two@acme.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'sub.three@beta.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'owner.one@home.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'owner.two@home.dev'),
  ('00000000-0000-0000-0000-0000000000d1', 'admin@other.dev');
insert into public.profiles (id, full_name, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'Ada Admin', 'admin@test.dev'),
  ('00000000-0000-0000-0000-0000000000a2', 'Pat Manager', 'pm@test.dev'),
  ('00000000-0000-0000-0000-0000000000a3', 'Sam Staff', 'staff.on@test.dev'),
  ('00000000-0000-0000-0000-0000000000a4', 'Otis Offsite', 'staff.off@test.dev'),
  ('00000000-0000-0000-0000-0000000000a5', 'Penny Pending', 'staff.pending@test.dev'),
  ('00000000-0000-0000-0000-0000000000b1', 'Eli Electric', 'sub.one@acme.dev'),
  ('00000000-0000-0000-0000-0000000000b2', 'Erin Electric', 'sub.two@acme.dev'),
  ('00000000-0000-0000-0000-0000000000b3', 'Bo Plumber', 'sub.three@beta.dev'),
  ('00000000-0000-0000-0000-0000000000c1', 'Holly Homeowner', 'owner.one@home.dev'),
  ('00000000-0000-0000-0000-0000000000c2', 'Hank Homeowner', 'owner.two@home.dev'),
  ('00000000-0000-0000-0000-0000000000d1', 'Dana Other', 'admin@other.dev');

insert into public.clients (id, organization_id, client_number, first_name, last_name) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000a', 1, 'Holly', 'Homeowner'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-00000000000a', 2, 'Hank', 'Homeowner');

insert into public.organization_memberships (organization_id, user_id, role, status, activation_required, client_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a1', 'org_admin', 'active', false, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a2', 'project_manager', 'active', false, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a3', 'builder_staff', 'active', false, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a4', 'builder_staff', 'active', false, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000a5', 'builder_staff', 'active', true, null),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c1', 'client', 'active', false, '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000c2', 'client', 'active', false, '00000000-0000-0000-0000-0000000000e2'),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-0000000000d1', 'org_admin', 'active', false, null);

insert into public.projects (id, organization_id, project_number, name, address_line1, city, state, postal_code, status, project_manager_id) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'P-001', 'Maple Street Residence', '1 Maple St', 'Austin', 'TX', '78701', 'under_construction', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-00000000000a', 'P-002', 'Oak Avenue Remodel', '2 Oak Ave', 'Austin', 'TX', '78702', 'under_construction', '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-00000000000b', 'X-001', 'Other Org Project', '9 Elm St', 'Dallas', 'TX', '75001', 'under_construction', '00000000-0000-0000-0000-0000000000d1');
insert into public.project_members (organization_id, project_id, user_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a3'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a5');

insert into public.organization_features (organization_id, feature_key, enabled) values
  ('00000000-0000-0000-0000-00000000000a', 'rfis', true),
  ('00000000-0000-0000-0000-00000000000a', 'subcontractors', true),
  ('00000000-0000-0000-0000-00000000000a', 'documents', true),
  ('00000000-0000-0000-0000-00000000000b', 'rfis', true);

insert into public.subcontractor_companies (id, organization_id, company_name, trade, status) values
  ('00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-00000000000a', 'Acme Electric', 'Electrical', 'active'),
  ('00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-00000000000a', 'Beta Plumbing', 'Plumbing', 'active'),
  ('00000000-0000-0000-0000-000000000c03', '00000000-0000-0000-0000-00000000000a', 'Gamma Framing', 'Framing', 'active');
insert into public.subcontractor_portal_accounts (organization_id, subcontractor_company_id, user_id, full_name, email, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000b1', 'Eli Electric', 'sub.one@acme.dev', 'active'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000c01', '00000000-0000-0000-0000-0000000000b2', 'Erin Electric', 'sub.two@acme.dev', 'active'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000c02', '00000000-0000-0000-0000-0000000000b3', 'Bo Plumber', 'sub.three@beta.dev', 'active');
-- Acme and Gamma (no portal account) work on P1; Beta does not.
insert into public.subcontractor_project_assignments (organization_id, project_id, subcontractor_company_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000c01'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-000000000c03');

insert into public.project_clients (organization_id, project_id, client_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000e1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000e2');
insert into public.portal_accounts (id, organization_id, client_id, user_id) values
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2');
insert into public.portal_project_access (organization_id, portal_account_id, user_id, project_id) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000f1'),
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000f2');

-- Directory person on P1 with no account at all.
insert into public.business_people (id, organization_id, first_name, last_name, email, status) values
  ('00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-00000000000a', 'Archie', 'Architect', 'archie@design.dev', 'active');
insert into public.business_person_projects (organization_id, person_id, project_id, project_role, status) values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000b01', '00000000-0000-0000-0000-0000000000f1', 'Architect', 'active');

-- One internal document on P1 and one on P2.
insert into public.project_documents (id, organization_id, project_id, name, category, visibility, scope, created_by, current_version_id, current_version_number) values
  ('00000000-0000-0000-0000-00000000d0c1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 'A-201 Floor Plan', 'floor_plans', 'internal', 'project', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d0c11', 1),
  ('00000000-0000-0000-0000-00000000d0c2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 'Oak Permit', 'permits', 'internal', 'project', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000d0c21', 1);
insert into public.project_document_versions (id, document_id, organization_id, project_id, version_number, storage_path, original_filename, content_type, size_bytes, uploaded_by) values
  ('00000000-0000-0000-0000-0000000d0c11', '00000000-0000-0000-0000-00000000d0c1', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f1', 1, 'library/a/f1/a201.pdf', 'a201.pdf', 'application/pdf', 1000, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000d0c21', '00000000-0000-0000-0000-00000000d0c2', '00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-0000000000f2', 1, 'library/a/f2/permit.pdf', 'permit.pdf', 'application/pdf', 1000, '00000000-0000-0000-0000-0000000000a1');

set session_replication_role = origin;
