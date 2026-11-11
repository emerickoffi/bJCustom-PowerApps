-- Cross-tenant, homeowner, and subcontractor isolation checks. Run after fixtures.sql on a disposable database:
--   psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f fixtures.sql -f isolation.sql
-- Each check writes a row to test.results; the final query lists failures (none expected).
\set ORG_A '00000000-0000-0000-0000-00000000000a'
\set ORG_B '00000000-0000-0000-0000-00000000000b'
\set A_ADMIN '00000000-0000-0000-0000-0000000000a1'
\set A_STAFF '00000000-0000-0000-0000-0000000000a3'
\set A_SUB '00000000-0000-0000-0000-0000000000b1'
\set A_SUB_UNASSIGNED '00000000-0000-0000-0000-0000000000b3'
\set A_OWNER '00000000-0000-0000-0000-0000000000c1'
\set B_ADMIN '00000000-0000-0000-0000-0000000000d1'
\set B_STAFF '00000000-0000-0000-0000-0000000000d3'
\set PA1 '00000000-0000-0000-0000-0000000000f1'
\set PA2 '00000000-0000-0000-0000-0000000000f2'
\set PB1 '00000000-0000-0000-0000-0000000000f9'
\set DOC_A1 '00000000-0000-0000-0000-00000000d0a1'
\set VER_A1 '00000000-0000-0000-0000-0000000d0a11'
\set VER_A2 '00000000-0000-0000-0000-0000000d0a21'
\set VER_B1 '00000000-0000-0000-0000-0000000d0b11'
\set EST_A '00000000-0000-0000-0000-0000000e5a01'
\set COMMIT_A '00000000-0000-0000-0000-0000000c0a01'

-- ───────── Baseline: each admin sees their own tenant ─────────
select test.as(:'A_ADMIN');
select test.eq('baseline: A admin sees A projects', (select count(*)::text from public.projects where organization_id = :'ORG_A'), '2');
select test.eq('baseline: A admin may read the A file version', public.can_view_document_version(:'VER_A1')::text, 'true');
select test.as(:'B_ADMIN');
select test.eq('baseline: B admin sees B project', (select count(*)::text from public.projects where organization_id = :'ORG_B'), '1');

-- ───────── 1. Cross-tenant reads ─────────
select test.as(:'B_ADMIN');
select test.eq('read: B admin sees no A projects', (select count(*)::text from public.projects where organization_id = :'ORG_A'), '0');
select test.eq('read: B admin sees no A documents', (select count(*)::text from public.project_documents where organization_id = :'ORG_A'), '0');
select test.eq('read: B admin sees no A document versions', (select count(*)::text from public.project_document_versions where organization_id = :'ORG_A'), '0');
select test.eq('read: B admin sees no A estimates', (select count(*)::text from public.estimates where organization_id = :'ORG_A'), '0');
select test.eq('read: B admin sees no A commitments', (select count(*)::text from public.project_commitments where organization_id = :'ORG_A'), '0');
select test.eq('read: B admin sees no A clients', (select count(*)::text from public.clients where organization_id = :'ORG_A'), '0');
select test.eq('read: B admin sees no A memberships', (select count(*)::text from public.organization_memberships where organization_id = :'ORG_A'), '0');
select test.as(:'B_STAFF');
select test.eq('read: B staff sees no A projects', (select count(*)::text from public.projects where organization_id = :'ORG_A'), '0');
select test.as(:'A_ADMIN');
select test.eq('read: A admin sees no B projects', (select count(*)::text from public.projects where organization_id = :'ORG_B'), '0');
select test.eq('read: A admin sees no B documents', (select count(*)::text from public.project_documents where organization_id = :'ORG_B'), '0');

-- ───────── 2. Cross-tenant writes ─────────
select test.as(:'B_ADMIN');
with u as (update public.projects set name = 'hijacked' where id = :'PA1' returning 1)
select test.eq('write: B admin cannot update an A project', (select count(*)::text from u), '0');
with u as (update public.project_documents set name = 'hijacked' where id = :'DOC_A1' returning 1)
select test.eq('write: B admin cannot update an A document', (select count(*)::text from u), '0');
with u as (update public.estimates set name = 'hijacked' where id = :'EST_A' returning 1)
select test.eq('write: B admin cannot update an A estimate', (select count(*)::text from u), '0');
with d as (delete from public.estimates where id = :'EST_A' returning 1)
select test.eq('write: B admin cannot delete an A estimate', (select count(*)::text from d), '0');
with u as (update public.project_commitments set description = 'hijacked' where id = :'COMMIT_A' returning 1)
select test.eq('write: B admin cannot update an A commitment', (select count(*)::text from u), '0');
select test.throws('write: B admin cannot insert a project into A',
  format('insert into public.projects (organization_id, project_number, name, address_line1, city, state, postal_code, status) values (%L, %L, %L, %L, %L, %L, %L, %L)',
    :'ORG_A', 'Z-001', 'Injected', '1 Any St', 'Austin', 'TX', '78701', 'under_construction'), 'row-level security|permission');
