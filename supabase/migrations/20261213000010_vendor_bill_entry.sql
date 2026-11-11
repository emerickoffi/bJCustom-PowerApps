-- Phase 7b: staff entry for commitments, vendor bills and vendor payments.
-- Additive only: new nullable columns, a link guard and a payment RPC that also stores notes.

alter table public.vendor_bills
  add column if not exists notes text check (notes is null or char_length(notes) <= 2000),
  add column if not exists attachment_document_id uuid references public.project_documents(id) on delete restrict,
  add column if not exists idempotency_key uuid unique;

alter table public.project_commitments
  add column if not exists notes text check (notes is null or char_length(notes) <= 2000),
  add column if not exists idempotency_key uuid unique;

alter table public.vendor_payments
  add column if not exists notes text check (notes is null or char_length(notes) <= 1000);

-- The attachment must be a document of the same project, and a bill can only be re-linked to an approved commitment.
create or replace function public.vendor_bill_links_guard()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_doc_project uuid;
  v_commitment record;
begin
  if new.attachment_document_id is not null
     and (tg_op = 'INSERT' or new.attachment_document_id is distinct from old.attachment_document_id) then
    select project_id into v_doc_project from public.project_documents where id = new.attachment_document_id;
    if v_doc_project is distinct from new.project_id then
      raise exception 'The attached invoice belongs to a different project.' using errcode = 'P0001';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.commitment_id is not null and new.commitment_id is distinct from old.commitment_id then
    select project_id, status into v_commitment from public.project_commitments where id = new.commitment_id;
    if v_commitment.project_id is distinct from new.project_id or v_commitment.status is distinct from 'approved' then
      raise exception 'Bills can only be linked to an approved commitment on the same project.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vendor_bills_links_guard on public.vendor_bills;
create trigger vendor_bills_links_guard before insert or update on public.vendor_bills
  for each row execute function public.vendor_bill_links_guard();

-- Replaces the six-argument version with one that also records notes. Same locking and balance rules.
drop function if exists public.record_vendor_payment(uuid, date, bigint, text, text, uuid);
create or replace function public.record_vendor_payment(
  p_bill uuid, p_payment_date date, p_amount_cents bigint, p_method text, p_reference text, p_idempotency_key uuid, p_notes text default null
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_bill record;
  v_paid bigint;
  v_id uuid;
begin
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  select id into v_id from public.vendor_payments where idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;
  if p_payment_date is null then
    raise exception 'Enter the payment date.' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = 'P0001';
  end if;

  -- Row lock serializes concurrent payments against the same bill.
  select id, organization_id, project_id, status, amount_cents into v_bill from public.vendor_bills where id = p_bill for update;
  if v_bill.id is null or not public.can_manage_project_costs(v_bill.project_id) then
    raise exception 'Bill not found' using errcode = '42501';
  end if;
  if v_bill.status <> 'approved' then
    raise exception 'Only approved bills can be paid.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid from public.vendor_payments where bill_id = p_bill and reversed_at is null;
  if v_paid + p_amount_cents > v_bill.amount_cents then
    raise exception 'Payment exceeds the unpaid balance of % cents.', v_bill.amount_cents - v_paid using errcode = 'P0001';
  end if;

  insert into public.vendor_payments (organization_id, project_id, bill_id, payment_date, amount_cents, method, reference, idempotency_key, notes)
  values (v_bill.organization_id, v_bill.project_id, p_bill, p_payment_date, p_amount_cents, p_method, nullif(btrim(p_reference), ''), p_idempotency_key, nullif(btrim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_vendor_payment(uuid, date, bigint, text, text, uuid, text) from public, anon;
grant execute on function public.record_vendor_payment(uuid, date, bigint, text, text, uuid, text) to authenticated;
