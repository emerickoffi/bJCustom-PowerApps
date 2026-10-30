-- Business Contacts directory (Phase 1): people, companies, categories, person<->company and person<->project links.
-- FOR REVIEW — additive only. No existing table, column, constraint, policy, or row is modified.
--
-- Security model:
-- * Business contacts are directory records, NOT users. Nothing here touches auth.users, organization_memberships,
--   portal_accounts, portal_project_access, or any project login grant.
-- * Every table is tenant-scoped. Child tables use composite (organization_id, id) foreign keys so a row can only
--   reference parents in the same organization. References to existing tables (projects, subcontractor_companies)
--   are validated by triggers because those tables have no (organization_id, id) unique key and we do not alter them.
-- * Staff (public.is_org_staff) can read; admins and project managers (public.is_org_manager) can write.
--   Homeowners, anon, and other tenants get nothing.
-- * Rows are never deleted. People/companies become 'inactive'; relationships become 'ended' and stay as history.
--   Every change is written to audit_events through public.write_audit_event().
-- * Subcontractor compatibility: business_companies.subcontractor_company_id optionally links one directory company
--   to one existing subcontractor_companies row. Existing subcontractor IDs, trades, statuses, project assignments,
--   schedule assignments, Daily Logs crews, and job-cost references are untouched. Company-to-project work keeps
--   using subcontractor_project_assignments. Linking is explicit (link_subcontractor_company); nothing is auto-copied.
--
-- Apply after 20261104000010_subcontractor_project_assignment_history.sql.

-- ============ People ============
create table public.business_people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 80),
  middle_name text check (middle_name is null or char_length(middle_name) <= 80),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 80),
  email text check (email is null or (char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  primary_phone text check (primary_phone is null or primary_phone ~ '^[0-9+().\-\s]{7,30}$'),
  secondary_phone text check (secondary_phone is null or secondary_phone ~ '^[0-9+().\-\s]{7,30}$'),
  specialty text check (specialty is null or char_length(specialty) <= 160),
  notes text check (notes is null or char_length(notes) <= 5000),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
-- Email is the only safe uniqueness signal for people; names are never used to merge or block.
create unique index business_people_org_email_key
  on public.business_people (organization_id, lower(btrim(email))) where email is not null;
create index business_people_org_name_idx
  on public.business_people (organization_id, lower(last_name), lower(first_name));

-- ============ Companies ============
create table public.business_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  company_name text not null check (char_length(btrim(company_name)) between 1 and 160),
  company_email text check (company_email is null or (char_length(company_email) <= 254 and company_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  company_phone text check (company_phone is null or company_phone ~ '^[0-9+().\-\s]{7,30}$'),
  secondary_company_phone text check (secondary_company_phone is null or secondary_company_phone ~ '^[0-9+().\-\s]{7,30}$'),
  website text check (website is null or char_length(website) <= 300),
  address_line1 text check (address_line1 is null or char_length(address_line1) <= 200),
  address_line2 text check (address_line2 is null or char_length(address_line2) <= 200),
  city text check (city is null or char_length(city) <= 120),
  state text check (state is null or char_length(state) <= 60),
  postal_code text check (postal_code is null or char_length(postal_code) <= 20),
  country text not null default 'United States' check (char_length(country) <= 80),
  notes text check (notes is null or char_length(notes) <= 5000),
  status text not null default 'active' check (status in ('active', 'inactive')),
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index business_companies_org_name_key
  on public.business_companies (organization_id, lower(btrim(company_name)));
create unique index business_companies_subcontractor_key
  on public.business_companies (subcontractor_company_id) where subcontractor_company_id is not null;
create index business_companies_org_status_idx
  on public.business_companies (organization_id, status, company_name);

-- ============ Categories ============
-- kind 'business' = what a company is (Supplier, Subcontractor, Realtor, Professional Attorney, Property Manager...).
-- kind 'product'  = what a supplier provides (Lumber, Windows, Plumbing Fixtures...).
create table public.business_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  kind text not null check (kind in ('business', 'product')),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);
create unique index business_categories_org_kind_name_key
  on public.business_categories (organization_id, kind, lower(btrim(name)));

create table public.business_company_categories (
  organization_id uuid not null,
  company_id uuid not null,
  category_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (company_id, category_id),
  foreign key (organization_id, company_id) references public.business_companies(organization_id, id) on delete restrict,
  foreign key (organization_id, category_id) references public.business_categories(organization_id, id) on delete restrict
);
create index business_company_categories_category_idx on public.business_company_categories (category_id);

-- ============ Person <-> Company ============
create table public.business_person_companies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  company_id uuid not null,
  position_or_role text check (position_or_role is null or char_length(position_or_role) <= 120),
  is_primary_contact boolean not null default false,
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at date not null default current_date,
  ended_at date,
  ended_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, person_id) references public.business_people(organization_id, id) on delete restrict,
  foreign key (organization_id, company_id) references public.business_companies(organization_id, id) on delete restrict,
  check ((status = 'active' and ended_at is null) or (status = 'ended' and ended_at is not null)),
  check (ended_at is null or ended_at >= started_at)
);
create unique index business_person_companies_active_key
  on public.business_person_companies (person_id, company_id) where status = 'active';
create unique index business_person_companies_primary_key
  on public.business_person_companies (company_id) where status = 'active' and is_primary_contact;
create index business_person_companies_company_idx on public.business_person_companies (company_id, status);

-- ============ Person <-> Project ============
create table public.business_person_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  person_id uuid not null,
  project_id uuid not null references public.projects(id) on delete restrict,
  person_company_id uuid,
  project_role text not null check (char_length(btrim(project_role)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'ended')),
  started_at date not null default current_date,
  ended_at date,
  ended_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organization_id, person_id) references public.business_people(organization_id, id) on delete restrict,
  foreign key (organization_id, person_company_id) references public.business_person_companies(organization_id, id) on delete restrict,
  check ((status = 'active' and ended_at is null) or (status = 'ended' and ended_at is not null)),
  check (ended_at is null or ended_at >= started_at)
);
create unique index business_person_projects_active_key
  on public.business_person_projects (person_id, project_id) where status = 'active';