select test.throws('write: B admin cannot insert an estimate on an A project',
  format('insert into public.estimates (organization_id, project_id, family_id, name) values (%L, %L, gen_random_uuid(), %L)', :'ORG_A', :'PA1', 'Injected'),
  'row-level security|permission');
select test.throws('write: B admin cannot attach a B estimate to an A project',
  format('insert into public.estimates (organization_id, project_id, family_id, name) values (%L, %L, gen_random_uuid(), %L)', :'ORG_B', :'PA1', 'Injected'),
  'row-level security|permission|violates');
select test.throws('write: B admin cannot add themself to an A project',
  format('insert into public.project_members (organization_id, project_id, user_id) values (%L, %L, %L)', :'ORG_A', :'PA1', :'B_ADMIN'),
  'row-level security|permission|violates');
reset role;
select test.eq('write: A project name unchanged', (select name from public.projects where id = :'PA1'), 'A Maple Residence');
select test.eq('write: A estimate still present', (select count(*)::text from public.estimates where id = :'EST_A'), '1');

-- ───────── 3. Signed file URL authorization ─────────
-- Every route issues a signed URL only after one of these checks returns a path or true for the caller.
select test.as(:'B_ADMIN');
select test.eq('files: B admin may not read an A file version', public.can_view_document_version(:'VER_A1')::text, 'false');
select test.eq('files: B admin gets no A quote document path', coalesce(public.sub_quote_document_path(gen_random_uuid(), :'VER_A1'), 'none'), 'none');
select test.as(:'A_ADMIN');
select test.eq('files: A admin may not read a B file version', public.can_view_document_version(:'VER_B1')::text, 'false');
select test.as(:'A_STAFF');
select test.eq('files: A staff on PA1 may read the PA1 file', public.can_view_document_version(:'VER_A1')::text, 'true');
select test.eq('files: A staff off PA2 may not read the PA2 file', public.can_view_document_version(:'VER_A2')::text, 'false');
select test.as(:'A_OWNER');
select test.eq('files: homeowner may not read an internal file', public.can_view_document_version(:'VER_A1')::text, 'false');
select test.as(:'A_SUB');
select test.eq('files: subcontractor may not read an internal library file', public.can_view_document_version(:'VER_A1')::text, 'false');
select test.eq('files: subcontractor gets no path without a quote invitation', coalesce(public.sub_quote_document_path(gen_random_uuid(), :'VER_A1'), 'none'), 'none');
select test.as(null);
select test.eq('files: anonymous session may not read an A file version', public.can_view_document_version(:'VER_A1')::text, 'false');
select test.eq('files: anonymous session sees no versions', (select count(*)::text from public.project_document_versions), '0');

-- ───────── 4. Homeowner and restricted financial data ─────────
select test.as(:'A_OWNER');
select test.eq('financial: homeowner sees no internal estimates', (select count(*)::text from public.estimates), '0');
select test.eq('financial: homeowner sees no commitments', (select count(*)::text from public.project_commitments), '0');
select test.eq('financial: homeowner sees no internal documents', (select count(*)::text from public.project_documents where visibility = 'internal'), '0');
select test.eq('financial: homeowner sees no other project', (select count(*)::text from public.projects where id in (:'PA2', :'PB1')), '0');
with u as (update public.estimates set name = 'changed' where id = :'EST_A' returning 1)
select test.eq('financial: homeowner cannot change an estimate', (select count(*)::text from u), '0');
select test.as(:'A_STAFF');
select test.eq('financial: non-manager staff cannot see commitments', (select count(*)::text from public.project_commitments), '0');

-- ───────── 5. Subcontractor scope ─────────
select test.as(:'A_SUB');
select test.eq('sub: sees no unassigned A project', (select count(*)::text from public.projects where id = :'PA2'), '0');
select test.eq('sub: sees no B project', (select count(*)::text from public.projects where organization_id = :'ORG_B'), '0');
select test.eq('sub: sees no estimates', (select count(*)::text from public.estimates), '0');
select test.eq('sub: sees no commitments', (select count(*)::text from public.project_commitments), '0');
select test.eq('sub: sees no clients', (select count(*)::text from public.clients), '0');
select test.eq('sub: own company ids are only Acme', (select string_agg(id::text, ',') from public.sub_company_ids() as t(id)), '00000000-0000-0000-0000-000000000c01');
with u as (update public.projects set name = 'changed' where id = :'PA1' returning 1)
select test.eq('sub: cannot change the assigned project', (select count(*)::text from u), '0');
select test.as(:'A_SUB_UNASSIGNED');
select test.eq('sub: unassigned company sees no A projects', (select count(*)::text from public.projects where organization_id = :'ORG_A'), '0');

reset role;
select label, detail from test.results where not pass order by id;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from test.results;
