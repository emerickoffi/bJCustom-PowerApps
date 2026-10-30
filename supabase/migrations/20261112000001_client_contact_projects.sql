-- Additive: optional project scoping for homeowner additional contacts.
-- A client_contacts row with NO client_contact_projects rows keeps its existing meaning
-- (applies to every project of that client). A contact with one or more rows appears
-- only on those projects. Portal access is unaffected: it is still granted solely via
-- portal_accounts + portal_project_access through the Manage Access workflow.

create table if not exists public.client_contact_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  contact_id uuid not null references public.client_contacts(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (contact_id, project_id)
);
create index if not exists client_contact_projects_project_idx on public.client_contact_projects (project_id);

create or replace function public.client_contact_projects_validate()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_contact_org uuid; v_client uuid; v_project_org uuid;
begin
  select organization_id, client_id into v_contact_org, v_client from public.client_contacts where id = new.contact_id;
  select organization_id into v_project_org from public.projects where id = new.project_id;
  if v_contact_org is null or v_project_org is null
     or v_contact_org <> new.organization_id or v_project_org <> new.organization_id then
    raise exception 'Contact and project must belong to the same organization';
  end if;
  if not exists (select 1 from public.project_clients where project_id = new.project_id and client_id = v_client) then
    raise exception 'This contact''s homeowner is not linked to the project';
  end if;
  return new;
end;
$$;

drop trigger if exists client_contact_projects_validate on public.client_contact_projects;
create trigger client_contact_projects_validate before insert or update on public.client_contact_projects
  for each row execute function public.client_contact_projects_validate();

drop trigger if exists audit_client_contact_projects on public.client_contact_projects;
create trigger audit_client_contact_projects after insert or update or delete on public.client_contact_projects
  for each row execute function public.write_audit_event();

alter table public.client_contact_projects enable row level security;

drop policy if exists client_contact_projects_select on public.client_contact_projects;
create policy client_contact_projects_select on public.client_contact_projects for select to authenticated
  using (public.is_org_staff(organization_id));
drop policy if exists client_contact_projects_insert on public.client_contact_projects;
create policy client_contact_projects_insert on public.client_contact_projects for insert to authenticated
  with check (public.is_org_manager(organization_id) and created_by = auth.uid());
drop policy if exists client_contact_projects_delete on public.client_contact_projects;
create policy client_contact_projects_delete on public.client_contact_projects for delete to authenticated
  using (public.is_org_manager(organization_id));