create index business_person_projects_project_idx on public.business_person_projects (project_id, status);
create index business_person_projects_person_company_idx
  on public.business_person_projects (person_company_id) where person_company_id is not null;

-- ============ Triggers ============
create trigger business_people_updated_at before update on public.business_people
  for each row execute function public.set_updated_at();
create trigger business_companies_updated_at before update on public.business_companies
  for each row execute function public.set_updated_at();
create trigger business_categories_updated_at before update on public.business_categories
  for each row execute function public.set_updated_at();
create trigger business_person_companies_updated_at before update on public.business_person_companies
  for each row execute function public.set_updated_at();
create trigger business_person_projects_updated_at before update on public.business_person_projects
  for each row execute function public.set_updated_at();

-- Shared guard: no deletes, immutable identity, server-set authorship.
create or replace function public.business_directory_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Business contact records cannot be deleted; mark them inactive or end the relationship instead.';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    if tg_table_name <> 'business_categories' and tg_table_name <> 'business_company_categories' then
      new.updated_by := auth.uid();
    end if;
    return new;
  end if;
  if new.organization_id <> old.organization_id
     or new.created_by is distinct from old.created_by
     or new.created_at <> old.created_at then
    raise exception 'Business contact identity fields cannot be changed';
  end if;
  if tg_table_name <> 'business_categories' then
    new.updated_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger business_people_before_write before insert or update or delete on public.business_people
  for each row execute function public.business_directory_before_write();
create trigger business_companies_before_write before insert or update or delete on public.business_companies
  for each row execute function public.business_directory_before_write();
create trigger business_categories_before_write before insert or update or delete on public.business_categories
  for each row execute function public.business_directory_before_write();
create trigger business_person_companies_before_write before insert or update or delete on public.business_person_companies
  for each row execute function public.business_directory_before_write();
create trigger business_person_projects_before_write before insert or update or delete on public.business_person_projects
  for each row execute function public.business_directory_before_write();

-- Category links are tags, not history, so managers may remove them; authorship is still server-set.
create or replace function public.business_company_categories_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger business_company_categories_before_write before insert on public.business_company_categories
  for each row execute function public.business_company_categories_before_write();

-- A directory company may only link to a subcontractor in the same organization, and the link is permanent once set.
create or replace function public.business_companies_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.subcontractor_company_id is not null then
    if tg_op = 'UPDATE' and old.subcontractor_company_id is not null
       and new.subcontractor_company_id is distinct from old.subcontractor_company_id then
      raise exception 'A company''s subcontractor link cannot be changed once set';
    end if;
    if not exists (
      select 1 from public.subcontractor_companies s
      where s.id = new.subcontractor_company_id and s.organization_id = new.organization_id
    ) then
      raise exception 'Subcontractor company does not belong to this organization';
    end if;
  elsif tg_op = 'UPDATE' and old.subcontractor_company_id is not null then
    raise exception 'A company''s subcontractor link cannot be removed';
  end if;
  return new;
end;
$$;
create trigger business_companies_validate before insert or update on public.business_companies
  for each row execute function public.business_companies_validate();

-- Relationship lifecycle: active -> ended only; new active links require active people/companies.
create or replace function public.business_person_companies_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.person_id <> old.person_id or new.company_id <> old.company_id or new.started_at <> old.started_at then
      raise exception 'Relationship parties cannot be changed; end it and create a new one';
    end if;
    if old.status = 'ended' and new.status = 'active' then
      raise exception 'Ended relationships cannot be reactivated; create a new one';
    end if;
    if old.status = 'ended' and (new.ended_at is distinct from old.ended_at or new.is_primary_contact <> old.is_primary_contact) then
      raise exception 'Ended relationships are historical and cannot be edited';
    end if;
    if old.status = 'active' and new.status = 'ended' then
      new.ended_by := auth.uid();
      new.is_primary_contact := false;
    end if;
  end if;
  if new.status = 'active' and (tg_op = 'INSERT' or old.status = 'active') then
    if exists (select 1 from public.business_people p where p.id = new.person_id and p.status <> 'active') then
      raise exception 'Inactive contacts cannot receive new active relationships';
    end if;
    if exists (select 1 from public.business_companies c where c.id = new.company_id and c.status <> 'active') then
      raise exception 'Inactive companies cannot receive new active relationships';
    end if;
  end if;
  if tg_op = 'INSERT' and new.status <> 'active' then
    raise exception 'New relationships must start active';
  end if;
  return new;
