-- Phase 4: punch list item numbers, locations, and safe bulk issue updates.
-- Item numbers are hierarchical identifiers ("1", "1.1", "10.5"), stored as validated text
-- with a generated integer[] sort key for natural ordering. Never floating point.

alter table public.walkthrough_items
  add column if not exists item_number text,
  add column if not exists location text;

alter table public.walkthrough_items
  drop constraint if exists walkthrough_items_item_number_format,
  add constraint walkthrough_items_item_number_format
    check (item_number ~ '^[1-9][0-9]{0,3}(\.[0-9]{1,4}){0,3}$'),
  drop constraint if exists walkthrough_items_location_length,
  add constraint walkthrough_items_location_length
    check (location is null or char_length(location) <= 120);

-- Backfill existing items in their current display order so historical ordering is preserved.
update public.walkthrough_items i
set item_number = n.num::text
from (
  select id, row_number() over (partition by walkthrough_id order by sort_order, created_at, id) as num
  from public.walkthrough_items
) n
where n.id = i.id and i.item_number is null;

alter table public.walkthrough_items alter column item_number set not null;

alter table public.walkthrough_items
  add column if not exists item_number_sort integer[]
    generated always as (
      case when item_number ~ '^[1-9][0-9]{0,3}(\.[0-9]{1,4}){0,3}$'
        then string_to_array(item_number, '.')::integer[] end
    ) stored;

create unique index if not exists walkthrough_items_number_key
  on public.walkthrough_items (walkthrough_id, item_number);
create index if not exists walkthrough_items_number_sort_idx
  on public.walkthrough_items (walkthrough_id, item_number_sort);

-- Numbers and labels become part of the homeowner's record once the walkthrough is submitted.
create or replace function public.guard_walkthrough_item_identity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if (new.item_number is distinct from old.item_number
      or new.label is distinct from old.label
      or new.category is distinct from old.category)
     and exists (select 1 from public.walkthroughs w where w.id = old.walkthrough_id and w.status = 'submitted') then
    raise exception 'Item numbers and labels cannot change after the walkthrough is submitted';
  end if;
  return new;
end;
$$;

drop trigger if exists walkthrough_items_identity_guard on public.walkthrough_items;
create trigger walkthrough_items_identity_guard
  before update on public.walkthrough_items
  for each row execute function public.guard_walkthrough_item_identity();

-- Accept optional item_number and location. Missing numbers are assigned sequentially after
-- the highest top-level number supplied, so manual and automatic numbers never collide.
create or replace function public.create_walkthrough(
  p_project uuid, p_title text, p_type text, p_scheduled date, p_instructions text, p_items jsonb
)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_next integer;
  v_dupe text;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null then raise exception 'Project not found or access denied'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A walkthrough needs at least one checklist item';
  end if;

  insert into public.walkthroughs (organization_id, project_id, title, walkthrough_type, scheduled_date, instructions, created_by)
    values (v_org, p_project, btrim(p_title), p_type, p_scheduled, nullif(btrim(p_instructions), ''), auth.uid())
    returning id into v_id;

  select coalesce(max(split_part(btrim(x ->> 'item_number'), '.', 1)::integer), 0) into v_next
    from jsonb_array_elements(p_items) x
    where coalesce(btrim(x ->> 'item_number'), '') ~ '^[1-9][0-9]{0,3}(\.[0-9]{1,4}){0,3}$';

  select n into v_dupe
    from (select nullif(btrim(coalesce(x ->> 'item_number', '')), '') n from jsonb_array_elements(p_items) x) s
    where n is not null group by n having count(*) > 1 limit 1;
  if v_dupe is not null then
    raise exception 'Item number % is used more than once', v_dupe;
  end if;

  insert into public.walkthrough_items (organization_id, walkthrough_id, category, label, location, item_number, sort_order)
    select v_org, v_id, s.category, s.label, s.location,
           coalesce(s.manual, (v_next + row_number() over (partition by s.manual is null order by s.ord))::text),
           (s.ord - 1)::integer
    from (
      select btrim(x ->> 'category') as category,
             btrim(x ->> 'label') as label,
             nullif(btrim(coalesce(x ->> 'location', '')), '') as location,
             nullif(btrim(coalesce(x ->> 'item_number', '')), '') as manual,
             ord
      from jsonb_array_elements(p_items) with ordinality as t(x, ord)
    ) s;

  return v_id;
