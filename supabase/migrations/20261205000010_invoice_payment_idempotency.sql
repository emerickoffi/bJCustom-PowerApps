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
