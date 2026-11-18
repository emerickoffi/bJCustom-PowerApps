-- Subscription plans (SaaS step 2).
-- Each company is on one plan. The plan is the ceiling: a company admin can switch off anything, but can only
-- switch on the modules their plan includes, and can only add team members up to the plan's seat limit.
-- Homeowner (client) accounts never count as seats. Only Trefort (platform administrators) can change a plan.
-- Existing companies move to the Internal plan, which includes everything, so nothing changes for them today.

-- ============ PLANS ============
create table if not exists public.subscription_plans (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  name text not null check (char_length(name) between 1 and 40),
  tagline text check (tagline is null or char_length(tagline) <= 160),
  sort_order integer not null default 0,
  -- Every module in feature_registry() when true; otherwise only the keys in features.
  all_features boolean not null default false,
  features text[] not null default '{}',
  -- Builder staff seats (org_admin, project_manager, builder_staff). Null means unlimited.
  max_staff integer check (max_staff is null or max_staff > 0),
  custom_domain boolean not null default false,
  white_label boolean not null default false,
  monthly_price_cents integer check (monthly_price_cents is null or monthly_price_cents >= 0),
  -- Internal is never offered to customers or billed.
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;
drop policy if exists subscription_plans_select on public.subscription_plans;
create policy subscription_plans_select on public.subscription_plans for select to authenticated using (true);
revoke insert, update, delete on public.subscription_plans from anon, authenticated;

insert into public.subscription_plans
  (key, name, tagline, sort_order, all_features, features, max_staff, custom_domain, white_label, is_public)
values
  ('starter', 'Starter', 'For small builders getting organized.', 10, false,
   array['consultation', 'schedule', 'estimates', 'walkthroughs', 'issues', 'warranty', 'portal', 'reports',
         'daily_logs', 'project_photos'],
   5, false, false, true),
  ('pro', 'Pro', 'For growing builders running several jobs.', 20, false,
   array['consultation', 'schedule', 'estimates', 'walkthroughs', 'issues', 'warranty', 'portal', 'reports',
         'daily_logs', 'project_photos',
         'documents', 'e_signatures', 'change_orders', 'rfis', 'invoices', 'subcontractors', 'client_updates'],
   20, false, false, true),
  ('business', 'Business', 'For established builders who want everything.', 30, false,
   array['consultation', 'schedule', 'estimates', 'walkthroughs', 'issues', 'warranty', 'portal', 'reports',
         'daily_logs', 'project_photos',
         'documents', 'e_signatures', 'change_orders', 'rfis', 'invoices', 'subcontractors', 'client_updates',
         'payments', 'quickbooks', 'ai_assistant'],
   null, true, true, true),
  ('internal', 'Internal', 'Trefort''s own and demo companies. Everything included, never billed.', 99, true,
   '{}', null, true, true, false)
on conflict (key) do nothing;

-- ============ PLAN ON EACH COMPANY ============
alter table public.organizations add column if not exists plan_key text;
update public.organizations set plan_key = 'internal' where plan_key is null;
alter table public.organizations alter column plan_key set default 'starter';
alter table public.organizations alter column plan_key set not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_plan_key_fkey') then
    alter table public.organizations add constraint organizations_plan_key_fkey
      foreign key (plan_key) references public.subscription_plans(key) on update cascade on delete restrict;
  end if;
end $$;

-- Only Trefort can change a plan (same rule as subscription status and suspension).
create or replace function public.organizations_platform_fields_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.subscription_status, new.plan_key, new.suspended_at, new.suspended_reason, new.suspended_by)
     is distinct from (old.subscription_status, old.plan_key, old.suspended_at, old.suspended_reason, old.suspended_by)
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'Only Trefort can change a company''s plan, subscription or suspension' using errcode = '42501';
  end if;
  return new;
end $$;

-- ============ PLAN CHECKS ============
create or replace function public.plan_includes_feature(p_org uuid, p_key text)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select case
    -- Core and non-switchable keys are never limited by a plan.
    when not exists (select 1 from public.feature_registry() r where r.feature_key = p_key) then true
    else coalesce((
      select sp.all_features or p_key = any (sp.features)
      from public.organizations o join public.subscription_plans sp on sp.key = o.plan_key
      where o.id = p_org), false)
  end
$$;

-- The cheapest public plan that includes a module, for "Upgrade to …" messages.
create or replace function public.plan_required_for_feature(p_key text)
returns text
language sql
stable security definer
set search_path = ''
as $$
  select sp.name from public.subscription_plans sp
  where sp.is_public and (sp.all_features or p_key = any (sp.features))
  order by sp.sort_order limit 1
$$;

-- A module is on only when the company turned it on (or it is on by default) AND the plan includes it.
create or replace function public.feature_flag_raw(p_org uuid, p_key text)
returns boolean
language sql
stable security definer
set search_path = ''
as $$
  select coalesce(
    (select f.enabled from public.organization_features f where f.organization_id = p_org and f.feature_key = p_key),
    (select r.default_enabled from public.feature_registry() r where r.feature_key = p_key),
    false)
    and public.plan_includes_feature(p_org, p_key)
