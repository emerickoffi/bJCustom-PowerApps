-- Selections & allowances: builder-managed choices that homeowners pick in the portal,
-- reviewed by the builder, and routed through a change order when the price differs
-- from the allowance. Status changes only happen inside the RPCs below.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.selection_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 60),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create unique index if not exists selection_categories_org_name_key
  on public.selection_categories (organization_id, lower(btrim(name)));

create table if not exists public.selections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  category text not null check (char_length(btrim(category)) between 2 and 60),
  description text check (description is null or char_length(description) <= 4000),
  location text check (location is null or char_length(location) <= 160),
  notes text check (notes is null or char_length(notes) <= 4000),
  internal_notes text check (internal_notes is null or char_length(internal_notes) <= 4000),
  allowance_cents bigint check (allowance_cents is null or (allowance_cents >= 0 and allowance_cents <= 100000000000000)),
  estimate_line_item_id uuid references public.estimate_line_items(id) on delete set null,
  cost_code text check (cost_code is null or char_length(cost_code) <= 40),
  due_date date,
  status text not null default 'draft' check (status in (
    'draft', 'awaiting_homeowner', 'awaiting_builder_review', 'change_order_required', 'approved', 'rejected', 'canceled')),
  revision integer not null default 1 check (revision > 0),
  version integer not null default 1 check (version > 0),
  selected_option_id uuid,
  selected_price_cents bigint,
  selected_at timestamptz,
  selected_by uuid references auth.users(id) on delete set null,
  selected_by_name text check (selected_by_name is null or char_length(selected_by_name) <= 160),
  homeowner_comment text check (homeowner_comment is null or char_length(homeowner_comment) <= 2000),
  sent_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists selections_project_idx on public.selections (project_id, status);
create index if not exists selections_due_idx on public.selections (due_date) where status = 'awaiting_homeowner';

create table if not exists public.selection_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  selection_id uuid not null references public.selections(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  description text check (description is null or char_length(description) <= 2000),
  supplier text check (supplier is null or char_length(supplier) <= 160),
  model_number text check (model_number is null or char_length(model_number) <= 120),
  price_cents bigint not null check (price_cents >= 0 and price_cents <= 100000000000000),
  internal_cost_cents bigint check (internal_cost_cents is null or (internal_cost_cents >= 0 and internal_cost_cents <= 100000000000000)),
  availability text check (availability is null or char_length(availability) <= 160),
  photo_path text check (photo_path is null or char_length(photo_path) <= 500),
  spec_path text check (spec_path is null or char_length(spec_path) <= 500),
  spec_name text check (spec_name is null or char_length(spec_name) <= 200),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists selection_options_selection_idx on public.selection_options (selection_id, sort_order);

do $$ begin
  alter table public.selections
    add constraint selections_selected_option_fkey
    foreign key (selected_option_id) references public.selection_options(id) on delete restrict;
exception when duplicate_object then null; end $$;

create table if not exists public.selection_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  selection_id uuid not null references public.selections(id) on delete cascade,
  event text not null check (char_length(event) <= 60),
  from_status text,
  to_status text,
  revision integer not null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text,
  actor_kind text not null check (actor_kind in ('staff', 'homeowner', 'system')),
  note text check (note is null or char_length(note) <= 2000),
  internal boolean not null default false,
  snapshot jsonb,
  request_key uuid unique,
  created_at timestamptz not null default now()
);
create index if not exists selection_events_selection_idx on public.selection_events (selection_id, created_at);

alter table public.change_orders add column if not exists selection_id uuid references public.selections(id) on delete set null;
alter table public.change_orders add column if not exists selection_revision integer;
create unique index if not exists change_orders_one_active_per_selection_revision
  on public.change_orders (selection_id, selection_revision)
  where selection_id is not null and status not in ('void', 'rejected');

