-- Stage 1: tenants, identity, CRM, projects, audit

-- ============ ENUMS ============
create type public.org_role as enum ('org_admin', 'project_manager', 'builder_staff', 'client');
create type public.membership_status as enum ('active', 'suspended');
create type public.invitation_status as enum ('pending', 'accepted', 'revoked');
create type public.client_status as enum ('lead', 'active', 'inactive', 'archived');
create type public.communication_method as enum ('email', 'phone', 'text', 'any');
create type public.project_status as enum (
  'lead', 'consultation', 'planning', 'estimating', 'awaiting_approval',
  'preconstruction', 'under_construction', 'final_inspection', 'punch_list',
  'substantially_complete', 'completed', 'on_hold', 'cancelled'
);

-- ============ SHARED TRIGGER ============
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============ TENANT & IDENTITY ============
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 120),
  legal_name text check (legal_name is null or char_length(legal_name) <= 160),
  logo_url text,
  primary_color text not null default '#174D32' check (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text not null default '#103B27' check (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'United States',
  phone text,
  email text,
  website text,
  subscription_status text not null default 'internal',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  project_number_prefix text not null default 'P' check (project_number_prefix ~ '^[A-Z0-9]{1,6}$'),
  next_project_number integer not null default 1001 check (next_project_number > 0),
  next_client_number integer not null default 1001 check (next_client_number > 0),
  default_country text not null default 'United States',
  updated_at timestamptz not null default now()
);
create trigger organization_settings_updated_at before update on public.organization_settings
  for each row execute function public.set_updated_at();

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.platform_administrators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ============ CRM ============
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_number integer not null,
  first_name text not null check (char_length(first_name) between 1 and 80),
  middle_name text,
  last_name text not null check (char_length(last_name) between 1 and 80),
  company_name text,
  email text,
  phone text,
  alternate_phone text,
  address_line1 text,
  address_line2 text,
  city text,
  state text,
  postal_code text,
  country text not null default 'United States',
  preferred_communication public.communication_method not null default 'email',
  notes text,
  status public.client_status not null default 'active',
  portal_user_id uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, client_number)
);
create index clients_org_idx on public.clients (organization_id);
create index clients_org_last_name_idx on public.clients (organization_id, lower(last_name));
create index clients_org_email_idx on public.clients (organization_id, lower(email));
create index clients_portal_user_idx on public.clients (portal_user_id);
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.org_role not null,
  status public.membership_status not null default 'active',
  client_id uuid references public.clients(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.organization_memberships (user_id);
create trigger memberships_updated_at before update on public.organization_memberships
  for each row execute function public.set_updated_at();

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.org_role not null,
  client_id uuid references public.clients(id) on delete cascade,
  status public.invitation_status not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now(),
  check ((role = 'client') = (client_id is not null))
);
create unique index invitations_pending_unique on public.invitations (organization_id, lower(email)) where status = 'pending';

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  relationship text not null default 'other'
    check (relationship in ('spouse', 'co_owner', 'family', 'agent', 'attorney', 'other')),
  email text,
  phone text,
  is_primary boolean not null default false,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_contacts_client_idx on public.client_contacts (client_id);
create trigger client_contacts_updated_at before update on public.client_contacts
  for each row execute function public.set_updated_at();

-- ============ PROJECTS ============
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_number text not null,
  name text not null check (char_length(name) between 2 and 160),
  primary_client_id uuid not null references public.clients(id) on delete restrict,
  project_type text not null default 'new_custom_home'
    check (project_type in ('new_custom_home', 'renovation', 'addition', 'remodel', 'other')),
  description text,
  address_line1 text not null,
  address_line2 text,
  city text not null,
  state text not null,
  postal_code text not null,
  country text not null default 'United States',
  lot text,
  block text,
  phase text,
  community text,
  legal_description text,
  estimated_budget_cents bigint check (estimated_budget_cents is null or estimated_budget_cents >= 0),
  proposed_start_date date,
  target_completion_date date,
  project_manager_id uuid references auth.users(id) on delete set null,
  status public.project_status not null default 'lead',
  progress_percent numeric(5,2) not null default 0 check (progress_percent between 0 and 100),
  internal_notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (organization_id, project_number),
  check (target_completion_date is null or proposed_start_date is null or target_completion_date >= proposed_start_date)
);
create index projects_org_idx on public.projects (organization_id);
create index projects_client_idx on public.projects (primary_client_id);
create index projects_pm_idx on public.projects (project_manager_id);
create index projects_org_status_idx on public.projects (organization_id, status);
create trigger projects_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

