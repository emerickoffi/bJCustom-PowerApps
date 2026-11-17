-- Trefort owner console.
--
-- Platform administrators (rows in public.platform_administrators) run Trefort itself: they can see every
-- subscriber company, switch modules on or off for a company, pause (suspend) a company, and look up users.
-- Everything goes through the SECURITY DEFINER functions below, which check is_platform_admin() first.
-- No table policy gives platform administrators direct access to other companies' records.
--
-- A suspended company keeps all of its data, but its members, homeowners and subcontractors lose access
-- until it is reactivated: user_org_role() and sub_company_ids() ignore suspended companies, which every
-- row-level policy builds on.

-- ───────── Organization fields ─────────

alter table public.organizations
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_reason text,
  add column if not exists suspended_by uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_suspended_reason_length') then
    alter table public.organizations add constraint organizations_suspended_reason_length
      check (suspended_reason is null or char_length(suspended_reason) <= 500);
  end if;
end $$;

-- ───────── Who is a platform administrator ─────────

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_administrators a where a.user_id = auth.uid())
$$;

create or replace function public.assert_platform_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'Only Trefort platform administrators can do this' using errcode = '42501';
  end if;
end $$;

-- Billing and suspension fields belong to Trefort, not to the company. Company admins can still edit their
-- name, branding and contact details. Server-side jobs with no signed-in user (Stripe webhooks) are allowed.
create or replace function public.organizations_platform_fields_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.subscription_status, new.suspended_at, new.suspended_reason, new.suspended_by)
     is distinct from (old.subscription_status, old.suspended_at, old.suspended_reason, old.suspended_by)
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'Only Trefort can change a company''s subscription or suspension' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists organizations_platform_fields_guard on public.organizations;
create trigger organizations_platform_fields_guard
  before update on public.organizations
  for each row execute function public.organizations_platform_fields_guard();

-- ───────── Suspension enforcement ─────────

create or replace function public.user_org_role(p_org uuid)
returns public.org_role
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id and o.suspended_at is null
  where m.organization_id = p_org and m.user_id = auth.uid()
    and m.status = 'active' and not m.activation_required
  limit 1;
$$;

create or replace function public.sub_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.subcontractor_company_id
  from public.subcontractor_portal_accounts a
  join public.subcontractor_companies c on c.id = a.subcontractor_company_id and c.status = 'active'
  join public.organizations o on o.id = a.organization_id and o.suspended_at is null
  where a.user_id = auth.uid() and a.status = 'active'
    and public.is_feature_enabled(a.organization_id, 'subcontractors');
$$;

-- Lets a signed-in member learn that their own workspace is paused, so the app can say so plainly.
create or replace function public.my_suspended_workspaces()
returns table (organization_id uuid, display_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.display_name
  from public.organization_memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = auth.uid() and m.status = 'active' and o.suspended_at is not null;
$$;

-- ───────── Owner action log ─────────

create table if not exists public.platform_admin_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists platform_admin_events_created_idx on public.platform_admin_events (created_at desc);
create index if not exists platform_admin_events_org_idx on public.platform_admin_events (organization_id, created_at desc);

alter table public.platform_admin_events enable row level security;
drop policy if exists platform_admin_events_select on public.platform_admin_events;
create policy platform_admin_events_select on public.platform_admin_events
  for select to authenticated using (public.is_platform_admin());
-- No insert, update or delete policies: entries are written only by the functions below and never edited.

-- ───────── Owner console functions ─────────

create or replace function public.platform_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return jsonb_build_object(
    'companies', (select count(*) from public.organizations),
    'active_companies', (select count(*) from public.organizations where suspended_at is null),
    'suspended_companies', (select count(*) from public.organizations where suspended_at is not null),
    'new_companies_30d', (select count(*) from public.organizations where created_at > now() - interval '30 days'),
    'staff_members', (select count(*) from public.organization_memberships where status = 'active' and role <> 'client'),
    'homeowners', (select count(*) from public.organization_memberships where status = 'active' and role = 'client'),
    'projects', (select count(*) from public.projects)
  );
end $$;

create or replace function public.platform_list_organizations()
returns table (
  id uuid,
  display_name text,
  legal_name text,
  subscription_status text,
  created_at timestamptz,
  suspended_at timestamptz,
  staff_count bigint,
  homeowner_count bigint,
  project_count bigint,
  last_activity_at timestamptz,
  admin_emails text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return query
  select
    o.id, o.display_name, o.legal_name, o.subscription_status, o.created_at, o.suspended_at,
    (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.status = 'active' and m.role <> 'client'),
    (select count(*) from public.organization_memberships m where m.organization_id = o.id and m.status = 'active' and m.role = 'client'),
    (select count(*) from public.projects p where p.organization_id = o.id),
    (select max(a.created_at) from public.audit_events a where a.organization_id = o.id),
    coalesce((
      select array_agg(u.email::text order by m.created_at)
      from public.organization_memberships m
      join auth.users u on u.id = m.user_id
      where m.organization_id = o.id and m.role = 'org_admin' and m.status = 'active'
    ), '{}')
  from public.organizations o
  order by o.created_at desc;
end $$;

create or replace function public.platform_get_organization(p_org uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v jsonb;
begin
  perform public.assert_platform_admin();
  select jsonb_build_object(
    'id', o.id,
    'display_name', o.display_name,
    'legal_name', o.legal_name,
    'email', o.email,
    'phone', o.phone,
    'website', o.website,
    'city', o.city,
    'state', o.state,
    'subscription_status', o.subscription_status,
    'created_at', o.created_at,
    'suspended_at', o.suspended_at,
    'suspended_reason', o.suspended_reason,
    'suspended_by_email', (select u.email from auth.users u where u.id = o.suspended_by),
    'project_number_prefix', s.project_number_prefix,
    'timezone', s.timezone,
    'counts', jsonb_build_object(
      'projects', (select count(*) from public.projects p where p.organization_id = o.id),
      'clients', (select count(*) from public.clients c where c.organization_id = o.id),
      'estimates', (select count(*) from public.estimates e where e.organization_id = o.id),
      'invoices', (select count(*) from public.invoices i where i.organization_id = o.id)
    ),
    'last_activity_at', (select max(a.created_at) from public.audit_events a where a.organization_id = o.id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', m.user_id,
        'full_name', p.full_name,
        'email', u.email,
        'role', m.role,
        'status', m.status,
        'activation_required', m.activation_required,
        'joined_at', m.created_at,
        'last_sign_in_at', u.last_sign_in_at
      ) order by (m.role = 'client'), m.created_at)
      from public.organization_memberships m
      join auth.users u on u.id = m.user_id
      left join public.profiles p on p.id = m.user_id
      where m.organization_id = o.id
    ), '[]'::jsonb),
    'feature_overrides', coalesce((
      select jsonb_object_agg(f.feature_key, f.enabled)
      from public.organization_features f
      where f.organization_id = o.id
    ), '{}'::jsonb),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', e.action,
        'details', e.details,
        'created_at', e.created_at,
        'actor_email', (select u.email from auth.users u where u.id = e.actor_id)
      ) order by e.created_at desc)
      from (select * from public.platform_admin_events x where x.organization_id = o.id order by x.created_at desc limit 25) e
    ), '[]'::jsonb)
  ) into v
  from public.organizations o
  left join public.organization_settings s on s.organization_id = o.id
  where o.id = p_org;
  return v;
