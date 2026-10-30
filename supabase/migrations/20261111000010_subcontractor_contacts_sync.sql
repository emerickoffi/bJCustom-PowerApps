-- Keeps every subcontractor company discoverable in Contacts through exactly one linked business_companies row.
-- subcontractor_companies stays authoritative for company_name, email, phone and status; the linked row is a
-- one-way, trigger-maintained copy so every staff role (not only managers, who can read subcontractor_companies)
-- sees current values. Idempotent: safe to re-run.

-- 1. Create the linked directory record when a subcontractor is created.
create or replace function public.subcontractor_companies_link_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.business_companies where subcontractor_company_id = new.id) then
    return new;
  end if;
  -- An unlinked company with the same name needs a human decision; never merge records by name.
  if exists (
    select 1 from public.business_companies c
    where c.organization_id = new.organization_id and lower(btrim(c.company_name)) = lower(btrim(new.company_name))
  ) then
    return new;
  end if;
  begin
    insert into public.business_companies (organization_id, company_name, company_email, company_phone, status, subcontractor_company_id)
    values (new.organization_id, new.company_name, new.email, new.phone, new.status, new.id);
  exception when unique_violation then
    -- A concurrent write created the same link or name; the subcontractor itself must still be saved.
    null;
  end;
  return new;
end;
$$;

-- 2. Mirror authoritative field changes onto the linked directory record.
create or replace function public.subcontractor_companies_sync_directory()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.business_companies
     set company_name = new.company_name,
         company_email = new.email,
         company_phone = new.phone,
         status = new.status
   where subcontractor_company_id = new.id
     and (company_name is distinct from new.company_name
          or company_email is distinct from new.email
          or company_phone is distinct from new.phone
          or status is distinct from new.status);
  return new;
end;
$$;

revoke execute on function public.subcontractor_companies_link_directory() from public, anon, authenticated;
revoke execute on function public.subcontractor_companies_sync_directory() from public, anon, authenticated;

drop trigger if exists subcontractor_companies_link_directory on public.subcontractor_companies;
create trigger subcontractor_companies_link_directory
  after insert on public.subcontractor_companies
  for each row execute function public.subcontractor_companies_link_directory();

drop trigger if exists subcontractor_companies_sync_directory on public.subcontractor_companies;
create trigger subcontractor_companies_sync_directory
  after update of company_name, email, phone, status on public.subcontractor_companies
  for each row execute function public.subcontractor_companies_sync_directory();

-- 3. The subcontractor_companies audit trigger already records these changes. Skip auditing the mirrored writes,
--    which run inside another trigger, so one change produces one audit event. Direct edits (depth 0) are audited.
drop trigger if exists audit_business_companies on public.business_companies;
create trigger audit_business_companies
  after insert or delete or update on public.business_companies
  for each row when (pg_trigger_depth() < 1)
  execute function public.write_audit_event();

-- 4. Backfill existing subcontractors that have no linked directory record. Name collisions are left for review.
insert into public.business_companies (organization_id, company_name, company_email, company_phone, status, subcontractor_company_id)
select s.organization_id, s.company_name, s.email, s.phone, s.status, s.id
from public.subcontractor_companies s
where not exists (select 1 from public.business_companies c where c.subcontractor_company_id = s.id)
  and not exists (
    select 1 from public.business_companies c
    where c.organization_id = s.organization_id and lower(btrim(c.company_name)) = lower(btrim(s.company_name))
  );

-- 5. Re-align any already-linked records whose copied fields drifted before this migration.
update public.business_companies c
   set company_name = s.company_name, company_email = s.email, company_phone = s.phone, status = s.status
  from public.subcontractor_companies s
 where c.subcontractor_company_id = s.id
   and (c.company_name is distinct from s.company_name
        or c.company_email is distinct from s.email
        or c.company_phone is distinct from s.phone
        or c.status is distinct from s.status);