-- ---------------------------------------------------------------------------
-- RLS: staff with financial access (managers on the project) read and edit directly.
-- Homeowners never read these tables; they go through the portal RPCs, which omit
-- internal notes and vendor costs.
-- ---------------------------------------------------------------------------

alter table public.selection_categories enable row level security;
alter table public.selections enable row level security;
alter table public.selection_options enable row level security;
alter table public.selection_events enable row level security;

drop policy if exists selection_categories_select on public.selection_categories;
create policy selection_categories_select on public.selection_categories for select using (public.is_org_staff(organization_id));
drop policy if exists selection_categories_insert on public.selection_categories;
create policy selection_categories_insert on public.selection_categories for insert with check (public.is_org_manager(organization_id));
drop policy if exists selection_categories_delete on public.selection_categories;
create policy selection_categories_delete on public.selection_categories for delete using (public.is_org_manager(organization_id));

drop policy if exists selections_select on public.selections;
create policy selections_select on public.selections for select
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists selections_insert on public.selections;
create policy selections_insert on public.selections for insert
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists selections_update on public.selections;
create policy selections_update on public.selections for update
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists selections_delete on public.selections;
create policy selections_delete on public.selections for delete
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

drop policy if exists selection_options_all on public.selection_options;
create policy selection_options_all on public.selection_options for all
  using (exists (select 1 from public.selections s where s.id = selection_id
                 and public.is_org_manager(s.organization_id) and public.can_view_project_internal(s.project_id)))
  with check (exists (select 1 from public.selections s where s.id = selection_id and s.organization_id = selection_options.organization_id
                 and public.is_org_manager(s.organization_id) and public.can_view_project_internal(s.project_id)));

drop policy if exists selection_events_select on public.selection_events;
create policy selection_events_select on public.selection_events for select
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

-- ---------------------------------------------------------------------------
-- Write guards
-- ---------------------------------------------------------------------------

create or replace function public.selections_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_rpc boolean := coalesce(current_setting('app.selection_rpc', true), '') = 'on';
  v_content text[] := array['name', 'category', 'description', 'location', 'notes', 'allowance_cents',
                            'estimate_line_item_id', 'cost_code'];
  v_workflow text[] := array['status', 'revision', 'version', 'selected_option_id', 'selected_price_cents',
                             'selected_at', 'selected_by', 'selected_by_name', 'homeowner_comment',
                             'sent_at', 'decided_at', 'decided_by'];
begin
  if tg_op = 'DELETE' then
    -- Project or organization deletion cascades here; only direct deletes are restricted.
    if pg_trigger_depth() > 1 then return old; end if;
    if old.status <> 'draft' or old.sent_at is not null then
      raise exception 'Only never-sent draft selections can be deleted. Cancel it instead.';
    end if;
    return old;
  end if;

  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  new.name := btrim(new.name);
  new.category := btrim(new.category);

  if new.estimate_line_item_id is not null and not exists (
    select 1 from public.estimate_line_items li join public.estimates e on e.id = li.estimate_id
    where li.id = new.estimate_line_item_id and e.project_id = new.project_id) then
    raise exception 'The linked estimate line is not part of this project';
  end if;

  if tg_op = 'INSERT' then
    new.status := 'draft'; new.revision := 1; new.version := 1;
    new.selected_option_id := null; new.selected_price_cents := null; new.selected_at := null;
    new.selected_by := null; new.selected_by_name := null; new.homeowner_comment := null;
    new.sent_at := null; new.decided_at := null; new.decided_by := null;
    return new;
  end if;

  if new.project_id <> old.project_id or new.organization_id <> old.organization_id
     or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'Selection identity fields cannot be changed';
  end if;

  if not v_rpc and exists (select 1 from unnest(v_workflow) k where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k)) then
    raise exception 'Selection status can only change through the selection workflow';
  end if;

  if old.status in ('approved', 'rejected', 'canceled') and not v_rpc
     and (exists (select 1 from unnest(v_content) k where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k))
          or new.due_date is distinct from old.due_date) then
    raise exception 'This selection is % and can no longer be edited.', old.status;
  end if;

  if old.status <> 'draft' and exists (select 1 from unnest(v_content) k where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k)) then
    raise exception 'Recall this selection to draft before changing its details or allowance.';
  end if;

  return new;
