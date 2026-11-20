-- Online invoice payments (Business plan).
-- Each builder connects its own Stripe account (Stripe Connect Express). Homeowners pay an issued invoice's balance
-- by card or bank transfer (ACH) from the portal; the money goes to the builder's Stripe account, not to Trefort.
-- Stripe tells Trefort when a payment succeeds and Trefort records it on the invoice exactly once.

-- ============ Builder's Stripe account ============
create table public.organization_payment_accounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  stripe_account_id text not null unique check (stripe_account_id ~ '^acct_[A-Za-z0-9]+$'),
  livemode boolean not null default false,
  details_submitted boolean not null default false,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  accept_card boolean not null default true,
  accept_ach boolean not null default true,
  requirements_due text[] not null default '{}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_payment_accounts_a_method check (accept_card or accept_ach)
);

alter table public.organization_payment_accounts enable row level security;

create policy organization_payment_accounts_staff_read on public.organization_payment_accounts
  for select to authenticated using (public.is_org_manager(organization_id));

revoke all on public.organization_payment_accounts from anon, authenticated;
grant select on public.organization_payment_accounts to authenticated;

-- ============ Checkout attempts ============
create table public.online_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  stripe_account_id text not null,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text unique,
  method text not null check (method in ('card', 'ach')),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'open' check (status in ('open', 'processing', 'succeeded', 'failed', 'expired', 'needs_review')),
  payment_id uuid references public.invoice_payments(id) on delete set null,
  failure_message text check (failure_message is null or char_length(failure_message) <= 500),
  started_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index online_payment_sessions_invoice on public.online_payment_sessions (invoice_id, status);

alter table public.online_payment_sessions enable row level security;

create policy online_payment_sessions_read on public.online_payment_sessions
  for select to authenticated
  using (public.is_org_manager(organization_id) or public.is_project_homeowner(project_id));

revoke all on public.online_payment_sessions from anon, authenticated;
grant select on public.online_payment_sessions to authenticated;
grant select, insert, update, delete on public.online_payment_sessions, public.organization_payment_accounts to service_role;

-- ============ Online payments on invoices ============
alter table public.invoice_payments drop constraint invoice_payments_method_check;
alter table public.invoice_payments add constraint invoice_payments_method_check
  check (method in ('check', 'ach', 'wire', 'cash', 'card_offline', 'financing', 'other', 'online_card', 'online_ach'));
alter table public.invoice_payments add column if not exists stripe_payment_intent_id text unique;

-- Records a successful Stripe payment on its invoice. Server only (Stripe webhook). Safe to call more than once.
create or replace function public.record_online_invoice_payment(p_session uuid, p_payment_intent text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  s public.online_payment_sessions;
  inv public.invoices;
  v_id uuid;
  v_hash text;
begin
  select * into s from public.online_payment_sessions where id = p_session for update;
  if s.id is null then raise exception 'Payment session not found'; end if;
  if s.payment_id is not null then return s.payment_id; end if;

  select id into v_id from public.invoice_payments where stripe_payment_intent_id = p_payment_intent;
  if v_id is not null then
    update public.online_payment_sessions set status = 'succeeded', payment_id = v_id, completed_at = coalesce(completed_at, now()), updated_at = now() where id = s.id;
    return v_id;
  end if;

  select * into inv from public.invoices where id = s.invoice_id;
  v_hash := encode(sha256(convert_to(jsonb_build_array(s.id, p_payment_intent, s.amount_cents)::text, 'UTF8')), 'hex');

  begin
    insert into public.invoice_payments (organization_id, invoice_id, payment_date, amount_cents, method, reference, notes,
      request_id, request_hash, stripe_payment_intent_id)
    values (s.organization_id, s.invoice_id, (now() at time zone 'utc')::date, s.amount_cents,
      case s.method when 'card' then 'online_card' else 'online_ach' end,
      left('Stripe ' || p_payment_intent, 120), 'Paid online through the homeowner portal', s.id, v_hash, p_payment_intent)
    returning id into v_id;
  exception when others then
    -- The money arrived but the invoice changed meanwhile (voided, paid another way). A person has to decide.
    update public.online_payment_sessions
       set status = 'needs_review', stripe_payment_intent_id = p_payment_intent, failure_message = left(sqlerrm, 500), updated_at = now()
     where id = s.id;
    return null;
  end;

  update public.online_payment_sessions
     set status = 'succeeded', payment_id = v_id, stripe_payment_intent_id = p_payment_intent, completed_at = now(), updated_at = now()
   where id = s.id;
  return v_id;
end;
$$;

-- A refund made in Stripe reverses the recorded payment so the invoice balance is right again.
create or replace function public.reverse_online_invoice_payment(p_payment_intent text, p_reason text)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare p public.invoice_payments;
begin
  select * into p from public.invoice_payments where stripe_payment_intent_id = p_payment_intent for update;
  if p.id is null or p.reversed_at is not null then return false; end if;
  perform set_config('app.invoice_op', 'on', true);
  update public.invoice_payments
     set reversed_at = now(), reversal_reason = left(coalesce(nullif(btrim(p_reason), ''), 'Refunded in Stripe'), 1000)
   where id = p.id;
  perform set_config('app.invoice_op', '', true);
  return true;
end;
$$;

revoke all on function public.record_online_invoice_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.reverse_online_invoice_payment(text, text) from public, anon, authenticated;
grant execute on function public.record_online_invoice_payment(uuid, text) to service_role;
grant execute on function public.reverse_online_invoice_payment(text, text) to service_role;

-- Invoice history says whether a payment came in online or was recorded by hand.
create or replace function public.invoice_payments_after_write()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_paid bigint; v_total bigint;
begin
  select coalesce(sum(amount_cents), 0) into v_paid from public.invoice_payments
    where invoice_id = new.invoice_id and reversed_at is null;
  select total_cents into v_total from public.invoices where id = new.invoice_id;
  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set paid_cents = v_paid,
    status = case when v_paid >= v_total then 'paid' when v_paid > 0 then 'partially_paid' else 'issued' end
    where id = new.invoice_id and status <> 'voided';
  perform set_config('app.invoice_op', '', true);
  insert into public.invoice_events (organization_id, invoice_id, event_type, actor_id, details, amount_cents)
    values (new.organization_id, new.invoice_id,
            case when tg_op = 'INSERT' then 'payment_recorded' else 'payment_reversed' end, auth.uid(),
            case when tg_op = 'INSERT' and new.method in ('online_card', 'online_ach')
                   then 'Paid online by ' || case new.method when 'online_card' then 'card' else 'bank transfer' end
                 when tg_op = 'INSERT' then 'Offline payment recorded (' || new.method || coalesce(', ref ' || new.reference, '') || ')'
                 else 'Payment reversed: ' || new.reversal_reason end,
            new.amount_cents);
  return null;
end;
$function$;
