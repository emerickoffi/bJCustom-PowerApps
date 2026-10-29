-- Phase 7 job costing: commitments, vendor bills, vendor payments and manual forecasts.
-- FOR REVIEW — NOT YET APPLIED. Apply only after 20261101000010_subcontractor_project_assignments.sql
-- (and the other pending migrations) have been approved and applied.
--
-- Rules enforced here, not only in the UI:
-- - Every row is organization- and project-scoped; access requires manager role AND internal project access.
-- - Only approved bills are actual cost. Payments never create cost and can never exceed the bill.
-- - Approved / closed / voided financial records are immutable; corrections happen through reversals or
--   new records so history is preserved. Nothing here has a DELETE policy.
-- - Every insert / update is written to audit_events.

create or replace function public.can_manage_project_costs(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project and public.is_org_manager(p.organization_id)
  ) and public.can_view_project_internal(p_project);
$$;

create or replace function public.is_cost_category(p text)
returns boolean language sql immutable set search_path = '' as $$
  select p in ('Site Preparation', 'Survey and Engineering', 'Permits', 'Foundation', 'Framing', 'Roofing',
    'Plumbing', 'Electrical', 'HVAC', 'Insulation', 'Drywall', 'Cabinets', 'Countertops', 'Flooring',
    'Painting', 'Appliances', 'Exterior Work', 'Landscaping', 'Management Fees', 'Other', 'Contingency');
$$;

-- ============ Commitments ============
create table public.project_commitments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete restrict,
  vendor_name text not null check (char_length(btrim(vendor_name)) between 1 and 160),
  commitment_type text not null default 'subcontract' check (commitment_type in ('subcontract', 'purchase_order', 'other')),
  cost_category text not null check (public.is_cost_category(cost_category)),
  description text not null check (char_length(btrim(description)) between 2 and 500),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  effective_date date not null default current_date,
  status text not null default 'draft' check (status in ('draft', 'approved', 'closed', 'cancelled')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  cancel_reason text check (cancel_reason is null or char_length(btrim(cancel_reason)) between 3 and 1000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'draft' or status = 'cancelled' or approved_at is not null),
  check (status <> 'cancelled' or cancel_reason is not null)
);
create index project_commitments_project_idx on public.project_commitments (project_id, status);

-- ============ Vendor bills ============
create table public.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  commitment_id uuid references public.project_commitments(id) on delete restrict,
  subcontractor_company_id uuid references public.subcontractor_companies(id) on delete restrict,
  vendor_name text not null check (char_length(btrim(vendor_name)) between 1 and 160),
  bill_number text check (bill_number is null or char_length(bill_number) <= 60),
  cost_category text not null check (public.is_cost_category(cost_category)),
  description text not null check (char_length(btrim(description)) between 2 and 500),
  bill_date date not null,
  due_date date,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  status text not null default 'draft' check (status in ('draft', 'approved', 'voided')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 1000),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_date is null or due_date >= bill_date),
  check (status <> 'approved' or approved_at is not null),
  check (status <> 'voided' or (voided_at is not null and void_reason is not null))
);
create index vendor_bills_project_idx on public.vendor_bills (project_id, status);
create index vendor_bills_commitment_idx on public.vendor_bills (commitment_id) where commitment_id is not null;
-- Prevents the same vendor invoice from being entered twice on a project.
create unique index vendor_bills_unique_number on public.vendor_bills (project_id, lower(vendor_name), bill_number)
  where bill_number is not null and status <> 'voided';

-- ============ Vendor payments ============
create table public.vendor_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  bill_id uuid not null references public.vendor_bills(id) on delete restrict,
  payment_date date not null,
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  method text not null check (method in ('check', 'ach', 'wire', 'card', 'cash', 'other')),
  reference text check (reference is null or char_length(reference) <= 120),
  idempotency_key uuid not null unique,
  recorded_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text check (reversal_reason is null or char_length(btrim(reversal_reason)) between 3 and 1000),
  check ((reversed_at is null) = (reversal_reason is null))
);
create index vendor_payments_project_idx on public.vendor_payments (project_id);
create index vendor_payments_bill_idx on public.vendor_payments (bill_id);