$$;

-- Same guard as before, plus: a module outside the plan cannot be switched on.
create or replace function public.organization_features_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_blocker text; v_open int; v_plan text;
begin
  if tg_op = 'DELETE' then raise exception 'Feature settings cannot be deleted; turn the feature off instead'; end if;
  if not exists (select 1 from public.feature_registry() r where r.feature_key = new.feature_key) then
    raise exception 'Unknown or core feature: %', new.feature_key;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.enabled then
    if not public.plan_includes_feature(new.organization_id, new.feature_key) then
      v_plan := public.plan_required_for_feature(new.feature_key);
      raise exception '%', case when v_plan is null
        then 'Your plan does not include this module'
        else format('Your plan does not include this module. Upgrade to %s to turn it on', v_plan) end
        using errcode = '42501', hint = 'plan_upgrade_required';
    end if;
    select req into v_blocker from public.feature_registry() r, unnest(r.requires) req
      where r.feature_key = new.feature_key and not public.feature_flag_raw(new.organization_id, req) limit 1;
    if v_blocker is not null then
      raise exception 'Turn on % before enabling %', v_blocker, new.feature_key;
    end if;
  else
    select r.feature_key into v_blocker from public.feature_registry() r
      where new.feature_key = any(r.requires) and public.feature_flag_raw(new.organization_id, r.feature_key) limit 1;
    if v_blocker is not null then
      raise exception 'Turn off % first; it depends on %', v_blocker, new.feature_key;
    end if;
    if new.feature_key = 'warranty' then
      select count(*) into v_open from public.warranty_claims
        where organization_id = new.organization_id and status <> 'closed';
      if v_open > 0 then
        raise exception 'Resolve or close the % open warranty claim(s) before turning Warranty Management off. Warranty records are always preserved.', v_open;
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- ============ SEAT LIMIT ============
create or replace function public.organization_staff_seats(p_org uuid)
returns integer
language sql
stable security definer
set search_path = ''
as $$
  select count(*)::integer from public.organization_memberships m
  where m.organization_id = p_org and m.status = 'active' and m.role <> 'client'
$$;

create or replace function public.organization_pending_staff_invites(p_org uuid)
returns integer
language sql
stable security definer
set search_path = ''
as $$
  select count(*)::integer from public.invitations i
  where i.organization_id = p_org and i.status = 'pending' and i.role <> 'client' and i.expires_at > now()
$$;

create or replace function public.organization_seat_limit(p_org uuid)
returns integer
language sql
stable security definer
set search_path = ''
as $$
  select sp.max_staff from public.organizations o join public.subscription_plans sp on sp.key = o.plan_key where o.id = p_org
$$;

-- Activating a staff seat (new member, reactivation, or homeowner promoted to staff) must fit the plan.
create or replace function public.organization_memberships_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_max integer; v_used integer;
begin
  if new.status <> 'active' or new.role = 'client' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'active' and old.role <> 'client' then return new; end if;
  v_max := public.organization_seat_limit(new.organization_id);
  if v_max is null then return new; end if;
  perform 1 from public.organizations o where o.id = new.organization_id for update;
  select count(*) into v_used from public.organization_memberships m
    where m.organization_id = new.organization_id and m.status = 'active' and m.role <> 'client' and m.id <> new.id;
  if v_used >= v_max then
    raise exception 'Your plan includes % team member seat(s) and all are in use. Upgrade your plan or deactivate a team member first', v_max
      using errcode = '42501', hint = 'plan_seat_limit';
  end if;
  return new;
end $$;

drop trigger if exists organization_memberships_seat_guard on public.organization_memberships;
create trigger organization_memberships_seat_guard before insert or update of status, role on public.organization_memberships
  for each row execute function public.organization_memberships_seat_guard();

-- Inviting staff counts pending invitations too, so a full team cannot send more invites than seats.
create or replace function public.invitations_seat_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_max integer;
begin
  if new.role = 'client' or new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' and old.role <> 'client' and old.expires_at > now() then return new; end if;
  v_max := public.organization_seat_limit(new.organization_id);
  if v_max is null then return new; end if;
  perform 1 from public.organizations o where o.id = new.organization_id for update;
  if public.organization_staff_seats(new.organization_id)
     + (select count(*) from public.invitations i
        where i.organization_id = new.organization_id and i.status = 'pending' and i.role <> 'client'
          and i.expires_at > now() and i.id <> new.id) >= v_max then
    raise exception 'Your plan includes % team member seat(s), counting pending invitations. Upgrade your plan, revoke an invitation, or deactivate a team member first', v_max
      using errcode = '42501', hint = 'plan_seat_limit';
  end if;
  return new;
end $$;

drop trigger if exists invitations_seat_guard on public.invitations;
create trigger invitations_seat_guard before insert or update of status, role, expires_at on public.invitations
  for each row execute function public.invitations_seat_guard();

