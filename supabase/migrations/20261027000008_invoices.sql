-- Invoices module: draft -> issued invoices, construction draws, manual (offline) payments, issued snapshots.
-- Independent of QuickBooks, Resend, and payment processors. Money is stored as integer cents.
-- Status, paid totals, issue, void and reversals change only through the security definer functions below.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation', true,  array[]::text[]),
    ('schedule',     true,  array[]::text[]),
    ('estimates',    true,  array[]::text[]),
    ('walkthroughs', true,  array[]::text[]),
    ('issues',       true,  array[]::text[]),
    ('warranty',     true,  array[]::text[]),
    ('portal',       true,  array[]::text[]),
    ('documents',    false, array[]::text[]),
    ('reports',      true,  array['walkthroughs']),
    ('invoices',     false, array[]::text[]),
    ('payments',     false, array['estimates']),
    ('quickbooks',   false, array['estimates'])
$$;

-- ============ Tables ============
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  estimate_id uuid references public.estimates(id) on delete restrict,
  invoice_number text not null default '' check (char_length(invoice_number) <= 40),
  invoice_type text not null default 'standard' check (invoice_type in ('standard', 'draw')),
  draw_milestone text check (draw_milestone is null or draw_milestone in
    ('deposit', 'foundation', 'framing', 'roofing', 'mechanical', 'drywall', 'finishes', 'final', 'other')),
  title text not null check (char_length(btrim(title)) between 2 and 160),
  invoice_date date not null default current_date,
  due_date date not null,
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 200),
  payment_instructions text check (payment_instructions is null or char_length(payment_instructions) <= 2000),
  notes text check (notes is null or char_length(notes) <= 5000),
  tax_percent numeric(6,3) not null default 0 check (tax_percent between 0 and 100),
  subtotal_cents bigint not null default 0,
  taxable_subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  paid_cents bigint not null default 0,
  status text not null default 'draft' check (status in ('draft', 'issued', 'partially_paid', 'paid', 'voided')),
  portal_published boolean not null default false,
  issue_version integer not null default 0 check (issue_version >= 0),
  issued_at timestamptz,
  issued_by uuid references auth.users(id) on delete set null,
  bill_to jsonb,
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text check (void_reason is null or char_length(btrim(void_reason)) between 3 and 1000),
  accounting_sync_status text not null default 'not_synced'
    check (accounting_sync_status in ('not_synced', 'pending', 'synced', 'error')),
  external_accounting_id text check (external_accounting_id is null or char_length(external_accounting_id) <= 120),
  accounting_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, invoice_number),
  check (due_date >= invoice_date),
  check (paid_cents >= 0 and paid_cents <= total_cents),
  check (status <> 'voided' or (voided_at is not null and void_reason is not null)),
  check (invoice_type = 'draw' or draw_milestone is null)
);
create index if not exists invoices_org_idx on public.invoices (organization_id, created_at desc);
create index if not exists invoices_project_idx on public.invoices (project_id, created_at desc);
create index if not exists invoices_estimate_idx on public.invoices (estimate_id) where estimate_id is not null;

create table if not exists public.invoice_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position integer not null default 0,
  description text not null check (char_length(btrim(description)) between 1 and 500),
  quantity numeric(12,3) not null default 1 check (quantity > 0 and quantity <= 1000000),
  unit_rate_cents bigint not null check (unit_rate_cents between 0 and 100000000000),
  amount_cents bigint not null default 0,
  taxable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoice_line_items_invoice_idx on public.invoice_line_items (invoice_id, position);

create table if not exists public.invoice_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  payment_date date not null,
  amount_cents bigint not null check (amount_cents > 0),
  method text not null check (method in ('check', 'ach', 'wire', 'cash', 'card_offline', 'financing', 'other')),
  reference text check (reference is null or char_length(reference) <= 120),
  notes text check (notes is null or char_length(notes) <= 2000),
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id) on delete set null,
  reversal_reason text check (reversal_reason is null or char_length(btrim(reversal_reason)) between 3 and 1000),
  check ((reversed_at is null) = (reversal_reason is null))
);
create index if not exists invoice_payments_invoice_idx on public.invoice_payments (invoice_id, payment_date);

