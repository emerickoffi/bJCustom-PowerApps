-- "Add from" on invoices: a line can carry the approved change orders or approved crew time it bills, so the same item
-- is never billed twice (voided invoices release their items). Lines stay editable; the link is what prevents doubles.

create table if not exists public.invoice_line_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  line_id uuid not null references public.invoice_line_items(id) on delete cascade,
  source_type text not null check (source_type in ('change_order', 'time_entry')),
  source_id uuid not null,
  created_at timestamptz not null default now(),
  unique (invoice_id, source_type, source_id)
);
create index if not exists invoice_line_sources_source_idx on public.invoice_line_sources (source_type, source_id);
create index if not exists invoice_line_sources_line_idx on public.invoice_line_sources (line_id);

alter table public.invoice_line_sources enable row level security;
drop policy if exists invoice_line_sources_select on public.invoice_line_sources;
create policy invoice_line_sources_select on public.invoice_line_sources for select to authenticated
  using (public.is_org_manager(organization_id));
drop policy if exists invoice_line_sources_insert on public.invoice_line_sources;
create policy invoice_line_sources_insert on public.invoice_line_sources for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'invoices'));
revoke all on public.invoice_line_sources from anon;
grant select, insert on public.invoice_line_sources to authenticated;

create or replace function public.replace_invoice_lines(p_invoice uuid, p_lines jsonb)
 returns void
 language plpgsql
 set search_path to ''
as $function$
declare
  v_inv public.invoices;
  v_line jsonb; v_ord bigint; v_line_id uuid; v_src jsonb; v_type text; v_id uuid; v_other text; v_label text;
  v_total int := 0;
begin
  select * into v_inv from public.invoices where id = p_invoice and status = 'draft';
  if v_inv.id is null then raise exception 'Only draft invoices can be edited'; end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 200 then
    raise exception 'Invalid line items';
  end if;
  -- One project at a time, so two drafts can't claim the same item at once.
  perform pg_advisory_xact_lock(hashtextextended('invoice_sources:' || v_inv.project_id::text, 0));

  delete from public.invoice_line_items where invoice_id = p_invoice;

  for v_line, v_ord in select item, ord from jsonb_array_elements(p_lines) with ordinality as l(item, ord) loop
    insert into public.invoice_line_items (organization_id, invoice_id, position, description, quantity, unit_rate_cents, taxable)
      values (v_inv.organization_id, p_invoice, (v_ord - 1)::integer, v_line ->> 'description', (v_line ->> 'quantity')::numeric,
              (v_line ->> 'unit_rate_cents')::bigint, coalesce((v_line ->> 'taxable')::boolean, true))
      returning id into v_line_id;

    if jsonb_typeof(v_line -> 'sources') = 'array' then
      for v_src in select * from jsonb_array_elements(v_line -> 'sources') loop
        v_total := v_total + 1;
        if v_total > 1000 then raise exception 'Too many billed items on one invoice'; end if;
        v_type := v_src ->> 'type';
        begin
          v_id := (v_src ->> 'id')::uuid;
        exception when others then raise exception 'Invalid billed item';
        end;
        if v_type = 'change_order' then
          select coalesce(co_number, title) into v_label from public.change_orders
           where id = v_id and project_id = v_inv.project_id and organization_id = v_inv.organization_id
             and status = 'approved' and price_adjustment_cents > 0;
          if v_label is null then raise exception 'Only approved change orders that add to the price can be billed'; end if;
        elsif v_type = 'time_entry' then
          select 'crew time' into v_label from public.time_entries
           where id = v_id and project_id = v_inv.project_id and organization_id = v_inv.organization_id and status = 'approved';
          if v_label is null then raise exception 'Only approved crew time on this project can be billed'; end if;
        else
          raise exception 'Invalid billed item';
        end if;

        select i.invoice_number into v_other
          from public.invoice_line_sources s join public.invoices i on i.id = s.invoice_id
         where s.source_type = v_type and s.source_id = v_id and s.invoice_id <> p_invoice and i.status <> 'voided'
         limit 1;
        if v_other is not null then
          raise exception '% is already billed on %', initcap(v_label), v_other;
        end if;

        begin
          insert into public.invoice_line_sources (organization_id, invoice_id, line_id, source_type, source_id)
            values (v_inv.organization_id, p_invoice, v_line_id, v_type, v_id);
        exception when unique_violation then
          raise exception 'The same item is on this invoice twice';
        end;
      end loop;
    end if;
  end loop;
end;
$function$;
