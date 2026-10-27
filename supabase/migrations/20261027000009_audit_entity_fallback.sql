-- organization_features has a composite key and no id column, so audit rows failed the entity_id not-null
-- constraint and every feature toggle was rejected. Fall back to the organization id as the audited entity.
create or replace function public.write_audit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fields text[];
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  if tg_op = 'UPDATE' then
    select array_agg(n.key) into v_fields
    from jsonb_each(to_jsonb(new)) n
    join jsonb_each(to_jsonb(old)) o on o.key = n.key
    where n.value is distinct from o.value and n.key not in ('updated_at');
    if v_fields is null then return new; end if;
  end if;
  if tg_table_name = 'organization_features' then
    v_fields := array_append(coalesce(v_fields, '{}'), 'feature:' || (v_row ->> 'feature_key'));
  end if;
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, changed_fields)
  values (
    coalesce((v_row ->> 'organization_id')::uuid, case when tg_table_name = 'organizations' then (v_row ->> 'id')::uuid end),
    auth.uid(), tg_table_name, coalesce((v_row ->> 'id')::uuid, (v_row ->> 'organization_id')::uuid), lower(tg_op), v_fields
  );
  return coalesce(new, old);
end;
$$;