end;
$$;

-- Bulk issue updates. SECURITY INVOKER: RLS (project_issues_update) and guard_project_issue
-- still apply to every row, and record_issue_events writes history for each change.
-- p_items: [{ "id": uuid, "updated_at": timestamptz }] for optimistic concurrency.
-- p_changes: any of status, priority, due_date, responsible_user_id (null clears).
-- p_atomic: true = all-or-nothing; false = per-item results.
create or replace function public.bulk_update_issues(p_items jsonb, p_changes jsonb, p_atomic boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path to ''
as $$
declare
  v_item jsonb;
  v_id uuid;
  v_expected timestamptz;
  v_results jsonb := '[]'::jsonb;
  v_failed integer := 0;
  v_row record;
  v_err text;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Select at least one issue';
  end if;
  if jsonb_array_length(p_items) > 500 then
    raise exception 'Bulk updates are limited to 500 issues at a time';
  end if;
  if p_changes is null or p_changes = '{}'::jsonb
     or exists (select 1 from jsonb_object_keys(p_changes) k where k not in ('status', 'priority', 'due_date', 'responsible_user_id')) then
    raise exception 'Unsupported bulk change';
  end if;
  if p_changes ? 'status' and p_changes ->> 'status' not in ('open', 'in_progress', 'resolved') then
    raise exception 'That status cannot be set in bulk';
  end if;
  if p_changes ? 'priority' and p_changes ->> 'priority' not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid priority';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_id := (v_item ->> 'id')::uuid;
    v_expected := nullif(v_item ->> 'updated_at', '')::timestamptz;
    begin
      select id, updated_at, status into v_row from public.project_issues where id = v_id for update nowait;
      if v_row.id is null then
        raise exception 'Issue not found or you do not have access' using errcode = 'P0002';
      end if;
      if v_expected is not null and date_trunc('milliseconds', v_row.updated_at) <> date_trunc('milliseconds', v_expected) then
        raise exception 'Changed by someone else since you loaded the list. Refresh and try again.' using errcode = '40001';
      end if;

      update public.project_issues set
        status = case when p_changes ? 'status' then (p_changes ->> 'status')::public.issue_status else status end,
        priority = case when p_changes ? 'priority' then p_changes ->> 'priority' else priority end,
        due_date = case when p_changes ? 'due_date' then nullif(p_changes ->> 'due_date', '')::date else due_date end,
        responsible_user_id = case when p_changes ? 'responsible_user_id' then nullif(p_changes ->> 'responsible_user_id', '')::uuid else responsible_user_id end
      where id = v_id
      returning updated_at into v_row.updated_at;
      if not found then
        raise exception 'You do not have permission to update this issue' using errcode = '42501';
      end if;

      v_results := v_results || jsonb_build_object('id', v_id, 'ok', true, 'updated_at', v_row.updated_at);
    exception
      when lock_not_available then
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'error', 'Someone else is saving this issue right now. Try again.');
      when others then
        get stacked diagnostics v_err = message_text;
        v_failed := v_failed + 1;
        v_results := v_results || jsonb_build_object('id', v_id, 'ok', false, 'error', v_err);
    end;
  end loop;

  if p_atomic and v_failed > 0 then
    raise exception 'BULK_ROLLBACK:%', v_results::text;
  end if;
  return v_results;
end;
$$;

revoke all on function public.bulk_update_issues(jsonb, jsonb, boolean) from public, anon;
grant execute on function public.bulk_update_issues(jsonb, jsonb, boolean) to authenticated;
