-- Atomic save for the spreadsheet-style estimate editor.
-- Runs as the caller (security invoker), so RLS and the existing estimate_line_items_guard
-- trigger still enforce manager-only access and the draft/internal-review lock.
-- p_expected_updated_at rejects the save if the estimate changed since the editor loaded,
-- so concurrent edits are never silently overwritten.
create or replace function public.save_estimate_line_items(
  p_estimate uuid,
  p_items jsonb,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_est record;
  v_item jsonb;
  v_pos bigint;
  v_keep uuid[];
  v_updated timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid line items';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'An estimate can have at most 1,000 line items';
  end if;

  select e.id, e.organization_id, e.status, e.updated_at
    into v_est
    from public.estimates e
   where e.id = p_estimate
   for update;
  if v_est.id is null then
    raise exception 'Estimate not found';
  end if;
  if not public.is_org_manager(v_est.organization_id) then
    raise exception 'Only managers can edit estimate line items';
  end if;
  if v_est.status not in ('draft', 'internal_review') then
    raise exception 'Line items are locked because this estimate is %. Create a revision to make changes.',
      replace(v_est.status, '_', ' ');
  end if;
  if p_expected_updated_at is not null and v_est.updated_at <> p_expected_updated_at then
    raise exception 'This estimate was changed since you opened it. Reload the page to get the latest version, then reapply your edits.';
  end if;

  v_keep := array(
    select (x->>'id')::uuid from jsonb_array_elements(p_items) x where nullif(x->>'id', '') is not null
  );

  delete from public.estimate_line_items li
   where li.estimate_id = p_estimate
     and not (li.id = any (v_keep));

  for v_item, v_pos in select x, o from jsonb_array_elements(p_items) with ordinality as t(x, o) loop
    if nullif(v_item->>'id', '') is not null then
      update public.estimate_line_items li set
        category = v_item->>'category',
        description = v_item->>'description',
        quantity = (v_item->>'quantity')::numeric,
        unit = v_item->>'unit',
        material_unit_cents = (v_item->>'material_unit_cents')::bigint,
        labor_unit_cents = (v_item->>'labor_unit_cents')::bigint,
        other_unit_cents = (v_item->>'other_unit_cents')::bigint,
        is_allowance = coalesce((v_item->>'is_allowance')::boolean, false),
        notes = nullif(btrim(coalesce(v_item->>'notes', '')), ''),
        sort_order = (v_pos * 10)::integer
       where li.id = (v_item->>'id')::uuid
         and li.estimate_id = p_estimate;
      if not found then
        raise exception 'A line item was removed since you opened this estimate. Reload the page and try again.';
      end if;
    else
      insert into public.estimate_line_items (
        organization_id, estimate_id, category, description, quantity, unit,
        material_unit_cents, labor_unit_cents, other_unit_cents, is_allowance, notes, sort_order
      ) values (
        v_est.organization_id, p_estimate, v_item->>'category', v_item->>'description',
        (v_item->>'quantity')::numeric, v_item->>'unit',
        (v_item->>'material_unit_cents')::bigint, (v_item->>'labor_unit_cents')::bigint,
        (v_item->>'other_unit_cents')::bigint, coalesce((v_item->>'is_allowance')::boolean, false),
        nullif(btrim(coalesce(v_item->>'notes', '')), ''), (v_pos * 10)::integer
      );
    end if;
  end loop;

  -- Touch the parent so derived totals are recomputed even when every line was deleted.
  update public.estimates e set updated_at = now() where e.id = p_estimate
  returning e.updated_at into v_updated;
  return v_updated;
end;
$$;

revoke execute on function public.save_estimate_line_items(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.save_estimate_line_items(uuid, jsonb, timestamptz) to authenticated;