create table public.project_clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete restrict,
  relationship text not null default 'co_owner'
    check (relationship in ('primary_owner', 'co_owner', 'authorized_contact')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, client_id)
);
create index project_clients_client_idx on public.project_clients (client_id);

create table public.project_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_role text not null default 'staff' check (project_role in ('project_manager', 'staff', 'viewer')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

create table public.project_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  from_status public.project_status,
  to_status public.project_status not null,
  note text,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index project_status_history_project_idx on public.project_status_history (project_id, created_at desc);

create table public.client_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,
  activity_type text not null check (activity_type in ('note', 'call', 'email', 'meeting', 'site_visit', 'system')),
  summary text not null check (char_length(summary) between 1 and 500),
  details text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index client_activity_client_idx on public.client_activity (client_id, created_at desc);

-- ============ SYSTEM ============
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  changed_fields text[],
  created_at timestamptz not null default now()
);
create index audit_events_org_idx on public.audit_events (organization_id, created_at desc);
create index audit_events_entity_idx on public.audit_events (entity_type, entity_id);

-- ============ AUTHORIZATION HELPERS ============
create or replace function public.user_org_role(p_org uuid)
returns public.org_role language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_memberships m
  where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  limit 1;
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.user_org_role(p_org) is not null;
$$;

create or replace function public.is_org_staff(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.user_org_role(p_org) in ('org_admin', 'project_manager', 'builder_staff'), false);
$$;

create or replace function public.is_org_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.user_org_role(p_org) in ('org_admin', 'project_manager'), false);
$$;

create or replace function public.is_org_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(public.user_org_role(p_org) = 'org_admin', false);
$$;

create or replace function public.can_view_project_internal(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project
      and (
        public.is_org_manager(p.organization_id)
        or (
          public.is_org_staff(p.organization_id)
          and (
            p.project_manager_id = auth.uid()
            or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
          )
        )
      )
  );
$$;

create or replace function public.can_view_client(p_client uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.clients c
    where c.id = p_client
      and (
        public.is_org_manager(c.organization_id)
        or (c.portal_user_id = auth.uid() and public.is_org_member(c.organization_id))
        or (
          public.is_org_staff(c.organization_id)
          and exists (
            select 1 from public.project_clients pc
            where pc.client_id = c.id and public.can_view_project_internal(pc.project_id)
          )
        )
      )
  );
$$;

create or replace function public.shares_org_with(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships mine
    join public.organization_memberships theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and mine.role in ('org_admin', 'project_manager', 'builder_staff')
      and theirs.user_id = p_user
  );
$$;

-- ============ PROFILE ON SIGNUP ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ NUMBERING ============
create or replace function public.assign_client_number()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.organization_settings
    set next_client_number = next_client_number + 1
    where organization_id = new.organization_id
    returning next_client_number - 1 into new.client_number;
  if new.client_number is null then
    raise exception 'Organization settings are missing';
  end if;
  return new;
end;
$$;
create trigger clients_assign_number before insert on public.clients
  for each row execute function public.assign_client_number();

create or replace function public.assign_project_number()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prefix text;
  v_next integer;
begin
  update public.organization_settings
    set next_project_number = next_project_number + 1
    where organization_id = new.organization_id
    returning project_number_prefix, next_project_number - 1 into v_prefix, v_next;
  if v_next is null then
    raise exception 'Organization settings are missing';
  end if;
  new.project_number := v_prefix || '-' || v_next::text;
  return new;
end;
$$;
create trigger projects_assign_number before insert on public.projects
  for each row execute function public.assign_project_number();

-- ============ INTEGRITY: TENANT CONSISTENCY ============
create or replace function public.validate_project_refs()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.primary_client_id and c.organization_id = new.organization_id) then
    raise exception 'Primary client does not belong to this organization';
  end if;
  if new.project_manager_id is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = new.organization_id and m.user_id = new.project_manager_id
      and m.status = 'active' and m.role in ('org_admin', 'project_manager')
  ) then
    raise exception 'Project manager must be an active administrator or project manager of this organization';
  end if;
  return new;
end;
$$;
create trigger projects_validate_refs before insert or update of primary_client_id, project_manager_id, organization_id on public.projects
  for each row execute function public.validate_project_refs();