-- What a company's own staff see on Settings: their plan and seat usage.
create or replace function public.organization_plan_summary(p_org uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
declare v jsonb;
begin
  if not public.is_org_staff(p_org) then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'plan_key', sp.key, 'plan_name', sp.name, 'tagline', sp.tagline, 'is_public', sp.is_public,
    'all_features', sp.all_features, 'features', to_jsonb(sp.features),
    'max_staff', sp.max_staff, 'custom_domain', sp.custom_domain, 'white_label', sp.white_label,
    'staff_seats', public.organization_staff_seats(o.id),
    'pending_staff_invites', public.organization_pending_staff_invites(o.id),
    'upgrade_plans', coalesce((
      select jsonb_object_agg(r.feature_key, public.plan_required_for_feature(r.feature_key))
      from public.feature_registry() r), '{}'::jsonb))
  into v
  from public.organizations o join public.subscription_plans sp on sp.key = o.plan_key
  where o.id = p_org;
  return v;
end $$;

-- ============ OWNER CONSOLE ============
create or replace function public.platform_list_plans()
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', sp.key, 'name', sp.name, 'tagline', sp.tagline, 'sort_order', sp.sort_order,
      'all_features', sp.all_features, 'features', to_jsonb(sp.features), 'max_staff', sp.max_staff,
      'custom_domain', sp.custom_domain, 'white_label', sp.white_label,
      'monthly_price_cents', sp.monthly_price_cents, 'is_public', sp.is_public,
      'companies', (select count(*) from public.organizations o where o.plan_key = sp.key)
    ) order by sp.sort_order)
    from public.subscription_plans sp), '[]'::jsonb);
end $$;

create or replace function public.platform_set_plan(p_org uuid, p_plan text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_old text; v_max integer; v_used integer;
begin
  perform public.assert_platform_admin();
  if not exists (select 1 from public.subscription_plans where key = p_plan) then
    raise exception 'Unknown plan' using errcode = '22023';
  end if;
  select plan_key into v_old from public.organizations where id = p_org for update;
  if v_old is null then raise exception 'Company not found' using errcode = 'P0002'; end if;
  if v_old = p_plan then
    return jsonb_build_object('changed', false, 'plan_key', p_plan);
  end if;
  update public.organizations set plan_key = p_plan, updated_at = now() where id = p_org;
  insert into public.platform_admin_events (actor_id, organization_id, action, details)
    values (auth.uid(), p_org, 'plan_changed',
            jsonb_build_object('from', v_old, 'to', p_plan, 'note', nullif(btrim(coalesce(p_note, '')), '')));
  select max_staff into v_max from public.subscription_plans where key = p_plan;
  v_used := public.organization_staff_seats(p_org);
  return jsonb_build_object('changed', true, 'plan_key', p_plan, 'from', v_old,
    'max_staff', v_max, 'staff_seats', v_used, 'over_limit', v_max is not null and v_used > v_max);
end $$;

drop function if exists public.platform_list_organizations();
create function public.platform_list_organizations()
returns table(id uuid, display_name text, legal_name text, subscription_status text, plan_key text, plan_name text,
              created_at timestamptz, suspended_at timestamptz, staff_count bigint, homeowner_count bigint,
              project_count bigint, last_activity_at timestamptz, admin_emails text[])
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return query
  select
    o.id, o.display_name, o.legal_name, o.subscription_status, o.plan_key, sp.name, o.created_at, o.suspended_at,
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
  join public.subscription_plans sp on sp.key = o.plan_key
  order by o.created_at desc;
end $$;

create or replace function public.platform_get_organization(p_org uuid)
returns jsonb
language plpgsql
stable security definer
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
    'plan_key', o.plan_key,
    'plan_name', sp.name,
    'plan_max_staff', sp.max_staff,
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
      'invoices', (select count(*) from public.invoices i where i.organization_id = o.id),
      'staff_seats', public.organization_staff_seats(o.id),
      'pending_staff_invites', public.organization_pending_staff_invites(o.id)
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
  join public.subscription_plans sp on sp.key = o.plan_key
  left join public.organization_settings s on s.organization_id = o.id
  where o.id = p_org;
  return v;
end $$;

create or replace function public.platform_overview()
returns jsonb
language plpgsql
stable security definer
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
    'projects', (select count(*) from public.projects),
    'companies_by_plan', coalesce((
      select jsonb_object_agg(sp.key, (select count(*) from public.organizations o where o.plan_key = sp.key))
      from public.subscription_plans sp), '{}'::jsonb)
  );
end $$;

-- ============ GRANTS ============
do $$
declare f text;
begin
  foreach f in array array[
    'public.plan_includes_feature(uuid, text)', 'public.plan_required_for_feature(text)',
    'public.organization_staff_seats(uuid)', 'public.organization_pending_staff_invites(uuid)',
    'public.organization_seat_limit(uuid)', 'public.organization_plan_summary(uuid)',
    'public.platform_list_plans()', 'public.platform_set_plan(uuid, text, text)',
    'public.platform_list_organizations()', 'public.platform_get_organization(uuid)', 'public.platform_overview()',
    'public.feature_flag_raw(uuid, text)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.organization_memberships_seat_guard()', 'public.invitations_seat_guard()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
