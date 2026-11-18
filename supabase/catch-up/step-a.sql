-- Database catch-up, step A: run once in the Supabase SQL Editor (project supabase-fuchsia-island).
-- Applies two migrations that are in the repo but were never applied to production:
--   20261205000010_invoice_payment_idempotency.sql  (fixes "Record payment" on invoices)
--   20261205000030_ai_assistant_request_outcomes.sql (AI assistant outcome tracking)
-- Additive only and safe to re-run. Tested against production in a rolled-back transaction on 2026-11-17.

-- Idempotent offline payment recording (audit finding F1).
--
-- A retried "Record payment" (double submit, timeout retry, refresh recovery) previously inserted a second
-- row whenever it still fit under the remaining balance. Payments now go through record_invoice_payment,
-- which binds a client request id to a canonical hash of every material input plus the invoice:
--   same id + same inputs      -> the original payment is returned (replayed = true), no new row or event
--   same id + different inputs -> refused with hint 'payment_request_conflict'
--   new id                     -> a new payment, subject to the existing balance/lock/feature rules
-- Authorization is checked on every call, including replays.
--
-- Additive: two nullable columns, one partial unique index, one function. Existing rows keep request_id null
-- (no fabricated ids). Direct table inserts by `authenticated` are revoked so the idempotent path is the only
-- write path; reversal, triggers, balance caps and events are unchanged.
-- Re-running this file is safe.

alter table public.invoice_payments
  add column if not exists request_id uuid,
  add column if not exists request_hash text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_payments_request_pair'
                   and conrelid = 'public.invoice_payments'::regclass) then
    alter table public.invoice_payments add constraint invoice_payments_request_pair
      check ((request_id is null) = (request_hash is null));
  end if;
end $$;

create unique index if not exists invoice_payments_request_uidx
  on public.invoice_payments (organization_id, request_id) where request_id is not null;

create or replace function public.record_invoice_payment(
  p_invoice uuid, p_request uuid, p_payment_date date, p_amount_cents bigint,
  p_method text, p_reference text, p_notes text)
returns table (payment_id uuid, replayed boolean)
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invoices;
  prior public.invoice_payments;
  v_ref text := nullif(btrim(coalesce(p_reference, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_hash text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in again to record this payment'; end if;
  if p_request is null then raise exception 'A payment request id is required'; end if;

  select * into inv from public.invoices where id = p_invoice;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  perform public.invoice_assert_manager(inv.organization_id);
  if not public.can_view_project_internal(inv.project_id) then raise exception 'Invoice not found'; end if;

  v_hash := encode(sha256(convert_to(jsonb_build_array(
    inv.id, p_payment_date, p_amount_cents, p_method, v_ref, v_notes)::text, 'UTF8')), 'hex');

  perform pg_advisory_xact_lock(hashtextextended('invoice_payment:' || inv.organization_id::text || ':' || p_request::text, 0));

  select * into prior from public.invoice_payments
    where organization_id = inv.organization_id and request_id = p_request;
  if prior.id is not null then
    if prior.invoice_id <> inv.id or prior.request_hash <> v_hash then
      raise exception 'This payment submission was already used with different details. Review the amounts and press Record payment again.'
        using hint = 'payment_request_conflict';
    end if;
    payment_id := prior.id; replayed := true;
    return next; return;
  end if;

  insert into public.invoice_payments (organization_id, invoice_id, payment_date, amount_cents, method, reference, notes, request_id, request_hash)
  values (inv.organization_id, inv.id, p_payment_date, p_amount_cents, p_method, v_ref, v_notes, p_request, v_hash)
  returning id into v_id;

  payment_id := v_id; replayed := false;
  return next;
end;
$$;

revoke execute on function public.record_invoice_payment(uuid, uuid, date, bigint, text, text, text) from public, anon;
grant execute on function public.record_invoice_payment(uuid, uuid, date, bigint, text, text, text) to authenticated;

revoke insert on public.invoice_payments from authenticated, anon;

-- Assistant outcome tracking (audit findings F6/F9).
--
-- Every attempt already inserts one ai_assistant_requests row before generation; that row is the attempt
-- counter used by the rate limits and stays that way (failed attempts still count, so abuse controls are
-- not weakened). This adds the correlation id and the outcome of the attempt so a reference such as
-- 287e47a5 can be traced without relying on log retention.
--
-- No prompt, answer or document content is stored: only timings, a safe error category and token counts.
-- Completion is written once through complete_ai_assistant_request by the user who made the attempt.
-- Retention follows the existing table (no change). Re-running this file is safe.

alter table public.ai_assistant_requests
  add column if not exists request_ref uuid,
  add column if not exists outcome text not null default 'pending',
  add column if not exists error_category text,
  add column if not exists completed_at timestamptz,
  add column if not exists duration_ms integer,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_assistant_requests_outcome_check'
                   and conrelid = 'public.ai_assistant_requests'::regclass) then
    alter table public.ai_assistant_requests add constraint ai_assistant_requests_outcome_check
      check (outcome in ('pending', 'success', 'failure', 'timeout'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_assistant_requests_error_category_check'
                   and conrelid = 'public.ai_assistant_requests'::regclass) then
    alter table public.ai_assistant_requests add constraint ai_assistant_requests_error_category_check
      check (error_category is null or error_category in ('timeout', 'provider_error', 'empty_answer', 'context_error', 'internal'));
  end if;
end $$;

create unique index if not exists ai_assistant_requests_ref_uidx
  on public.ai_assistant_requests (request_ref) where request_ref is not null;

-- Rows are append-only for users; outcome columns change only through this function, once.
revoke update, delete, truncate on public.ai_assistant_requests from authenticated, anon;

create or replace function public.complete_ai_assistant_request(
  p_ref uuid, p_outcome text, p_error_category text, p_duration_ms integer, p_input_tokens integer, p_output_tokens integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_ref is null then return; end if;
  if p_outcome not in ('success', 'failure', 'timeout') then raise exception 'Invalid outcome'; end if;
  update public.ai_assistant_requests set
    outcome = p_outcome,
    error_category = case when p_outcome = 'success' then null else p_error_category end,
    completed_at = now(),
    duration_ms = greatest(0, least(coalesce(p_duration_ms, 0), 3600000)),
    input_tokens = case when p_input_tokens >= 0 then p_input_tokens end,
    output_tokens = case when p_output_tokens >= 0 then p_output_tokens end
  where request_ref = p_ref and user_id = auth.uid() and outcome = 'pending';
end;
$$;
revoke execute on function public.complete_ai_assistant_request(uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.complete_ai_assistant_request(uuid, text, text, integer, integer, integer) to authenticated;