create table if not exists public.invoice_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id) on delete set null,
  unique (invoice_id, version)
);

create table if not exists public.invoice_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  event_type text not null check (event_type in
    ('created', 'issued', 'published', 'unpublished', 'payment_recorded', 'payment_reversed', 'voided')),
  actor_id uuid references auth.users(id) on delete set null,
  details text check (details is null or char_length(details) <= 1000),
  amount_cents bigint,
  created_at timestamptz not null default now()
);
create index if not exists invoice_events_invoice_idx on public.invoice_events (invoice_id, created_at);

-- ============ Invoice guard ============
create or replace function public.invoices_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_next integer; v_privileged boolean := coalesce(current_setting('app.invoice_op', true), '') = 'on';
begin
  if tg_op = 'INSERT' then
    new.status := 'draft';
    new.paid_cents := 0;
    new.issue_version := 0;
    new.portal_published := false;
    new.issued_at := null; new.issued_by := null; new.bill_to := null;
    new.voided_at := null; new.voided_by := null; new.void_reason := null;
    new.subtotal_cents := 0; new.taxable_subtotal_cents := 0;
    new.created_by := coalesce(new.created_by, auth.uid());
    perform pg_advisory_xact_lock(hashtextextended('invoice_number:' || new.organization_id::text, 0));
    select coalesce(max(substring(i.invoice_number from '^INV-(\d+)$')::integer), 0) + 1 into v_next
      from public.invoices i where i.organization_id = new.organization_id;
    new.invoice_number := 'INV-' || lpad(v_next::text, 4, '0');
  else
    if new.organization_id <> old.organization_id or new.invoice_number <> old.invoice_number then
      raise exception 'Invoice numbers cannot be changed';
    end if;
    if old.status <> 'draft' and (
         new.project_id, new.client_id, new.estimate_id, new.invoice_type, new.draw_milestone, new.title,
         new.invoice_date, new.due_date, new.payment_terms, new.payment_instructions, new.notes, new.tax_percent,
         new.subtotal_cents, new.taxable_subtotal_cents, new.tax_cents, new.total_cents, new.issue_version,
         new.issued_at, new.bill_to)
       is distinct from (
         old.project_id, old.client_id, old.estimate_id, old.invoice_type, old.draw_milestone, old.title,
         old.invoice_date, old.due_date, old.payment_terms, old.payment_instructions, old.notes, old.tax_percent,
         old.subtotal_cents, old.taxable_subtotal_cents, old.tax_cents, old.total_cents, old.issue_version,
         old.issued_at, old.bill_to) then
      raise exception 'Issued invoices cannot be edited. Void it and create a replacement invoice.';
    end if;
    if not v_privileged and (
         new.status, new.paid_cents, new.issue_version, new.issued_at, new.issued_by, new.bill_to,
         new.voided_at, new.voided_by, new.void_reason, new.portal_published)
       is distinct from (
         old.status, old.paid_cents, old.issue_version, old.issued_at, old.issued_by, old.bill_to,
         old.voided_at, old.voided_by, old.void_reason, old.portal_published) then
      raise exception 'Use the invoice actions to issue, publish, record payments, or void';
    end if;
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;

  if new.status = 'draft' then
    if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
      raise exception 'Project does not belong to this organization';
    end if;
    if not exists (select 1 from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id) then
      raise exception 'Client does not belong to this organization';
    end if;
    if new.estimate_id is not null and not exists (
        select 1 from public.estimates e where e.id = new.estimate_id and e.project_id = new.project_id) then
      raise exception 'The referenced estimate must belong to the same project';
    end if;
    new.tax_cents := round(new.taxable_subtotal_cents * new.tax_percent / 100)::bigint;
    new.total_cents := new.subtotal_cents + new.tax_cents;
  end if;
  return new;