-- ============ Manual estimate-to-complete per category ============
create table public.project_cost_forecasts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  cost_category text not null check (public.is_cost_category(cost_category)),
  etc_cents bigint not null check (etc_cents >= 0 and etc_cents <= 100000000000),
  note text not null check (char_length(btrim(note)) between 3 and 1000),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, cost_category)
);

-- ============ Integrity triggers ============
create or replace function public.validate_job_cost_row()
returns trigger language plpgsql set search_path = '' as $$
declare v_org uuid; v_commit record; v_bill record;
begin
  select organization_id into v_org from public.projects where id = new.project_id;
  if v_org is null or v_org <> new.organization_id then
    raise exception 'Project does not belong to this organization' using errcode = '23514';
  end if;

  if tg_table_name = 'vendor_bills' and new.commitment_id is not null then
    select project_id, status into v_commit from public.project_commitments where id = new.commitment_id;
    if v_commit.project_id is distinct from new.project_id then
      raise exception 'Commitment belongs to a different project' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' and v_commit.status <> 'approved' then
      raise exception 'Bills can only be recorded against approved commitments' using errcode = '23514';
    end if;
  end if;

  if tg_table_name = 'vendor_payments' then
    select project_id into v_bill from public.vendor_bills where id = new.bill_id;
    if v_bill.project_id is distinct from new.project_id then
      raise exception 'Payment project does not match the bill' using errcode = '23514';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id or new.project_id <> old.project_id then
      raise exception 'Financial records cannot move between projects' using errcode = '23514';
    end if;
    if tg_table_name = 'project_commitments' then
      if old.status in ('closed', 'cancelled') then
        raise exception 'Closed or cancelled commitments are read-only' using errcode = '23514';
      end if;
      if old.status = 'approved' and (new.amount_cents <> old.amount_cents or new.cost_category <> old.cost_category or new.status = 'draft') then
        raise exception 'Approved commitments are locked; record a change order or a new commitment' using errcode = '23514';
      end if;
    elsif tg_table_name = 'vendor_bills' then
      if old.status = 'voided' then
        raise exception 'Voided bills are read-only' using errcode = '23514';
      end if;
      if old.status = 'approved' and (new.status <> 'voided' or new.amount_cents <> old.amount_cents or new.cost_category <> old.cost_category) then
        raise exception 'Approved bills can only be voided' using errcode = '23514';
      end if;
      if new.status = 'voided' and exists (select 1 from public.vendor_payments where bill_id = new.id and reversed_at is null) then
        raise exception 'Reverse the payments on this bill before voiding it' using errcode = '23514';
      end if;
    elsif tg_table_name = 'vendor_payments' then
      if old.reversed_at is not null
        or new.amount_cents <> old.amount_cents or new.bill_id <> old.bill_id or new.payment_date <> old.payment_date then
        raise exception 'Payments are immutable; reverse and re-record instead' using errcode = '23514';
      end if;
    end if;
  end if;
  return new;
end;
$$;

create trigger project_commitments_validate before insert or update on public.project_commitments
  for each row execute function public.validate_job_cost_row();
create trigger vendor_bills_validate before insert or update on public.vendor_bills
  for each row execute function public.validate_job_cost_row();
create trigger vendor_payments_validate before insert or update on public.vendor_payments
  for each row execute function public.validate_job_cost_row();
create trigger project_cost_forecasts_validate before insert or update on public.project_cost_forecasts
  for each row execute function public.validate_job_cost_row();

create trigger project_commitments_updated_at before update on public.project_commitments for each row execute function public.set_updated_at();
create trigger vendor_bills_updated_at before update on public.vendor_bills for each row execute function public.set_updated_at();
create trigger project_cost_forecasts_updated_at before update on public.project_cost_forecasts for each row execute function public.set_updated_at();

create trigger audit_project_commitments after insert or update on public.project_commitments for each row execute function public.write_audit_event();
create trigger audit_vendor_bills after insert or update on public.vendor_bills for each row execute function public.write_audit_event();
create trigger audit_vendor_payments after insert or update on public.vendor_payments for each row execute function public.write_audit_event();
create trigger audit_project_cost_forecasts after insert or update on public.project_cost_forecasts for each row execute function public.write_audit_event();