end;
$$;
create trigger business_person_companies_validate before insert or update on public.business_person_companies
  for each row execute function public.business_person_companies_validate();

create or replace function public.business_person_projects_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.person_id <> old.person_id or new.project_id <> old.project_id or new.started_at <> old.started_at
       or new.person_company_id is distinct from old.person_company_id then
      raise exception 'Project association parties cannot be changed; end it and create a new one';
    end if;
    if old.status = 'ended' and (new.status = 'active' or new.ended_at is distinct from old.ended_at or new.project_role <> old.project_role) then
      raise exception 'Ended project associations are historical and cannot be edited';
    end if;
    if old.status = 'active' and new.status = 'ended' then
      new.ended_by := auth.uid();
    end if;
    return new;
  end if;

  if new.status <> 'active' then
    raise exception 'New project associations must start active';
  end if;
  if not exists (select 1 from public.projects pr where pr.id = new.project_id and pr.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  if exists (select 1 from public.business_people p where p.id = new.person_id and p.status <> 'active') then
    raise exception 'Inactive contacts cannot receive new project associations';
  end if;
  if new.person_company_id is not null and not exists (
    select 1 from public.business_person_companies pc
    where pc.id = new.person_company_id and pc.person_id = new.person_id and pc.status = 'active'
  ) then
    raise exception 'Company relationship must be an active relationship of this person';
  end if;
  return new;
end;
$$;
create trigger business_person_projects_validate before insert or update on public.business_person_projects
  for each row execute function public.business_person_projects_validate();

-- Deactivating a person or company never cascades: their history stays, they just cannot gain new active links.

create trigger audit_business_people after insert or update or delete on public.business_people
  for each row execute function public.write_audit_event();
create trigger audit_business_companies after insert or update or delete on public.business_companies
  for each row execute function public.write_audit_event();
create trigger audit_business_categories after insert or update or delete on public.business_categories
  for each row execute function public.write_audit_event();
create trigger audit_business_person_companies after insert or update or delete on public.business_person_companies
  for each row execute function public.write_audit_event();
create trigger audit_business_person_projects after insert or update or delete on public.business_person_projects
  for each row execute function public.write_audit_event();

-- ============ Explicit subcontractor linking (idempotent) ============
-- Returns the directory company linked to a subcontractor, creating it only if no link exists yet.
-- If a directory company with the same name already exists (unlinked), it is NOT merged: the call fails so a person
-- can decide. Runs as the caller, so RLS and is_org_manager apply.
create or replace function public.link_subcontractor_company(p_subcontractor uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_company uuid;
  v_sub public.subcontractor_companies%rowtype;
begin
  select id into v_company from public.business_companies where subcontractor_company_id = p_subcontractor;
  if v_company is not null then
    return v_company;
  end if;

  select * into v_sub from public.subcontractor_companies where id = p_subcontractor;
  if not found then
    raise exception 'Subcontractor company not found';
  end if;

  if exists (
    select 1 from public.business_companies c
    where c.organization_id = v_sub.organization_id and lower(btrim(c.company_name)) = lower(btrim(v_sub.company_name))
  ) then
    raise exception 'A business company named "%" already exists; link it manually instead of creating a duplicate', v_sub.company_name;
  end if;

  insert into public.business_companies (organization_id, company_name, company_email, company_phone, status, subcontractor_company_id)
  values (v_sub.organization_id, v_sub.company_name, v_sub.email, v_sub.phone, v_sub.status, v_sub.id)
  returning id into v_company;
  return v_company;
end;
$$;
revoke all on function public.link_subcontractor_company(uuid) from public, anon;
grant execute on function public.link_subcontractor_company(uuid) to authenticated;

-- ============ RLS ============
alter table public.business_people enable row level security;
alter table public.business_companies enable row level security;
alter table public.business_categories enable row level security;
alter table public.business_company_categories enable row level security;
alter table public.business_person_companies enable row level security;
alter table public.business_person_projects enable row level security;

revoke all on public.business_people, public.business_companies, public.business_categories,
  public.business_company_categories, public.business_person_companies, public.business_person_projects from anon;

do $$
declare
  t text;
begin
  foreach t in array array['business_people', 'business_companies', 'business_categories',
                           'business_person_companies', 'business_person_projects'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_org_staff(organization_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.is_org_manager(organization_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id))', t);
  end loop;
end;
$$;
-- No delete policies on the tables above: deletes are denied for every role (and blocked by trigger).

create policy business_company_categories_select on public.business_company_categories for select to authenticated
  using (public.is_org_staff(organization_id));
create policy business_company_categories_insert on public.business_company_categories for insert to authenticated
  with check (public.is_org_manager(organization_id));
create policy business_company_categories_delete on public.business_company_categories for delete to authenticated
  using (public.is_org_manager(organization_id));
