-- Idempotent draft-estimate creation used by the AI assistant's "Create draft estimate" button.
-- creation_key is generated once per chat preview, so double-clicks, retries, and repeated
-- tool execution all resolve to the same estimate instead of creating duplicates.
alter table public.estimates add column if not exists creation_key uuid;
create unique index if not exists estimates_creation_key_uidx
  on public.estimates (organization_id, creation_key) where creation_key is not null;

-- Runs as the caller (security invoker): RLS, the estimate write guard, number generation,
-- and the line-item recalc triggers all apply exactly as they do for manual estimates.
create or replace function public.create_estimate_draft_with_items(
  p_project uuid,
  p_name text,
  p_description text,
  p_markup_percent numeric,
  p_notes text,
  p_items jsonb,
  p_creation_key uuid
)
returns table (new_estimate_id uuid, new_estimate_number text, was_created boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_number text;
  v_item jsonb;
  v_pos bigint;
begin
  if p_creation_key is null then
    raise exception 'Missing creation key';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one line item';
  end if;
  if jsonb_array_length(p_items) > 200 then
    raise exception 'A draft from the assistant can have at most 200 line items';
  end if;

  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null then
    raise exception 'Project not found or not accessible';
  end if;
  if not public.is_org_manager(v_org) then
    raise exception 'Only managers can create estimates';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('estimate_creation:' || p_creation_key::text, 0));
  select e.id, e.estimate_number into v_id, v_number
    from public.estimates e
   where e.organization_id = v_org and e.creation_key = p_creation_key;
  if v_id is not null then
    return query select v_id, v_number, false;
    return;
  end if;

  insert into public.estimates (
    organization_id, project_id, name, description, markup_percent, notes, creation_key, created_by, updated_by
  ) values (
    v_org, p_project, btrim(p_name), nullif(btrim(coalesce(p_description, '')), ''), coalesce(p_markup_percent, 0),
    nullif(btrim(coalesce(p_notes, '')), ''), p_creation_key, auth.uid(), auth.uid()
  )
  returning id, estimate_number into v_id, v_number;

  for v_item, v_pos in select x, o from jsonb_array_elements(p_items) with ordinality as t(x, o) loop
    insert into public.estimate_line_items (
      organization_id, estimate_id, category, description, quantity, unit,
      material_unit_cents, labor_unit_cents, other_unit_cents, is_allowance, notes, sort_order
    ) values (
      v_org, v_id, v_item->>'category', v_item->>'description',
      (v_item->>'quantity')::numeric, v_item->>'unit',
      (v_item->>'material_unit_cents')::bigint, (v_item->>'labor_unit_cents')::bigint,
      (v_item->>'other_unit_cents')::bigint, false,
      nullif(btrim(coalesce(v_item->>'notes', '')), ''), (v_pos * 10)::integer
    );
  end loop;

  return query select v_id, v_number, true;
end;
$$;

revoke execute on function public.create_estimate_draft_with_items(uuid, text, text, numeric, text, jsonb, uuid) from public, anon;
grant execute on function public.create_estimate_draft_with_items(uuid, text, text, numeric, text, jsonb, uuid) to authenticated;