create or replace function public.validate_project_child_org()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  if tg_table_name = 'project_clients' then
    if not exists (select 1 from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id) then
      raise exception 'Client does not belong to this organization';
    end if;
  elsif tg_table_name = 'project_members' then
    if not exists (
      select 1 from public.organization_memberships m
      where m.organization_id = new.organization_id and m.user_id = new.user_id
        and m.status = 'active' and m.role in ('org_admin', 'project_manager', 'builder_staff')
    ) then
      raise exception 'Team member must be active builder staff of this organization';
    end if;
  end if;
  return new;
end;
$$;
create trigger project_clients_validate before insert or update on public.project_clients
  for each row execute function public.validate_project_child_org();
create trigger project_members_validate before insert or update on public.project_members
  for each row execute function public.validate_project_child_org();

create or replace function public.validate_client_child_org()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id) then
    raise exception 'Client does not belong to this organization';
  end if;
  if tg_table_name = 'client_activity' and new.project_id is not null
     and not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  return new;
end;
$$;
create trigger client_contacts_validate before insert or update on public.client_contacts
  for each row execute function public.validate_client_child_org();
create trigger client_activity_validate before insert or update on public.client_activity
  for each row execute function public.validate_client_child_org();

-- ============ PROJECT STATUS WORKFLOW ============
create or replace function public.project_status_transition_allowed(p_from public.project_status, p_to public.project_status)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  pipeline text[] := array['lead','consultation','planning','estimating','awaiting_approval','preconstruction',
    'under_construction','final_inspection','punch_list','substantially_complete','completed'];
  i_from integer := array_position(pipeline, p_from::text);
  i_to integer := array_position(pipeline, p_to::text);
begin
  if p_from = p_to then return true; end if;
  if p_from = 'completed' then return false; end if;
  if p_from = 'cancelled' then return p_to = 'lead'; end if;
  if p_to in ('on_hold', 'cancelled') then return true; end if;
  if p_from = 'on_hold' then return i_to is not null; end if;
  return i_to > i_from or i_to = i_from - 1;
end;
$$;

create or replace function public.guard_project_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status is distinct from old.status
     and not public.project_status_transition_allowed(old.status, new.status) then
    raise exception 'Status change from % to % is not allowed', old.status, new.status;
  end if;
  return new;
end;
$$;
create trigger projects_guard_status before update of status on public.projects
  for each row execute function public.guard_project_status();

