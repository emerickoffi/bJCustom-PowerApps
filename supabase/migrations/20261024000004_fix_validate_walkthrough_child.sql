-- walkthrough_items has no item_id column, so read it dynamically only for tables that do.
create or replace function public.validate_walkthrough_child()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_item uuid;
begin
  if not exists (select 1 from public.walkthroughs w where w.id = new.walkthrough_id and w.organization_id = new.organization_id) then
    raise exception 'Walkthrough does not belong to this organization';
  end if;
  if tg_table_name in ('walkthrough_attachments', 'walkthrough_responses') then
    v_item := (to_jsonb(new) ->> 'item_id')::uuid;
    if not exists (
      select 1 from public.walkthrough_items i where i.id = v_item and i.walkthrough_id = new.walkthrough_id
    ) then
      raise exception 'Checklist item does not belong to this walkthrough';
    end if;
  end if;
  return new;
end;
$$;