end;
$$;
drop trigger if exists invoices_before_write on public.invoices;
create trigger invoices_before_write before insert or update on public.invoices
  for each row execute function public.invoices_before_write();
drop trigger if exists invoices_updated_at on public.invoices;
create trigger invoices_updated_at before update on public.invoices
  for each row execute function public.set_updated_at();

create or replace function public.invoices_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.invoice_events (organization_id, invoice_id, event_type, actor_id, details)
    values (new.organization_id, new.id, 'created', auth.uid(), new.invoice_number || ' created as a draft');
  return new;
end;
$$;
drop trigger if exists invoices_after_insert on public.invoices;
create trigger invoices_after_insert after insert on public.invoices
  for each row execute function public.invoices_after_insert();

create or replace function public.invoices_before_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status <> 'draft' then
    raise exception 'Issued invoices cannot be deleted. Void the invoice instead.';
  end if;
  return old;
end;
$$;
drop trigger if exists invoices_before_delete on public.invoices;
create trigger invoices_before_delete before delete on public.invoices
  for each row execute function public.invoices_before_delete();

-- ============ Line items ============
create or replace function public.invoice_line_items_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text; v_org uuid;
begin
  select i.status, i.organization_id into v_status, v_org
    from public.invoices i where i.id = coalesce(new.invoice_id, old.invoice_id);
  if tg_op = 'DELETE' then
    if v_status is not null and v_status <> 'draft' then
      raise exception 'Issued invoices cannot be edited. Void it and create a replacement invoice.';
    end if;
    return old;
  end if;
  if v_status is null then raise exception 'Invoice not found'; end if;
  if v_status <> 'draft' then
    raise exception 'Issued invoices cannot be edited. Void it and create a replacement invoice.';
  end if;
  if tg_op = 'UPDATE' and new.invoice_id <> old.invoice_id then
    raise exception 'Line items cannot move between invoices';
  end if;
  new.organization_id := v_org;
  new.description := btrim(new.description);
  new.amount_cents := round(new.quantity * new.unit_rate_cents)::bigint;
  return new;
end;
$$;
drop trigger if exists invoice_line_items_guard on public.invoice_line_items;
create trigger invoice_line_items_guard before insert or update or delete on public.invoice_line_items
  for each row execute function public.invoice_line_items_guard();

create or replace function public.invoice_line_items_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_invoice uuid := coalesce(new.invoice_id, old.invoice_id);
begin
  update public.invoices i set
    subtotal_cents = coalesce((select sum(l.amount_cents) from public.invoice_line_items l where l.invoice_id = v_invoice), 0),
    taxable_subtotal_cents = coalesce((select sum(l.amount_cents) from public.invoice_line_items l where l.invoice_id = v_invoice and l.taxable), 0)
  where i.id = v_invoice and i.status = 'draft';
  return null;
end;
$$;
drop trigger if exists invoice_line_items_recalc on public.invoice_line_items;
create trigger invoice_line_items_recalc after insert or update or delete on public.invoice_line_items
  for each row execute function public.invoice_line_items_recalc();

