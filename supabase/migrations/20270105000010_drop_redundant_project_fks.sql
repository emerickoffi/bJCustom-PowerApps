-- The composite (project_id, organization_id) keys added in tenant_isolation_hardening fully cover the
-- old single-column project_id keys (same delete behaviour, and they also check the project exists).
-- Keeping both gave PostgREST two relationships to projects, so embeds like projects(...) failed
-- with PGRST201. Drop the old single-column key wherever the composite key exists.
do $$
declare f record;
begin
  for f in
    select c.conrelid::regclass as tbl, c.conname
    from pg_constraint c
    join pg_class k on k.oid = c.conrelid
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.projects'::regclass
      and k.relnamespace = 'public'::regnamespace
      and array_length(c.conkey, 1) = 1
      and a.attname = 'project_id'
      and exists (select 1 from pg_constraint x
                  where x.conrelid = c.conrelid and x.contype = 'f'
                    and x.confrelid = 'public.projects'::regclass
                    and x.conname = left(k.relname, 46) || '_project_org_fkey'
                    and x.convalidated)
  loop
    execute format('alter table %s drop constraint %I', f.tbl, f.conname);
  end loop;
end $$;

notify pgrst, 'reload schema';
