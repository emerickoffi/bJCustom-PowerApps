-- Billing limit = approved estimate + approved change orders.
--
-- The project budget (lib/financials) already counts approved change orders in the contract value, but
-- issue_invoice capped billing at the original estimate, so an approved change order could never be invoiced
-- against the contract. This uses the same rule as the budget:
-- - When the project has exactly one approved estimate family (an established baseline), the limit is that
--   family's latest approved construction total plus the price adjustments of all approved change orders on the
--   project, and already-billed counts every issued invoice on any revision of that family.
-- - Otherwise (more than one approved estimate family) the previous per-estimate limit is kept unchanged.
-- Everything else in issue_invoice is identical to the live definition.

create or replace function public.estimate_billing_limit(p_estimate uuid, p_exclude_invoice uuid default null)
returns table (limit_cents bigint, estimate_cents bigint, change_order_cents bigint, billed_cents bigint, lock_key text)
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_project uuid;
  v_family uuid;
  v_total bigint;
  v_families integer;
begin
  select e.project_id, e.family_id, e.construction_total_cents into v_project, v_family, v_total
  from public.estimates e where e.id = p_estimate;
  if v_project is null then return; end if;

  select count(distinct e.family_id) into v_families
  from public.estimates e where e.project_id = v_project and e.status = 'approved';

  if v_families = 1 and exists (select 1 from public.estimates e where e.family_id = v_family and e.status = 'approved') then
    select e.construction_total_cents into estimate_cents from public.estimates e
    where e.family_id = v_family and e.status = 'approved' order by e.revision desc limit 1;
    select coalesce(sum(c.price_adjustment_cents), 0) into change_order_cents
    from public.change_orders c where c.project_id = v_project and c.status = 'approved';
    select coalesce(sum(i.subtotal_cents), 0) into billed_cents
    from public.invoices i join public.estimates e on e.id = i.estimate_id
    where e.family_id = v_family and i.status not in ('draft', 'voided')
      and (p_exclude_invoice is null or i.id <> p_exclude_invoice);
    lock_key := 'invoice_estimate_family:' || v_family::text;
  else
    estimate_cents := v_total;
    change_order_cents := 0;
    select coalesce(sum(i.subtotal_cents), 0) into billed_cents
    from public.invoices i
    where i.estimate_id = p_estimate and i.status not in ('draft', 'voided')
      and (p_exclude_invoice is null or i.id <> p_exclude_invoice);
    lock_key := 'invoice_estimate:' || p_estimate::text;
  end if;
  limit_cents := estimate_cents + change_order_cents;
  return next;
end;
$$;

revoke all on function public.estimate_billing_limit(uuid, uuid) from public, anon, authenticated;

create or replace function public.issue_invoice(p_invoice uuid, p_publish boolean default false)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare inv public.invoices; v_lines integer; v_est_status text; v_snapshot jsonb; v_lim record;
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
    select e.status into v_est_status from public.estimates e where e.id = inv.estimate_id;
    if v_est_status is distinct from 'approved' then
      raise exception 'Only approved estimates can be billed against';
    end if;
    select * into v_lim from public.estimate_billing_limit(inv.estimate_id, inv.id);
    perform pg_advisory_xact_lock(hashtextextended(v_lim.lock_key, 0));
    -- Re-read after taking the lock so a concurrent issue on the same contract is counted.
    select * into v_lim from public.estimate_billing_limit(inv.estimate_id, inv.id);
    if v_lim.billed_cents + inv.subtotal_cents > v_lim.limit_cents then
      raise exception '%', case when v_lim.change_order_cents <> 0
        then format('This invoice would bill more than the approved contract (estimate plus approved change orders). Already invoiced: $%s, remaining: $%s',
          to_char(v_lim.billed_cents / 100.0, 'FM999,999,999,990.00'),
          to_char(greatest(v_lim.limit_cents - v_lim.billed_cents, 0) / 100.0, 'FM999,999,999,990.00'))
        else format('This invoice would bill more than the approved estimate. Already invoiced: $%s, remaining: $%s',
          to_char(v_lim.billed_cents / 100.0, 'FM999,999,999,990.00'),
          to_char(greatest(v_lim.limit_cents - v_lim.billed_cents, 0) / 100.0, 'FM999,999,999,990.00')) end;
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
$function$;