-- Atomically replaces a draft's line items. Runs as the caller so RLS applies.
create or replace function public.replace_invoice_lines(p_invoice uuid, p_lines jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.invoices where id = p_invoice and status = 'draft';
  if v_org is null then raise exception 'Only draft invoices can be edited'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 200 then
    raise exception 'Invalid line items';
  end if;
  delete from public.invoice_line_items where invoice_id = p_invoice;
  insert into public.invoice_line_items (organization_id, invoice_id, position, description, quantity, unit_rate_cents, taxable)
  select v_org, p_invoice, (l.ord - 1)::integer, l.item ->> 'description', (l.item ->> 'quantity')::numeric,
         (l.item ->> 'unit_rate_cents')::bigint, coalesce((l.item ->> 'taxable')::boolean, true)
  from jsonb_array_elements(p_lines) with ordinality as l(item, ord);
end;
$$;
grant execute on function public.replace_invoice_lines(uuid, jsonb) to authenticated;

-- ============ Workflow functions ============
create or replace function public.invoice_assert_manager(p_org uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_org_manager(p_org) then
    raise exception 'Only administrators and project managers can manage invoices';
  end if;
  if not public.is_feature_enabled(p_org, 'invoices') then
    raise exception 'The Invoices module is turned off for your organization';
  end if;
end;
$$;

create or replace function public.issue_invoice(p_invoice uuid, p_publish boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.invoices; v_lines integer; v_est_total bigint; v_est_status text; v_billed bigint; v_snapshot jsonb;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  perform public.invoice_assert_manager(inv.organization_id);
  if not public.can_view_project_internal(inv.project_id) then raise exception 'Invoice not found'; end if;
  if inv.status <> 'draft' then raise exception 'This invoice has already been issued'; end if;
  select count(*) into v_lines from public.invoice_line_items where invoice_id = inv.id;
  if v_lines = 0 then raise exception 'Add at least one line item before issuing'; end if;
  if inv.total_cents <= 0 then raise exception 'The invoice total must be greater than zero'; end if;

  if inv.estimate_id is not null then
    select e.construction_total_cents, e.status into v_est_total, v_est_status from public.estimates e where e.id = inv.estimate_id;
    if v_est_status is distinct from 'approved' then
      raise exception 'Only approved estimates can be billed against';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('invoice_estimate:' || inv.estimate_id::text, 0));
    select coalesce(sum(subtotal_cents), 0) into v_billed from public.invoices
      where estimate_id = inv.estimate_id and status not in ('draft', 'voided') and id <> inv.id;
    if v_billed + inv.subtotal_cents > v_est_total then
      raise exception 'This invoice would bill more than the approved estimate. Already invoiced: $%, remaining: $%',
        to_char(v_billed / 100.0, 'FM999,999,999,990.00'),
        to_char(greatest(v_est_total - v_billed, 0) / 100.0, 'FM999,999,999,990.00');
    end if;
  end if;

  select jsonb_build_object(
      'name', btrim(concat_ws(' ', c.first_name, c.middle_name, c.last_name)), 'company', c.company_name,
      'email', c.email, 'phone', c.phone, 'address_line1', c.address_line1, 'address_line2', c.address_line2,
      'city', c.city, 'state', c.state, 'postal_code', c.postal_code)
    into inv.bill_to from public.clients c where c.id = inv.client_id;

  select jsonb_build_object(
      'invoice', to_jsonb(inv) - 'accounting_metadata',
      'project', (select jsonb_build_object('name', p.name, 'project_number', p.project_number,
          'address_line1', p.address_line1, 'address_line2', p.address_line2, 'city', p.city, 'state', p.state,
          'postal_code', p.postal_code) from public.projects p where p.id = inv.project_id),
      'lines', (select coalesce(jsonb_agg(jsonb_build_object('description', l.description, 'quantity', l.quantity,
          'unit_rate_cents', l.unit_rate_cents, 'amount_cents', l.amount_cents, 'taxable', l.taxable) order by l.position), '[]'::jsonb)
        from public.invoice_line_items l where l.invoice_id = inv.id))
    into v_snapshot;

  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set status = 'issued', issue_version = issue_version + 1, issued_at = now(),
    issued_by = auth.uid(), bill_to = inv.bill_to, portal_published = coalesce(p_publish, false)
    where id = inv.id;
  perform set_config('app.invoice_op', '', true);

  insert into public.invoice_versions (organization_id, invoice_id, version, snapshot, issued_by)
    values (inv.organization_id, inv.id, inv.issue_version + 1, v_snapshot, auth.uid());
  insert into public.invoice_events (organization_id, invoice_id, event_type, actor_id, details, amount_cents)
    values (inv.organization_id, inv.id, 'issued', auth.uid(),
            case when p_publish then 'Issued and published to the homeowner portal' else 'Issued' end, inv.total_cents);
end;
$$;
grant execute on function public.issue_invoice(uuid, boolean) to authenticated;

create or replace function public.set_invoice_published(p_invoice uuid, p_published boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  perform public.invoice_assert_manager(inv.organization_id);
  if inv.status = 'draft' then raise exception 'Issue the invoice before publishing it'; end if;
  if inv.portal_published = p_published then return; end if;
  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set portal_published = p_published where id = inv.id;
  perform set_config('app.invoice_op', '', true);
  insert into public.invoice_events (organization_id, invoice_id, event_type, actor_id, details)
    values (inv.organization_id, inv.id, case when p_published then 'published' else 'unpublished' end, auth.uid(),
            case when p_published then 'Shared with the homeowner portal' else 'Hidden from the homeowner portal' end);
end;
$$;
grant execute on function public.set_invoice_published(uuid, boolean) to authenticated;

create or replace function public.void_invoice(p_invoice uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.invoices;
begin
  select * into inv from public.invoices where id = p_invoice for update;
  if inv.id is null then raise exception 'Invoice not found'; end if;
  perform public.invoice_assert_manager(inv.organization_id);
  if inv.status = 'voided' then raise exception 'This invoice is already voided'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for voiding this invoice'; end if;
  if inv.paid_cents > 0 then
    raise exception 'Reverse the recorded payments before voiding this invoice';
  end if;
  perform set_config('app.invoice_op', 'on', true);
  update public.invoices set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = btrim(p_reason)
    where id = inv.id;
  perform set_config('app.invoice_op', '', true);
  insert into public.invoice_events (organization_id, invoice_id, event_type, actor_id, details)
    values (inv.organization_id, inv.id, 'voided', auth.uid(), left(btrim(p_reason), 1000));
end;
$$;
grant execute on function public.void_invoice(uuid, text) to authenticated;

-- ============ Payments ============
create or replace function public.invoice_payments_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare inv public.invoices;
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments cannot be deleted. Reverse the payment instead.';
  end if;
  if tg_op = 'UPDATE' then
    if coalesce(current_setting('app.invoice_op', true), '') <> 'on'
       or old.reversed_at is not null or new.reversed_at is null
       or (new.invoice_id, new.organization_id, new.payment_date, new.amount_cents, new.method, new.reference, new.notes, new.recorded_by, new.created_at)
          is distinct from
          (old.invoice_id, old.organization_id, old.payment_date, old.amount_cents, old.method, old.reference, old.notes, old.recorded_by, old.created_at) then
      raise exception 'Payments cannot be edited. Reverse the payment and record a corrected one.';
    end if;
    return new;
  end if;

  select * into inv from public.invoices where id = new.invoice_id for update;
  if inv.id is null or inv.organization_id <> new.organization_id then raise exception 'Invoice not found'; end if;
  if not public.is_feature_enabled(inv.organization_id, 'invoices') then
    raise exception 'The Invoices module is turned off for your organization';
  end if;
  if inv.status not in ('issued', 'partially_paid') then
    raise exception 'Payments can only be recorded on issued invoices with a remaining balance';
  end if;
  if new.payment_date > current_date then raise exception 'The payment date cannot be in the future'; end if;
  if new.amount_cents > inv.total_cents - inv.paid_cents then
    raise exception 'This payment is more than the remaining balance of $%. Overpayments and credits are not supported.',
      to_char((inv.total_cents - inv.paid_cents) / 100.0, 'FM999,999,999,990.00');
  end if;
  new.recorded_by := auth.uid();
  new.reversed_at := null; new.reversed_by := null; new.reversal_reason := null;
  new.reference := nullif(btrim(coalesce(new.reference, '')), '');
  return new;
end;
$$;
drop trigger if exists invoice_payments_before_write on public.invoice_payments;
create trigger invoice_payments_before_write before insert or update or delete on public.invoice_payments
  for each row execute function public.invoice_payments_before_write();

create or replace function public.invoice_payments_after_write()
returns trigger language plpgsql security definer set search_path = '' as $$
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
            case when tg_op = 'INSERT' then 'Offline payment recorded (' || new.method || coalesce(', ref ' || new.reference, '') || ')'
                 else 'Payment reversed: ' || new.reversal_reason end,
            new.amount_cents);
  return null;
end;
$$;
drop trigger if exists invoice_payments_after_write on public.invoice_payments;
create trigger invoice_payments_after_write after insert or update on public.invoice_payments
  for each row execute function public.invoice_payments_after_write();

create or replace function public.reverse_invoice_payment(p_payment uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare pay public.invoice_payments;
begin
  select * into pay from public.invoice_payments where id = p_payment for update;
  if pay.id is null then raise exception 'Payment not found'; end if;
  perform public.invoice_assert_manager(pay.organization_id);
  if pay.reversed_at is not null then raise exception 'This payment has already been reversed'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'Enter a reason for the reversal'; end if;
  perform 1 from public.invoices where id = pay.invoice_id for update;
  perform set_config('app.invoice_op', 'on', true);
  update public.invoice_payments set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = btrim(p_reason)
    where id = pay.id;
  perform set_config('app.invoice_op', '', true);
end;
$$;
grant execute on function public.reverse_invoice_payment(uuid, text) to authenticated;

-- ============ RLS ============
alter table public.invoices enable row level security;
alter table public.invoice_line_items enable row level security;
alter table public.invoice_payments enable row level security;
alter table public.invoice_versions enable row level security;
alter table public.invoice_events enable row level security;

drop policy if exists invoices_select on public.invoices;
create policy invoices_select on public.invoices for select to authenticated using (
  (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
  or (status <> 'draft' and portal_published and public.is_project_homeowner(project_id)));
drop policy if exists invoices_insert on public.invoices;
create policy invoices_insert on public.invoices for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists invoices_update on public.invoices;
create policy invoices_update on public.invoices for update to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists invoices_delete on public.invoices;
create policy invoices_delete on public.invoices for delete to authenticated
  using (public.is_org_manager(organization_id) and status = 'draft');

drop policy if exists invoice_line_items_select on public.invoice_line_items;
create policy invoice_line_items_select on public.invoice_line_items for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
drop policy if exists invoice_line_items_write on public.invoice_line_items;
create policy invoice_line_items_write on public.invoice_line_items for all to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));

drop policy if exists invoice_payments_select on public.invoice_payments;
create policy invoice_payments_select on public.invoice_payments for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));
drop policy if exists invoice_payments_insert on public.invoice_payments;
create policy invoice_payments_insert on public.invoice_payments for insert to authenticated
  with check (public.is_org_manager(organization_id));

drop policy if exists invoice_versions_select on public.invoice_versions;
create policy invoice_versions_select on public.invoice_versions for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = invoice_id));