end $$;

create or replace function public.platform_set_feature(p_org uuid, p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Company not found';
  end if;
  -- organization_features_guard still checks the key and module dependencies.
  insert into public.organization_features (organization_id, feature_key, enabled)
  values (p_org, p_key, p_enabled)
  on conflict (organization_id, feature_key) do update set enabled = excluded.enabled;
  insert into public.platform_admin_events (actor_id, action, organization_id, details)
  values (auth.uid(), case when p_enabled then 'feature_enabled' else 'feature_disabled' end, p_org,
          jsonb_build_object('feature', p_key));
end $$;

create or replace function public.platform_set_suspended(p_org uuid, p_suspended boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform public.assert_platform_admin();
  if not exists (select 1 from public.organizations where id = p_org) then
    raise exception 'Company not found';
  end if;
  if p_suspended then
    if exists (select 1 from public.organization_memberships m
               where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active') then
      raise exception 'You belong to this company, so you cannot suspend it from here';
    end if;
    if v_reason is null then
      raise exception 'Give a reason for suspending this company';
    end if;
    update public.organizations
      set suspended_at = coalesce(suspended_at, now()), suspended_reason = left(v_reason, 500), suspended_by = auth.uid()
      where id = p_org;
  else
    update public.organizations
      set suspended_at = null, suspended_reason = null, suspended_by = null
      where id = p_org;
  end if;
  insert into public.platform_admin_events (actor_id, action, organization_id, details)
  values (auth.uid(), case when p_suspended then 'company_suspended' else 'company_reactivated' end, p_org,
          case when v_reason is null then '{}'::jsonb else jsonb_build_object('reason', v_reason) end);
end $$;

create or replace function public.platform_find_users(p_query text)
returns table (
  user_id uuid,
  email text,
  full_name text,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  blocked boolean,
  platform_admin boolean,
  memberships jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_q text := btrim(coalesce(p_query, ''));
begin
  perform public.assert_platform_admin();
  if char_length(v_q) < 2 then
    return;
  end if;
  return query
  select
    u.id, u.email::text, p.full_name, u.created_at, u.last_sign_in_at,
    coalesce(u.banned_until > now(), false),
    exists (select 1 from public.platform_administrators a where a.user_id = u.id),
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'organization_id', m.organization_id,
        'organization_name', o.display_name,
        'role', m.role,
        'status', m.status
      ) order by m.created_at)
      from public.organization_memberships m
      join public.organizations o on o.id = m.organization_id
      where m.user_id = u.id
    ), '[]'::jsonb)
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.email ilike '%' || v_q || '%' or p.full_name ilike '%' || v_q || '%'
  order by u.created_at desc
  limit 25;
end $$;

create or replace function public.platform_recent_events(p_limit int default 20)
returns table (
  action text,
  details jsonb,
  created_at timestamptz,
  actor_email text,
  organization_id uuid,
  organization_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return query
  select e.action, e.details, e.created_at, u.email::text, e.organization_id, o.display_name
  from public.platform_admin_events e
  left join auth.users u on u.id = e.actor_id
  left join public.organizations o on o.id = e.organization_id
  order by e.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
end $$;

-- ───────── Access ─────────
-- Signed-in users may call these; each one checks is_platform_admin() itself. Signed-out callers may not.

do $$
declare f text;
begin
  foreach f in array array[
    'public.is_platform_admin()',
    'public.assert_platform_admin()',
    'public.organizations_platform_fields_guard()',
    'public.user_org_role(uuid)',
    'public.sub_company_ids()',
    'public.my_suspended_workspaces()',
    'public.platform_overview()',
    'public.platform_list_organizations()',
    'public.platform_get_organization(uuid)',
    'public.platform_set_feature(uuid, text, boolean)',
    'public.platform_set_suspended(uuid, boolean, text)',
    'public.platform_find_users(text)',
    'public.platform_recent_events(integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

revoke execute on function public.organizations_platform_fields_guard() from authenticated;

notify pgrst, 'reload schema';
