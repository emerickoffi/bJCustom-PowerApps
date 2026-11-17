-- Tenant isolation hardening.
--
-- 1. A project-scoped row must belong to the same organization as its project. Until now this relied on
--    per-table triggers and policies, and some tables (for example the AI request logs) had neither.
--    A composite foreign key (project_id, organization_id) -> projects (id, organization_id) now
--    enforces it in the database for every table that has both columns.
-- 2. Signed-out callers (the anon role) can no longer execute SECURITY DEFINER functions. The one
--    exception is invitation_preview, which the invite page calls before the person has signed in.
--    New functions in public are no longer executable by anon by default: grant it explicitly if a
--    future function really must run for signed-out visitors.
-- 3. Policies that applied to every role (PUBLIC) now apply only to signed-in users, so signed-out
--    requests match no policy instead of calling helper functions they may no longer execute.
--
-- Safe to re-run: every step checks what already exists.

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

-- ───────── 2. Signed-out callers cannot run SECURITY DEFINER functions ─────────

do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig,
           has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_ok,
           has_function_privilege('service_role', p.oid, 'EXECUTE') as service_ok
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.prokind = 'f'
      and p.proname <> 'invitation_preview'
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  loop
    -- Keep signed-in and server access exactly as it was, then remove the signed-out paths.
    if f.auth_ok then execute format('grant execute on function %s to authenticated', f.sig); end if;
    if f.service_ok then execute format('grant execute on function %s to service_role', f.sig); end if;
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- Future functions created by migrations (run as postgres) are not executable by anon unless granted.
alter default privileges for role postgres in schema public revoke execute on functions from anon;
alter default privileges for role postgres revoke execute on functions from public;

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