drop policy if exists invoice_events_select on public.invoice_events;
create policy invoice_events_select on public.invoice_events for select to authenticated
  using (public.is_org_manager(organization_id));

-- Feature gate: writes need the module on; administrators keep read-only archive access when it is off.
do $$
declare t text;
begin
  foreach t in array array['invoices', 'invoice_line_items', 'invoice_payments', 'invoice_versions', 'invoice_events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_feature_read', t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using (public.is_feature_enabled(organization_id, %L) or public.is_org_admin(organization_id))', t || '_feature_read', t, 'invoices');
    execute format('drop policy if exists %I on public.%I', t || '_feature_insert', t);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (public.is_feature_enabled(organization_id, %L))', t || '_feature_insert', t, 'invoices');
    execute format('drop policy if exists %I on public.%I', t || '_feature_update', t);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (public.is_feature_enabled(organization_id, %L))', t || '_feature_update', t, 'invoices');
    execute format('drop policy if exists %I on public.%I', t || '_feature_delete', t);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (public.is_feature_enabled(organization_id, %L))', t || '_feature_delete', t, 'invoices');
  end loop;
end $$;

grant select, insert, update, delete on public.invoices, public.invoice_line_items to authenticated;
grant select, insert on public.invoice_payments to authenticated;
grant select on public.invoice_versions, public.invoice_events to authenticated;