end;
$$;

drop trigger if exists selections_before_write on public.selections;
create trigger selections_before_write before insert or update or delete on public.selections
  for each row execute function public.selections_before_write();
drop trigger if exists selections_updated_at on public.selections;
create trigger selections_updated_at before update on public.selections
  for each row execute function public.set_updated_at();

create or replace function public.selection_options_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_sel record; v_row record;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
  v_row := case when tg_op = 'DELETE' then old else new end;
  select s.status, s.organization_id, s.selected_option_id into v_sel from public.selections s where s.id = v_row.selection_id;
  if v_sel.organization_id is null or v_sel.organization_id <> v_row.organization_id then
    raise exception 'Selection does not belong to this organization';
  end if;
  if tg_op = 'UPDATE' and new.selection_id <> old.selection_id then
    raise exception 'Options cannot move between selections';
  end if;
  if v_sel.status <> 'draft' then
    raise exception 'Recall this selection to draft before changing its options.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  new.name := btrim(new.name);
  return new;
end;
$$;

drop trigger if exists selection_options_before_write on public.selection_options;
create trigger selection_options_before_write before insert or update or delete on public.selection_options
  for each row execute function public.selection_options_before_write();
drop trigger if exists selection_options_updated_at on public.selection_options;
create trigger selection_options_updated_at before update on public.selection_options
  for each row execute function public.set_updated_at();

drop trigger if exists audit_selections on public.selections;
create trigger audit_selections after insert or update or delete on public.selections
  for each row execute function public.write_audit_event();

-- ---------------------------------------------------------------------------
-- Money: what still has to go through a change order for the current choice.
-- Already-approved change orders linked to this selection are subtracted so a
-- revision never double-counts an earlier upgrade.
-- ---------------------------------------------------------------------------

create or replace function public.selection_amounts(p_selection uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with s as (select * from public.selections where id = p_selection),
  approved as (
    select coalesce(sum(c.price_adjustment_cents), 0)::bigint as total
    from public.change_orders c where c.selection_id = p_selection and c.status = 'approved'
  )
  select jsonb_build_object(
    'allowance_cents', s.allowance_cents,
    'selected_price_cents', s.selected_price_cents,
    'difference_cents', case when s.allowance_cents is null or s.selected_price_cents is null then null
                             else s.selected_price_cents - s.allowance_cents end,
    'approved_change_orders_cents', approved.total,
    'change_order_needed_cents', case when s.allowance_cents is null or s.selected_price_cents is null then 0
                                      else s.selected_price_cents - s.allowance_cents - approved.total end)
  from s, approved;
$$;
revoke execute on function public.selection_amounts(uuid) from public, anon;

create or replace function public.selection_actor_name()
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), u.email, 'Unknown user')
  from auth.users u where u.id = auth.uid();
$$;
revoke execute on function public.selection_actor_name() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Staff workflow
-- ---------------------------------------------------------------------------

