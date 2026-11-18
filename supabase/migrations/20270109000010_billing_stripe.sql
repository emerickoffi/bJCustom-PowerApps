-- Billing with Stripe (SaaS step 3).
-- * Prices: Starter $49, Pro $149, Business $299 per month; yearly is 10x monthly (2 months free).
-- * New companies get a 14-day Pro trial with no card. After it ends, an administrator picks a plan and pays
--   through Stripe Checkout. Stripe webhooks (service role) keep plan and status in sync.
-- * Billing fields can only be changed by Trefort or by the webhook (service role), never by a company itself.
-- Existing companies (Internal plan) are not affected.

-- ============ PRICES ============
alter table public.subscription_plans add column if not exists yearly_price_cents integer
  check (yearly_price_cents is null or yearly_price_cents >= 0);
update public.subscription_plans set monthly_price_cents = 4900,  yearly_price_cents = 49000  where key = 'starter' and monthly_price_cents is null;
update public.subscription_plans set monthly_price_cents = 14900, yearly_price_cents = 149000 where key = 'pro' and monthly_price_cents is null;
update public.subscription_plans set monthly_price_cents = 29900, yearly_price_cents = 299000 where key = 'business' and monthly_price_cents is null;

-- ============ BILLING FIELDS ON EACH COMPANY ============
alter table public.organizations
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists billing_interval text,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists current_period_end timestamptz,
  add column if not exists cancel_at_period_end boolean not null default false;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organizations_billing_interval_check') then
    alter table public.organizations add constraint organizations_billing_interval_check
      check (billing_interval is null or billing_interval in ('month', 'year'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_stripe_customer_id_key') then
    alter table public.organizations add constraint organizations_stripe_customer_id_key unique (stripe_customer_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'organizations_stripe_subscription_id_key') then
    alter table public.organizations add constraint organizations_stripe_subscription_id_key unique (stripe_subscription_id);
  end if;
end $$;

-- Billing fields join plan, status and suspension as fields only Trefort (or the Stripe webhook) can change.
create or replace function public.organizations_platform_fields_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.subscription_status, new.plan_key, new.suspended_at, new.suspended_reason, new.suspended_by,
      new.stripe_customer_id, new.stripe_subscription_id, new.billing_interval, new.trial_ends_at,
      new.current_period_end, new.cancel_at_period_end)
     is distinct from
     (old.subscription_status, old.plan_key, old.suspended_at, old.suspended_reason, old.suspended_by,
      old.stripe_customer_id, old.stripe_subscription_id, old.billing_interval, old.trial_ends_at,
      old.current_period_end, old.cancel_at_period_end)
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'Only Trefort can change a company''s plan, billing, subscription or suspension' using errcode = '42501';
  end if;
  return new;
end $$;

-- ============ STRIPE WEBHOOK LEDGER ============
-- Each Stripe event is applied once, even when Stripe retries delivery.
create table if not exists public.stripe_events (
  id text primary key,
  type text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- ============ NEW COMPANIES START A 14-DAY PRO TRIAL ============
create or replace function public.create_organization(p_display_name text, p_legal_name text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_city text DEFAULT NULL::text, p_state text DEFAULT NULL::text, p_project_prefix text DEFAULT 'P'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if exists (select 1 from public.organization_memberships where user_id = v_uid and status = 'active') then
    raise exception 'You already belong to an organization';
  end if;
  insert into public.organizations (display_name, legal_name, phone, email, city, state, created_by,
                                    plan_key, subscription_status, trial_ends_at)
    values (trim(p_display_name), nullif(trim(p_legal_name), ''), nullif(trim(p_phone), ''),
            nullif(trim(p_email), ''), nullif(trim(p_city), ''), nullif(trim(p_state), ''), v_uid,
            'pro', 'trialing', now() + interval '14 days')
    returning id into v_org;
  insert into public.organization_settings (organization_id, project_number_prefix)
    values (v_org, upper(coalesce(nullif(trim(p_project_prefix), ''), 'P')));
  insert into public.organization_memberships (organization_id, user_id, role)
    values (v_org, v_uid, 'org_admin');
  return v_org;
end;
$function$;

-- ============ OWNER CONSOLE ============
-- Billing details for one company (plan, status, trial and period dates).
create or replace function public.platform_company_billing(p_org uuid)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return (
    select jsonb_build_object(
      'subscription_status', o.subscription_status, 'plan_key', o.plan_key,
      'billing_interval', o.billing_interval, 'trial_ends_at', o.trial_ends_at,
      'current_period_end', o.current_period_end, 'cancel_at_period_end', o.cancel_at_period_end,
      'has_stripe_customer', o.stripe_customer_id is not null,
      'has_subscription', o.stripe_subscription_id is not null)
    from public.organizations o where o.id = p_org);
end $$;

revoke all on function public.platform_company_billing(uuid) from public, anon;
grant execute on function public.platform_company_billing(uuid) to authenticated, service_role;
revoke all on function public.create_organization(text, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
