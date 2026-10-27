-- Administrator-provisioned accounts and explicit homeowner project access.

alter table public.organization_memberships
  add column if not exists activation_required boolean not null default false;

-- A membership grants no data access until its first-login activation is complete.
create or replace function public.user_org_role(p_org uuid)
returns public.org_role language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_memberships m
  where m.organization_id = p_org and m.user_id = auth.uid()
    and m.status = 'active' and not m.activation_required
  limit 1;
$$;

create table public.portal_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  contact_id uuid references public.client_contacts(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index portal_accounts_client_idx on public.portal_accounts (client_id);

create table public.portal_project_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  portal_account_id uuid not null references public.portal_accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (portal_account_id, project_id)
);
create index portal_project_access_user_idx on public.portal_project_access (user_id, project_id);

create or replace function public.portal_accounts_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id) then
    raise exception 'Client does not belong to this organization';
  end if;
  if new.contact_id is not null and not exists (
    select 1 from public.client_contacts cc where cc.id = new.contact_id and cc.client_id = new.client_id
  ) then
    raise exception 'Contact does not belong to this client';
  end if;
  if tg_op = 'UPDATE' and (new.user_id <> old.user_id or new.client_id <> old.client_id or new.organization_id <> old.organization_id) then
    raise exception 'Portal account identity cannot be changed';
  end if;
  return new;
end;
$$;
create trigger portal_accounts_validate before insert or update on public.portal_accounts
  for each row execute function public.portal_accounts_validate();

-- A grant is only valid for a project the account's client is actually linked to.
create or replace function public.portal_project_access_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_account public.portal_accounts;
begin
  select * into v_account from public.portal_accounts pa where pa.id = new.portal_account_id;
  if v_account.id is null or v_account.organization_id <> new.organization_id then
    raise exception 'Portal account does not belong to this organization';
  end if;
  new.user_id := v_account.user_id;
  if not exists (
    select 1 from public.project_clients pc
    where pc.project_id = new.project_id and pc.client_id = v_account.client_id and pc.organization_id = new.organization_id
  ) then
    raise exception 'This project is not linked to the homeowner''s client record';
  end if;
  return new;
end;
$$;
create trigger portal_project_access_validate before insert or update on public.portal_project_access
  for each row execute function public.portal_project_access_validate();

create trigger audit_portal_accounts after insert or update or delete on public.portal_accounts
  for each row execute function public.write_audit_event();
create trigger audit_portal_project_access after insert or update or delete on public.portal_project_access
  for each row execute function public.write_audit_event();

alter table public.portal_accounts enable row level security;
create policy portal_accounts_select on public.portal_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_org_staff(organization_id));
create policy portal_accounts_insert on public.portal_accounts for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy portal_accounts_update on public.portal_accounts for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy portal_accounts_delete on public.portal_accounts for delete to authenticated
  using (public.is_org_admin(organization_id));

alter table public.portal_project_access enable row level security;
create policy portal_project_access_select on public.portal_project_access for select to authenticated
  using (user_id = auth.uid() or public.is_org_staff(organization_id));
create policy portal_project_access_insert on public.portal_project_access for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy portal_project_access_delete on public.portal_project_access for delete to authenticated
  using (public.is_org_admin(organization_id));

-- Homeowners see only projects explicitly granted to them, never every project on a client record.
create or replace function public.is_project_homeowner(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.portal_project_access a
    join public.portal_accounts pa on pa.id = a.portal_account_id
    join public.projects p on p.id = a.project_id
    join public.project_clients pc on pc.project_id = p.id and pc.client_id = pa.client_id
    where a.project_id = p_project
      and a.user_id = auth.uid()
      and p.archived_at is null
      and public.user_org_role(p.organization_id) = 'client'
  );
$$;

create or replace function public.get_portal_projects()
returns table(id uuid, organization_id uuid, project_number text, name text, status public.project_status,
  address_line1 text, city text, state text, postal_code text, progress_percent numeric,
  proposed_start_date date, target_completion_date date, project_manager_name text, relationship text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.organization_id, p.project_number, p.name, p.status,
         p.address_line1, p.city, p.state, p.postal_code, p.progress_percent,
         p.proposed_start_date, p.target_completion_date, pr.full_name, pc.relationship
  from public.portal_project_access a
  join public.portal_accounts pa on pa.id = a.portal_account_id
  join public.projects p on p.id = a.project_id
  join public.project_clients pc on pc.project_id = p.id and pc.client_id = pa.client_id
  left join public.profiles pr on pr.id = p.project_manager_id
  where a.user_id = auth.uid()
    and p.archived_at is null
    and public.user_org_role(p.organization_id) = 'client'
  order by p.created_at desc;
$$;