create or replace function public.selection_transition(
  p_selection uuid, p_action text, p_expected_version integer, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.selections%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_to text;
  v_from text;
  v_amounts jsonb;
  v_needed bigint;
  v_active_co uuid;
  v_link text;
  v_portal_link text;
begin
  select * into s from public.selections where id = p_selection for update;
  if s.id is null or not (public.is_org_manager(s.organization_id) and public.can_view_project_internal(s.project_id)) then
    raise exception 'Selection not found';
  end if;
  if not public.is_feature_enabled(s.organization_id, 'estimates') then raise exception 'Selections are not enabled'; end if;
  if s.version <> p_expected_version then
    raise exception 'STALE: This selection changed since you opened it. Refresh to see the latest version.';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then raise exception 'Notes must be 2000 characters or fewer'; end if;

  v_amounts := public.selection_amounts(s.id);
  v_needed := (v_amounts ->> 'change_order_needed_cents')::bigint;
  select c.id into v_active_co from public.change_orders c
    where c.selection_id = s.id and c.selection_revision = s.revision and c.status not in ('void', 'rejected', 'approved') limit 1;
  v_link := '/projects/' || s.project_id || '/selections/' || s.id;
  v_portal_link := '/portal/selections/' || s.id;

  if p_action = 'send' then
    if s.status <> 'draft' then raise exception 'Only draft selections can be sent'; end if;
    if not exists (select 1 from public.selection_options o where o.selection_id = s.id) then
      raise exception 'Add at least one option before sending this selection';
    end if;
    v_to := 'awaiting_homeowner';
  elsif p_action = 'recall' then
    if s.status <> 'awaiting_homeowner' then raise exception 'Only selections waiting on the homeowner can be recalled'; end if;
    v_to := 'draft';
  elsif p_action = 'approve' then
    if s.status = 'awaiting_builder_review' then
      if v_needed <> 0 then raise exception 'This choice differs from the allowance. Require a change order instead.'; end if;
    elsif s.status = 'change_order_required' then
      if not exists (select 1 from public.change_orders c where c.selection_id = s.id and c.selection_revision = s.revision and c.status = 'approved') then
        raise exception 'The change order for this selection has not been approved yet';
      end if;
    else
      raise exception 'This selection is not ready for approval';
    end if;
    v_to := 'approved';
  elsif p_action = 'require_change_order' then
    if s.status <> 'awaiting_builder_review' then raise exception 'Only selections in builder review can require a change order'; end if;
    v_to := 'change_order_required';
  elsif p_action in ('request_clarification', 'return_revision') then
    if s.status not in ('awaiting_builder_review', 'change_order_required') then raise exception 'This selection is not in review'; end if;
    if v_note is null then raise exception 'Add a note so the homeowner knows what to change'; end if;
    if v_active_co is not null then raise exception 'Void the linked change order before sending this back to the homeowner'; end if;
    v_to := 'awaiting_homeowner';
  elsif p_action = 'reopen' then
    if s.status <> 'approved' then raise exception 'Only approved selections can be reopened'; end if;
    if v_note is null then raise exception 'Add a reason for reopening this selection'; end if;
    v_to := 'awaiting_homeowner';
  elsif p_action = 'reject' then
    if s.status not in ('awaiting_builder_review', 'change_order_required') then raise exception 'This selection is not in review'; end if;
    if v_note is null then raise exception 'Add a reason for rejecting this selection'; end if;
    if v_active_co is not null then raise exception 'Void the linked change order first'; end if;
    v_to := 'rejected';
  elsif p_action = 'cancel' then
    if s.status in ('approved', 'rejected', 'canceled') then raise exception 'This selection can no longer be canceled'; end if;
    if v_active_co is not null then raise exception 'Void the linked change order first'; end if;
    v_to := 'canceled';
  else
    raise exception 'Unknown selection action';
  end if;

  v_from := s.status;
  perform set_config('app.selection_rpc', 'on', true);
  update public.selections set
    status = v_to,
    version = version + 1,
    revision = case when p_action in ('return_revision', 'reopen') then revision + 1 else revision end,
    sent_at = case when p_action = 'send' then now() else sent_at end,
    decided_at = case when v_to in ('approved', 'rejected', 'canceled') then now() else null end,
    decided_by = case when v_to in ('approved', 'rejected', 'canceled') then auth.uid() else null end,
    selected_option_id = case when p_action in ('return_revision', 'reopen') then null else selected_option_id end,
    selected_price_cents = case when p_action in ('return_revision', 'reopen') then null else selected_price_cents end,
    selected_at = case when p_action in ('return_revision', 'reopen') then null else selected_at end,
    selected_by = case when p_action in ('return_revision', 'reopen') then null else selected_by end,
    selected_by_name = case when p_action in ('return_revision', 'reopen') then null else selected_by_name end,
    homeowner_comment = case when p_action in ('return_revision', 'reopen') then null else homeowner_comment end
  where id = s.id
  returning * into s;
  perform set_config('app.selection_rpc', 'off', true);

  insert into public.selection_events (organization_id, project_id, selection_id, event, from_status, to_status, revision,
    actor_id, actor_name, actor_kind, note, internal, snapshot)
  values (s.organization_id, s.project_id, s.id, p_action, v_from, v_to, s.revision,
    auth.uid(), public.selection_actor_name(), 'staff', v_note,
    p_action in ('recall', 'require_change_order'),
    v_amounts || jsonb_build_object('selected_option_id', s.selected_option_id));

  if p_action = 'send' then
    perform public.notify_project_homeowners(s.organization_id, s.project_id, 'selection',
      'Selection ready: ' || s.name,
      case when s.due_date is null then 'Your builder shared options for you to choose from.'
           else 'Please choose by ' || to_char(s.due_date, 'Mon FMDD, YYYY') || '.' end,
      v_portal_link, 'selection-sent:' || s.id || ':' || s.version, true);
  elsif p_action in ('request_clarification', 'return_revision', 'reopen') then
    perform public.notify_project_homeowners(s.organization_id, s.project_id, 'selection',
      'Your builder needs more on: ' || s.name, left(v_note, 240), v_portal_link, 'selection-back:' || s.id || ':' || s.version, true);
  elsif p_action = 'approve' then
    perform public.notify_project_homeowners(s.organization_id, s.project_id, 'selection',
      'Selection approved: ' || s.name, 'Your builder confirmed this selection.', v_portal_link, 'selection-approved:' || s.id || ':' || s.version, false);
  elsif p_action = 'reject' then
    perform public.notify_project_homeowners(s.organization_id, s.project_id, 'selection',
      'Selection not approved: ' || s.name, left(v_note, 240), v_portal_link, 'selection-rejected:' || s.id || ':' || s.version, false);
  end if;

  return jsonb_build_object('id', s.id, 'status', s.status, 'version', s.version, 'revision', s.revision);
end;
$$;
revoke execute on function public.selection_transition(uuid, text, integer, text) from public, anon;
grant execute on function public.selection_transition(uuid, text, integer, text) to authenticated;

create or replace function public.selection_events_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'Selection history cannot be changed'; end;
$$;
drop trigger if exists selection_events_immutable on public.selection_events;
create trigger selection_events_immutable before update or delete on public.selection_events
  for each row when (pg_trigger_depth() < 1) execute function public.selection_events_immutable();

create or replace function public.selection_create_change_order(p_selection uuid, p_expected_version integer)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.selections%rowtype;
  v_existing uuid;
  v_id uuid;
  v_option record;
  v_needed bigint;
begin
  select * into s from public.selections where id = p_selection for update;
  if s.id is null or not (public.is_org_manager(s.organization_id) and public.can_view_project_internal(s.project_id)) then
    raise exception 'Selection not found';
  end if;
  if not public.is_feature_enabled(s.organization_id, 'change_orders') then raise exception 'Change orders are not enabled'; end if;
  if s.status <> 'change_order_required' then raise exception 'This selection does not require a change order'; end if;

  select c.id into v_existing from public.change_orders c
  where c.selection_id = s.id and c.selection_revision = s.revision and c.status not in ('void', 'rejected') limit 1;
  if v_existing is not null then return v_existing; end if;

  if s.version <> p_expected_version then
    raise exception 'STALE: This selection changed since you opened it. Refresh to see the latest version.';
  end if;

  select o.name, o.supplier, o.model_number into v_option from public.selection_options o where o.id = s.selected_option_id;
  v_needed := (public.selection_amounts(s.id) ->> 'change_order_needed_cents')::bigint;

  insert into public.change_orders (organization_id, project_id, title, description, reason, requested_by,
    price_adjustment_cents, selection_id, selection_revision, created_by)
  values (s.organization_id, s.project_id,
    left('Selection: ' || s.name, 160),
    left(concat_ws(E'\n',
      'Homeowner selected ' || coalesce(v_option.name, 'an option') || coalesce(' (' || nullif(concat_ws(' ', v_option.supplier, v_option.model_number), '') || ')', '') || '.',
      'Selected price: $' || to_char(s.selected_price_cents / 100.0, 'FM999,999,999,990.00'),
      case when s.allowance_cents is not null then 'Allowance: $' || to_char(s.allowance_cents / 100.0, 'FM999,999,999,990.00') end), 4000),
    'Homeowner selection differs from the allowance',
    'Homeowner selection',
    v_needed, s.id, s.revision, auth.uid())
  returning id into v_id;

  insert into public.selection_events (organization_id, project_id, selection_id, event, from_status, to_status, revision,
    actor_id, actor_name, actor_kind, internal, snapshot)
  values (s.organization_id, s.project_id, s.id, 'change_order_created', s.status, s.status, s.revision,
    auth.uid(), public.selection_actor_name(), 'staff', true, jsonb_build_object('change_order_id', v_id, 'amount_cents', v_needed));

  return v_id;
end;
$$;
revoke execute on function public.selection_create_change_order(uuid, integer) from public, anon;
grant execute on function public.selection_create_change_order(uuid, integer) to authenticated;

-- When a linked change order is decided, record it on the selection and tell the team.
create or replace function public.selection_change_order_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if new.selection_id is null or new.status is not distinct from old.status
     or new.status not in ('approved', 'rejected', 'void') then
    return new;
  end if;
  select id, organization_id, project_id, name, status, revision into s from public.selections where id = new.selection_id;
  if s.id is null then return new; end if;
  insert into public.selection_events (organization_id, project_id, selection_id, event, from_status, to_status, revision,
    actor_kind, internal, snapshot)
  values (s.organization_id, s.project_id, s.id, 'change_order_' || new.status, s.status, s.status, s.revision,
    'system', false, jsonb_build_object('change_order_id', new.id, 'amount_cents', new.price_adjustment_cents));
  if new.status = 'approved' and s.status = 'change_order_required' and new.selection_revision = s.revision then
    perform public.notify_project_staff(s.organization_id, s.project_id, 'selection',
      'Ready to finalize: ' || s.name, 'The change order for this selection was approved.',
      '/projects/' || s.project_id || '/selections/' || s.id, 'selection-co-approved:' || new.id, true);
  end if;
  return new;
end;
$$;
drop trigger if exists change_orders_selection_notify on public.change_orders;
create trigger change_orders_selection_notify after update of status on public.change_orders
  for each row execute function public.selection_change_order_notify();

-- Record creation in history.
create or replace function public.selections_after_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.selection_events (organization_id, project_id, selection_id, event, from_status, to_status, revision,
    actor_id, actor_name, actor_kind, internal)
  values (new.organization_id, new.project_id, new.id, 'created', null, 'draft', 1,
    auth.uid(), public.selection_actor_name(), 'staff', true);
  return new;
end;
$$;
drop trigger if exists selections_after_insert on public.selections;
create trigger selections_after_insert after insert on public.selections
  for each row execute function public.selections_after_insert();

-- ---------------------------------------------------------------------------
-- Homeowner portal
-- ---------------------------------------------------------------------------

create or replace function public.portal_selection_list()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'project_id', s.project_id, 'project_name', p.name, 'name', s.name, 'category', s.category,
    'location', s.location, 'due_date', s.due_date, 'status', s.status, 'allowance_cents', s.allowance_cents,
    'selected_option_name', o.name, 'selected_price_cents', s.selected_price_cents, 'updated_at', s.updated_at)
    order by (s.status = 'awaiting_homeowner') desc, s.due_date asc nulls last, s.updated_at desc), '[]'::jsonb)
  from public.selections s
  join public.projects p on p.id = s.project_id
  left join public.selection_options o on o.id = s.selected_option_id
  where s.status <> 'draft'
    and public.is_project_homeowner(s.project_id)
    and public.portal_contact_can(s.project_id, 'portal')
    and public.is_feature_enabled(s.organization_id, 'estimates');