create or replace function public.after_project_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.project_clients (organization_id, project_id, client_id, relationship, created_by)
      values (new.organization_id, new.id, new.primary_client_id, 'primary_owner', auth.uid())
      on conflict (project_id, client_id) do update set relationship = 'primary_owner';
    insert into public.project_status_history (organization_id, project_id, from_status, to_status, note, changed_by)
      values (new.organization_id, new.id, null, new.status, 'Project created', auth.uid());
    insert into public.client_activity (organization_id, client_id, project_id, activity_type, summary, created_by)
      values (new.organization_id, new.primary_client_id, new.id, 'system',
              'Project ' || new.project_number || ' "' || new.name || '" created', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.project_status_history (organization_id, project_id, from_status, to_status, note, changed_by)
      values (new.organization_id, new.id, old.status, new.status,
              nullif(current_setting('app.status_note', true), ''), auth.uid());
  end if;
  if tg_op = 'UPDATE' and new.primary_client_id is distinct from old.primary_client_id then
    insert into public.project_clients (organization_id, project_id, client_id, relationship, created_by)
      values (new.organization_id, new.id, new.primary_client_id, 'primary_owner', auth.uid())
      on conflict (project_id, client_id) do update set relationship = 'primary_owner';
    update public.project_clients set relationship = 'co_owner'
      where project_id = new.id and client_id = old.primary_client_id;
  end if;
  return new;
end;
$$;
create trigger projects_after_change after insert or update on public.projects
  for each row execute function public.after_project_change();

create or replace function public.change_project_status(p_project uuid, p_status public.project_status, p_note text default null)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform set_config('app.status_note', coalesce(left(p_note, 500), ''), true);
  update public.projects set status = p_status, updated_by = auth.uid() where id = p_project;
  if not found then
    raise exception 'Project not found or access denied';
  end if;
end;
$$;

-- ============ AUDIT ============
create or replace function public.write_audit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[];
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key) into v_fields
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_fields is null then return new; end if;
  end if;
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, changed_fields)
  values (
    coalesce((v_row ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end),
    auth.uid(), tg_table_name, (v_row ->> 'id')::uuid, lower(tg_op), v_fields
  );
  return coalesce(new, old);
end;
$$;
create trigger audit_organizations after update on public.organizations for each row execute function public.write_audit_event();
create trigger audit_memberships after insert or update or delete on public.organization_memberships for each row execute function public.write_audit_event();
create trigger audit_invitations after insert or update on public.invitations for each row execute function public.write_audit_event();
create trigger audit_clients after insert or update on public.clients for each row execute function public.write_audit_event();
create trigger audit_client_contacts after insert or update or delete on public.client_contacts for each row execute function public.write_audit_event();
create trigger audit_projects after insert or update on public.projects for each row execute function public.write_audit_event();
create trigger audit_project_clients after insert or update or delete on public.project_clients for each row execute function public.write_audit_event();
create trigger audit_project_members after insert or update or delete on public.project_members for each row execute function public.write_audit_event();

-- ============ RPCs ============
create or replace function public.create_organization(
  p_display_name text,
  p_legal_name text default null,
  p_phone text default null,
  p_email text default null,
  p_city text default null,
  p_state text default null,
  p_project_prefix text default 'P'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.organization_memberships where user_id = v_uid and status = 'active') then
    raise exception 'You already belong to an organization';
  end if;
  insert into public.organizations (display_name, legal_name, phone, email, city, state, created_by)
    values (trim(p_display_name), nullif(trim(p_legal_name), ''), nullif(trim(p_phone), ''),
            nullif(trim(p_email), ''), nullif(trim(p_city), ''), nullif(trim(p_state), ''), v_uid)
    returning id into v_org;
  insert into public.organization_settings (organization_id, project_number_prefix)
    values (v_org, upper(coalesce(nullif(trim(p_project_prefix), ''), 'P')));
  insert into public.organization_memberships (organization_id, user_id, role)
    values (v_org, v_uid, 'org_admin');
  return v_org;
end;
$$;

create or replace function public.accept_pending_invitations()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_count integer := 0;
  r record;
begin
  if v_uid is null then return 0; end if;
  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;
  if v_email is null or v_confirmed is null then return 0; end if;

  for r in
    select * from public.invitations i
    where lower(i.email) = v_email and i.status = 'pending' and i.expires_at > now()
  loop
    insert into public.organization_memberships (organization_id, user_id, role, client_id, invited_by)
      values (r.organization_id, v_uid, r.role, r.client_id, r.invited_by)
      on conflict (organization_id, user_id) do nothing;
    if r.client_id is not null then
      update public.clients set portal_user_id = v_uid
        where id = r.client_id and organization_id = r.organization_id and portal_user_id is null;
    end if;
    update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.get_portal_projects()
returns table (
  id uuid, organization_id uuid, project_number text, name text, status public.project_status,
  address_line1 text, city text, state text, postal_code text, progress_percent numeric,
  proposed_start_date date, target_completion_date date, project_manager_name text, relationship text
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.organization_id, p.project_number, p.name, p.status,
         p.address_line1, p.city, p.state, p.postal_code, p.progress_percent,
         p.proposed_start_date, p.target_completion_date, pr.full_name, pc.relationship
  from public.projects p
  join public.project_clients pc on pc.project_id = p.id
  join public.clients c on c.id = pc.client_id
  left join public.profiles pr on pr.id = p.project_manager_id
  where c.portal_user_id = auth.uid()
    and p.archived_at is null
    and public.is_org_member(p.organization_id)
  order by p.created_at desc;
$$;

revoke execute on function public.create_organization(text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.accept_pending_invitations() from public, anon;
revoke execute on function public.get_portal_projects() from public, anon;
revoke execute on function public.change_project_status(uuid, public.project_status, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.accept_pending_invitations() to authenticated;
grant execute on function public.get_portal_projects() to authenticated;
grant execute on function public.change_project_status(uuid, public.project_status, text) to authenticated;

-- ============ ROW LEVEL SECURITY ============
alter table public.organizations enable row level security;
alter table public.organization_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_administrators enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.client_activity enable row level security;
alter table public.projects enable row level security;
alter table public.project_clients enable row level security;
alter table public.project_members enable row level security;
alter table public.project_status_history enable row level security;
alter table public.audit_events enable row level security;

-- organizations
create policy organizations_select on public.organizations for select to authenticated using (public.is_org_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (public.is_org_admin(id)) with check (public.is_org_admin(id));

-- organization_settings
create policy org_settings_select on public.organization_settings for select to authenticated using (public.is_org_member(organization_id));
create policy org_settings_update on public.organization_settings for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_org_with(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- platform administrators (managed out-of-band only)
create policy platform_admins_select_own on public.platform_administrators for select to authenticated using (user_id = auth.uid());

-- memberships: only admins manage, never themselves
create policy memberships_select on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_org_staff(organization_id));
create policy memberships_update on public.organization_memberships for update to authenticated
  using (public.is_org_admin(organization_id) and user_id <> auth.uid())
  with check (public.is_org_admin(organization_id) and user_id <> auth.uid());
create policy memberships_delete on public.organization_memberships for delete to authenticated
  using (public.is_org_admin(organization_id) and user_id <> auth.uid());

-- invitations
create policy invitations_select on public.invitations for select to authenticated using (public.is_org_admin(organization_id)
  or (role = 'client' and public.is_org_manager(organization_id)));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (
    invited_by = auth.uid() and status = 'pending'
    and (
      public.is_org_admin(organization_id)
      or (role = 'client' and public.is_org_manager(organization_id))
    )
    and (client_id is null or exists (select 1 from public.clients c where c.id = client_id and c.organization_id = invitations.organization_id))
  );
create policy invitations_update on public.invitations for update to authenticated
  using (public.is_org_admin(organization_id) or (role = 'client' and public.is_org_manager(organization_id)))
  with check (status in ('pending', 'revoked'));

-- clients
create policy clients_select on public.clients for select to authenticated using (public.can_view_client(id));
create policy clients_insert on public.clients for insert to authenticated
  with check (public.is_org_manager(organization_id) and created_by = auth.uid() and portal_user_id is null);
create policy clients_update on public.clients for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));

-- client contacts
create policy client_contacts_select on public.client_contacts for select to authenticated
  using (public.is_org_staff(organization_id) and public.can_view_client(client_id));
create policy client_contacts_insert on public.client_contacts for insert to authenticated
  with check (public.is_org_manager(organization_id) and created_by = auth.uid());
create policy client_contacts_update on public.client_contacts for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
create policy client_contacts_delete on public.client_contacts for delete to authenticated
  using (public.is_org_manager(organization_id));

-- client activity (append-only)
create policy client_activity_select on public.client_activity for select to authenticated
  using (public.is_org_staff(organization_id) and public.can_view_client(client_id));
create policy client_activity_insert on public.client_activity for insert to authenticated
  with check (public.is_org_staff(organization_id) and created_by = auth.uid()
              and activity_type <> 'system' and public.can_view_client(client_id));

-- projects (builder side; homeowners use get_portal_projects)
create policy projects_select on public.projects for select to authenticated
  using (
    public.is_org_manager(organization_id)
    or (
      public.is_org_staff(organization_id)
      and (project_manager_id = auth.uid()
           or exists (select 1 from public.project_members pm where pm.project_id = projects.id and pm.user_id = auth.uid()))
    )
  );
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_org_manager(organization_id) and created_by = auth.uid());
create policy projects_update on public.projects for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));

-- project clients
create policy project_clients_select on public.project_clients for select to authenticated
  using (public.can_view_project_internal(project_id));
create policy project_clients_insert on public.project_clients for insert to authenticated
  with check (public.is_org_manager(organization_id) and relationship <> 'primary_owner');
create policy project_clients_delete on public.project_clients for delete to authenticated
  using (public.is_org_manager(organization_id) and relationship <> 'primary_owner');

-- project members
create policy project_members_select on public.project_members for select to authenticated
  using (public.is_org_staff(organization_id));
create policy project_members_insert on public.project_members for insert to authenticated
  with check (public.is_org_manager(organization_id));
create policy project_members_delete on public.project_members for delete to authenticated
  using (public.is_org_manager(organization_id));

-- status history (written by triggers only)
create policy project_status_history_select on public.project_status_history for select to authenticated
  using (public.can_view_project_internal(project_id));

-- audit (written by triggers only)
create policy audit_events_select on public.audit_events for select to authenticated
  using (organization_id is not null and public.is_org_admin(organization_id));
