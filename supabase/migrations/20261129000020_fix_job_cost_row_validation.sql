-- Corrective migration for 20261102000010_job_costing.
-- validate_job_cost_row() tested `tg_table_name = 'vendor_bills' and new.commitment_id is not null`
-- in one expression. PL/pgSQL does not guarantee short-circuit evaluation, so the field reference
-- was resolved for project_commitments and project_cost_forecasts rows too, which have no
-- commitment_id column, and every insert failed with 42703. The rules are unchanged; only the
-- commitment_id check is nested so it is evaluated for vendor_bills rows alone.

create or replace function public.validate_job_cost_row()
returns trigger language plpgsql set search_path = '' as $$
declare v_org uuid; v_commit record; v_bill record;
begin
  select organization_id into v_org from public.projects where id = new.project_id;
  if v_org is null or v_org <> new.organization_id then
    raise exception 'Project does not belong to this organization' using errcode = '23514';
  end if;

  if tg_table_name = 'vendor_bills' then
    if new.commitment_id is not null then
      select project_id, status into v_commit from public.project_commitments where id = new.commitment_id;
      if v_commit.project_id is distinct from new.project_id then
        raise exception 'Commitment belongs to a different project' using errcode = '23514';
      end if;
      if tg_op = 'INSERT' and v_commit.status <> 'approved' then
        raise exception 'Bills can only be recorded against approved commitments' using errcode = '23514';
      end if;
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