$$;
revoke execute on function public.portal_selection_list() from public, anon;
grant execute on function public.portal_selection_list() to authenticated;

create or replace function public.portal_selection_detail(p_selection uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare s public.selections%rowtype; v_project text;
begin
  select * into s from public.selections where id = p_selection;
  if s.id is null or s.status = 'draft' or not public.is_project_homeowner(s.project_id)
     or not public.portal_contact_can(s.project_id, 'portal')
     or not public.is_feature_enabled(s.organization_id, 'estimates') then
    return null;
  end if;
  select name into v_project from public.projects where id = s.project_id;
  return jsonb_build_object(
    'id', s.id, 'project_id', s.project_id, 'project_name', v_project, 'name', s.name, 'category', s.category,
    'description', s.description, 'location', s.location, 'notes', s.notes, 'allowance_cents', s.allowance_cents,
    'due_date', s.due_date, 'status', s.status, 'revision', s.revision, 'version', s.version,
    'selected_option_id', s.selected_option_id, 'selected_price_cents', s.selected_price_cents,
    'selected_at', s.selected_at, 'selected_by_name', s.selected_by_name, 'homeowner_comment', s.homeowner_comment,
    'can_decide', public.portal_contact_can(s.project_id, 'sign'),
    'options', coalesce((select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', o.name, 'description', o.description, 'supplier', o.supplier, 'model_number', o.model_number,
        'price_cents', o.price_cents, 'availability', o.availability, 'photo_path', o.photo_path,
        'spec_path', o.spec_path, 'spec_name', o.spec_name) order by o.sort_order, o.created_at)
      from public.selection_options o where o.selection_id = s.id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'event', e.event, 'to_status', e.to_status, 'actor_name', e.actor_name, 'actor_kind', e.actor_kind,
        'note', e.note, 'created_at', e.created_at) order by e.created_at desc)
      from public.selection_events e where e.selection_id = s.id and not e.internal), '[]'::jsonb));