-- ============ Payment RPCs (row-locked, idempotent) ============
create or replace function public.record_vendor_payment(
  p_bill uuid, p_payment_date date, p_amount_cents bigint, p_method text, p_reference text, p_idempotency_key uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_bill public.vendor_bills; v_paid bigint; v_existing uuid; v_id uuid;
begin
  select id into v_existing from public.vendor_payments where idempotency_key = p_idempotency_key;
  if v_existing is not null then return v_existing; end if;

  select * into v_bill from public.vendor_bills where id = p_bill for update;
  if v_bill.id is null or not public.can_manage_project_costs(v_bill.project_id) then
    raise exception 'Bill not found' using errcode = '42501';
  end if;
  if v_bill.status <> 'approved' then
    raise exception 'Only approved bills can be paid' using errcode = '23514';
  end if;
  select coalesce(sum(amount_cents), 0) into v_paid from public.vendor_payments where bill_id = p_bill and reversed_at is null;
  if v_paid + p_amount_cents > v_bill.amount_cents then
    raise exception 'Payment exceeds the unpaid balance of %', v_bill.amount_cents - v_paid using errcode = '23514';
  end if;

  insert into public.vendor_payments (organization_id, project_id, bill_id, payment_date, amount_cents, method, reference, idempotency_key)
  values (v_bill.organization_id, v_bill.project_id, p_bill, p_payment_date, p_amount_cents, p_method, nullif(btrim(p_reference), ''), p_idempotency_key)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.reverse_vendor_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_payment public.vendor_payments;
begin
  select * into v_payment from public.vendor_payments where id = p_payment for update;
  if v_payment.id is null or not public.can_manage_project_costs(v_payment.project_id) then
    raise exception 'Payment not found' using errcode = '42501';
  end if;
  if v_payment.reversed_at is not null then
    raise exception 'Payment is already reversed' using errcode = '23514';
  end if;
  update public.vendor_payments
     set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = btrim(p_reason)
   where id = p_payment;
end;
$$;

revoke all on function public.record_vendor_payment(uuid, date, bigint, text, text, uuid) from public, anon;
revoke all on function public.reverse_vendor_payment(uuid, text) from public, anon;
grant execute on function public.record_vendor_payment(uuid, date, bigint, text, text, uuid) to authenticated;
grant execute on function public.reverse_vendor_payment(uuid, text) to authenticated;

-- ============ Row level security ============
alter table public.project_commitments enable row level security;
alter table public.vendor_bills enable row level security;
alter table public.vendor_payments enable row level security;
alter table public.project_cost_forecasts enable row level security;

create policy project_commitments_select on public.project_commitments for select to authenticated using (public.can_manage_project_costs(project_id));
create policy project_commitments_insert on public.project_commitments for insert to authenticated with check (public.can_manage_project_costs(project_id) and status = 'draft');
create policy project_commitments_update on public.project_commitments for update to authenticated using (public.can_manage_project_costs(project_id)) with check (public.can_manage_project_costs(project_id));

create policy vendor_bills_select on public.vendor_bills for select to authenticated using (public.can_manage_project_costs(project_id));
create policy vendor_bills_insert on public.vendor_bills for insert to authenticated with check (public.can_manage_project_costs(project_id) and status = 'draft');
create policy vendor_bills_update on public.vendor_bills for update to authenticated using (public.can_manage_project_costs(project_id)) with check (public.can_manage_project_costs(project_id));

-- Payments are written only through record_vendor_payment / reverse_vendor_payment.
create policy vendor_payments_select on public.vendor_payments for select to authenticated using (public.can_manage_project_costs(project_id));

create policy project_cost_forecasts_select on public.project_cost_forecasts for select to authenticated using (public.can_manage_project_costs(project_id));
create policy project_cost_forecasts_insert on public.project_cost_forecasts for insert to authenticated with check (public.can_manage_project_costs(project_id));
create policy project_cost_forecasts_update on public.project_cost_forecasts for update to authenticated using (public.can_manage_project_costs(project_id)) with check (public.can_manage_project_costs(project_id));