end;
$$;
revoke execute on function public.portal_selection_detail(uuid) from public, anon;
grant execute on function public.portal_selection_detail(uuid) to authenticated;

create or replace function public.portal_choose_selection_option(
  p_selection uuid, p_option uuid, p_expected_version integer, p_request_key uuid, p_comment text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  s public.selections%rowtype;
  o public.selection_options%rowtype;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_name text;
  v_prior record;
begin
  if auth.uid() is null then raise exception 'Sign in to continue'; end if;

  select e.selection_id, e.snapshot into v_prior from public.selection_events e where e.request_key = p_request_key;
  if v_prior.selection_id is not null then
    if v_prior.selection_id <> p_selection then raise exception 'Request key already used'; end if;
    select * into s from public.selections where id = p_selection;
    return jsonb_build_object('id', s.id, 'status', s.status, 'version', s.version, 'replayed', true);
  end if;

  select * into s from public.selections where id = p_selection for update;
  if s.id is null or s.status = 'draft' or not public.is_project_homeowner(s.project_id)
     or not public.is_feature_enabled(s.organization_id, 'estimates') then
    raise exception 'Selection not found';
  end if;
  if not public.portal_contact_can(s.project_id, 'sign') then
    raise exception 'Your portal access does not include making decisions. Contact your builder.';
  end if;
  if s.status <> 'awaiting_homeowner' then raise exception 'This selection is no longer waiting on your choice'; end if;
  if s.version <> p_expected_version then
    raise exception 'STALE: Your builder updated this selection. Refresh to see the latest options.';
  end if;
  if v_comment is not null and char_length(v_comment) > 2000 then raise exception 'Comments must be 2000 characters or fewer'; end if;

  select * into o from public.selection_options where id = p_option and selection_id = s.id;
  if o.id is null then raise exception 'That option is no longer available'; end if;

  v_name := public.selection_actor_name();
  perform set_config('app.selection_rpc', 'on', true);
  update public.selections set
    status = 'awaiting_builder_review', version = version + 1,
    selected_option_id = o.id, selected_price_cents = o.price_cents, selected_at = now(),
    selected_by = auth.uid(), selected_by_name = v_name, homeowner_comment = v_comment
  where id = s.id returning * into s;
  perform set_config('app.selection_rpc', 'off', true);

  insert into public.selection_events (organization_id, project_id, selection_id, event, from_status, to_status, revision,
    actor_id, actor_name, actor_kind, note, internal, snapshot, request_key)
  values (s.organization_id, s.project_id, s.id, 'homeowner_selected', 'awaiting_homeowner', 'awaiting_builder_review', s.revision,
    auth.uid(), v_name, 'homeowner', v_comment, false,
    jsonb_build_object('option_id', o.id, 'option_name', o.name, 'price_cents', o.price_cents,
                       'allowance_cents', s.allowance_cents, 'supplier', o.supplier, 'model_number', o.model_number),
    p_request_key);

  perform public.notify_project_staff(s.organization_id, s.project_id, 'selection',
    'Homeowner chose: ' || s.name, o.name || coalesce(' — "' || left(v_comment, 160) || '"', ''),
    '/projects/' || s.project_id || '/selections/' || s.id, 'selection-chosen:' || s.id || ':' || s.version, true);

  return jsonb_build_object('id', s.id, 'status', s.status, 'version', s.version, 'replayed', false);
end;
$$;
revoke execute on function public.portal_choose_selection_option(uuid, uuid, integer, uuid, text) from public, anon;
grant execute on function public.portal_choose_selection_option(uuid, uuid, integer, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Deadline reminders (3 days before, on the day, and once when overdue).
-- ---------------------------------------------------------------------------

create or replace function public.run_selection_reminders()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_today date := (now() at time zone 'America/Chicago')::date;
  r record;
  v_count integer := 0;
  v_bucket text;
begin
  for r in
    select s.id, s.organization_id, s.project_id, s.name, s.due_date from public.selections s
    where s.status = 'awaiting_homeowner' and s.due_date is not null and s.due_date <= v_today + 3
      and public.is_feature_enabled(s.organization_id, 'estimates')
  loop
    v_bucket := case when r.due_date = v_today + 3 then 'soon' when r.due_date = v_today then 'today'
                     when r.due_date < v_today then 'overdue' else null end;
    continue when v_bucket is null;
    perform public.notify_project_homeowners(r.organization_id, r.project_id, 'selection',
      case v_bucket when 'soon' then 'Selection due in 3 days: ' when 'today' then 'Selection due today: ' else 'Selection overdue: ' end || r.name,
      'Please make your choice in the homeowner portal so work stays on schedule.',
      '/portal/selections/' || r.id, 'selection-reminder:' || r.id || ':' || r.due_date || ':' || v_bucket, true);
    if v_bucket = 'overdue' then
      perform public.notify_project_staff(r.organization_id, r.project_id, 'selection',
        'Overdue selection: ' || r.name, 'The homeowner has not chosen yet. Due ' || to_char(r.due_date, 'Mon FMDD') || '.',
        '/projects/' || r.project_id || '/selections/' || r.id, 'selection-overdue-staff:' || r.id || ':' || r.due_date, true);
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.run_selection_reminders() from public, anon, authenticated;

do $$ begin
  perform cron.unschedule('selection_reminders_daily');
exception when others then null; end $$;
select cron.schedule('selection_reminders_daily', '30 13 * * *', 'select public.run_selection_reminders()');
