-- Phase 6 Stage B: change orders. FOR REVIEW — not yet applied.
-- Additive only: three new tables, triggers and RPCs. No existing table, policy or record is modified.
--
-- Semantics:
-- * cost_adjustment_cents is always derived from line items (signed; credits allowed).
-- * price_adjustment_cents is the customer-facing price change, entered explicitly and kept separate.
-- * Lifecycle: draft -> internal_review -> awaiting_homeowner -> approved | rejected; void from any open state.
-- * Financial content is editable only in draft / internal_review. Withdrawing from awaiting_homeowner
--   returns to draft and bumps `version`, so a decision always names the exact version it applies to.
-- * Approval is a staff-recorded decision (same rule as estimates). A completed Dropbox Sign request on the
--   same project may be linked as evidence; it never approves anything by itself.
-- * Access: administrators and project managers with internal project access only. Builder Staff and
--   homeowners have no read policy, so internal costs are never exposed to them.

create table public.change_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  number integer not null check (number > 0),
  co_number text generated always as ('CO-' || lpad(number::text, 3, '0')) stored,
  title text not null check (char_length(btrim(title)) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  reason text check (reason is null or char_length(reason) <= 2000),
  requested_by text check (requested_by is null or char_length(requested_by) <= 160),
  schedule_impact_days integer check (schedule_impact_days is null or schedule_impact_days between -365 and 3650),
  currency text not null default 'USD' check (currency = 'USD'),
  price_adjustment_cents bigint not null default 0 check (price_adjustment_cents between -100000000000000 and 100000000000000),
  cost_adjustment_cents bigint not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'internal_review', 'awaiting_homeowner', 'approved', 'rejected', 'void')),
  version integer not null default 1 check (version > 0),
  review_started_at timestamptz,
  sent_to_homeowner_at timestamptz,
  decision_at timestamptz,
  decision_by_name text check (decision_by_name is null or char_length(decision_by_name) <= 160),
  decision_method text check (decision_method is null or decision_method in
    ('in_person', 'email', 'phone', 'paper_signature', 'electronic_signature', 'other')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  decision_recorded_by uuid references auth.users(id) on delete set null,
  signature_request_id uuid references public.signature_requests(id) on delete restrict,
  approved_snapshot jsonb,
  voided_at timestamptz,
  void_reason text check (void_reason is null or char_length(void_reason) <= 2000),
  voided_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);
create index change_orders_project_idx on public.change_orders (project_id, number desc);
create index change_orders_org_idx on public.change_orders (organization_id, created_at desc);
create trigger change_orders_updated_at before update on public.change_orders
  for each row execute function public.set_updated_at();

create table public.change_order_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  category text not null check (category in (
    'Site Preparation', 'Survey and Engineering', 'Permits', 'Foundation', 'Framing', 'Roofing',
    'Plumbing', 'Electrical', 'HVAC', 'Insulation', 'Drywall', 'Cabinets', 'Countertops', 'Flooring',
    'Painting', 'Appliances', 'Exterior Work', 'Landscaping', 'Management Fees', 'Other')),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  quantity numeric(14,3) not null default 1 check (quantity >= 0 and quantity <= 1000000000),
  unit text not null default 'ea' check (char_length(btrim(unit)) between 1 and 20),
  unit_cost_cents bigint not null default 0 check (unit_cost_cents between -1000000000000 and 1000000000000),
  cost_cents bigint generated always as (round(quantity * unit_cost_cents)::bigint) stored,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index change_order_line_items_co_idx on public.change_order_line_items (change_order_id, sort_order);

create table public.change_order_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  change_order_id uuid not null references public.change_orders(id) on delete cascade,
  version integer not null,
  from_status text,
  to_status text not null,
  note text,
  snapshot jsonb not null,
  actor uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index change_order_events_co_idx on public.change_order_events (change_order_id, created_at desc);

-- ============ SNAPSHOT ============
create or replace function public.change_order_snapshot(p_co public.change_orders)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'co_number', p_co.co_number, 'version', p_co.version, 'title', p_co.title,
    'description', p_co.description, 'reason', p_co.reason, 'requested_by', p_co.requested_by,
    'schedule_impact_days', p_co.schedule_impact_days, 'currency', p_co.currency,
    'cost_adjustment_cents', p_co.cost_adjustment_cents, 'price_adjustment_cents', p_co.price_adjustment_cents,
    'line_items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'category', li.category, 'description', li.description, 'quantity', li.quantity, 'unit', li.unit,
        'unit_cost_cents', li.unit_cost_cents, 'cost_cents', li.cost_cents) order by li.sort_order, li.created_at)
      from public.change_order_line_items li where li.change_order_id = p_co.id), '[]'::jsonb));
$$;
revoke execute on function public.change_order_snapshot(public.change_orders) from public, anon, authenticated;

-- ============ WRITE GUARD ============
create or replace function public.change_orders_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project record;
  v_content_keys text[] := array['title', 'description', 'reason', 'requested_by', 'schedule_impact_days',
                                 'price_adjustment_cents', 'currency'];
  v_sig record;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or old.version > 1 then
      raise exception 'Only never-sent draft change orders can be deleted. Void it instead.';
    end if;
    return old;
  end if;

  select p.id, p.organization_id into v_project from public.projects p where p.id = new.project_id;
  if v_project.id is null or v_project.organization_id <> new.organization_id then
    raise exception 'Project does not belong to this organization';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then raise exception 'New change orders must start as drafts'; end if;
    perform pg_advisory_xact_lock(hashtextextended('change_order_number:' || new.project_id::text, 0));
    select coalesce(max(c.number), 0) + 1 into new.number from public.change_orders c where c.project_id = new.project_id;
    new.version := 1;
    new.review_started_at := null; new.sent_to_homeowner_at := null;
    new.decision_at := null; new.decision_by_name := null; new.decision_method := null;
    new.decision_note := null; new.decision_recorded_by := null; new.signature_request_id := null;
    new.approved_snapshot := null; new.voided_at := null; new.void_reason := null; new.voided_by := null;
    new.cost_adjustment_cents := 0;
    new.title := btrim(new.title);
    return new;
  end if;

  if new.project_id <> old.project_id or new.organization_id <> old.organization_id or new.number <> old.number
     or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'Change order identity fields cannot be changed';
  end if;

  if old.status in ('approved', 'rejected', 'void') then
    raise exception 'This change order is % and can no longer be changed.', old.status;
  end if;

  new.title := btrim(new.title);
  select coalesce(sum(li.cost_cents), 0) into new.cost_adjustment_cents
  from public.change_order_line_items li where li.change_order_id = new.id;

  if old.status = 'awaiting_homeowner' and new.status = 'awaiting_homeowner'
     and (exists (select 1 from unnest(v_content_keys) k where (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k))
       or new.cost_adjustment_cents <> old.cost_adjustment_cents) then
    raise exception 'This change order is with the homeowner. Withdraw it to draft to make changes.';
  end if;

  if new.version <> old.version and not (old.status = 'awaiting_homeowner' and new.status = 'draft' and new.version = old.version + 1) then
    raise exception 'Version changes only when a change order is withdrawn from the homeowner';
  end if;

  if new.status <> old.status then
    if not (
      (old.status = 'draft' and new.status in ('internal_review', 'void'))
      or (old.status = 'internal_review' and new.status in ('draft', 'awaiting_homeowner', 'void'))
      or (old.status = 'awaiting_homeowner' and new.status in ('draft', 'approved', 'rejected', 'void'))
    ) then
      raise exception 'A change order cannot move from % to %', replace(old.status, '_', ' '), replace(new.status, '_', ' ');
    end if;

    if old.status = 'awaiting_homeowner' and new.status = 'draft' and new.version <> old.version + 1 then
      raise exception 'Withdrawing a change order must start a new version';
    end if;

    if new.status = 'internal_review' then new.review_started_at := now(); end if;
    if new.status = 'awaiting_homeowner' then
      if not exists (select 1 from public.change_order_line_items li where li.change_order_id = new.id)
         and new.price_adjustment_cents = 0 and new.schedule_impact_days is null then
        raise exception 'Add a line item, price change or schedule impact before sending to the homeowner';
      end if;
      new.sent_to_homeowner_at := now();
    end if;
    if new.status = 'draft' then
      new.sent_to_homeowner_at := null;
    end if;

    if new.status in ('approved', 'rejected') then
      if coalesce(btrim(new.decision_by_name), '') = '' or new.decision_method is null then
        raise exception 'Record who made the decision and how it was communicated';
      end if;
      new.decision_by_name := btrim(new.decision_by_name);
      new.decision_at := coalesce(new.decision_at, now());
      if new.decision_at > now() + interval '1 day' or new.decision_at < old.sent_to_homeowner_at - interval '1 day' then
        raise exception 'Decision date must be after the change order was sent and not in the future';
      end if;
      new.decision_recorded_by := auth.uid();
      if new.signature_request_id is not null then
        select s.project_id, s.status into v_sig from public.signature_requests s where s.id = new.signature_request_id;
        if v_sig.project_id is distinct from new.project_id or v_sig.status <> 'completed' then
          raise exception 'Linked signature evidence must be a completed signature request on this project';
        end if;
      end if;
      if new.status = 'approved' then
        new.approved_snapshot := public.change_order_snapshot(new);
      end if;
    elsif new.status = 'void' then
      if coalesce(btrim(new.void_reason), '') = '' then raise exception 'Enter a reason for voiding'; end if;
      new.voided_at := now();
      new.voided_by := auth.uid();
    end if;
  end if;

  if new.status not in ('approved', 'rejected') then
    new.decision_at := null; new.decision_by_name := null; new.decision_method := null;
    new.decision_note := null; new.decision_recorded_by := null; new.signature_request_id := null;
    new.approved_snapshot := null;
  end if;
  if new.status <> 'void' then
    new.voided_at := null; new.void_reason := null; new.voided_by := null;
  end if;

  return new;
end;
$$;
create trigger change_orders_before_write before insert or update or delete on public.change_orders
  for each row execute function public.change_orders_before_write();
create trigger audit_change_orders after insert or update or delete on public.change_orders
  for each row execute function public.write_audit_event();

create or replace function public.change_orders_log_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.status <> old.status then
    insert into public.change_order_events (organization_id, change_order_id, version, from_status, to_status, note, snapshot, actor)
    values (new.organization_id, new.id, new.version, case when tg_op = 'UPDATE' then old.status end, new.status,
      case when new.status in ('approved', 'rejected') then new.decision_note when new.status = 'void' then new.void_reason end,
      public.change_order_snapshot(new), auth.uid());
  end if;
  return null;
end;
$$;
create trigger change_orders_log_event after insert or update on public.change_orders
  for each row execute function public.change_orders_log_event();

-- ============ LINE ITEM GUARD + RECALC ============
create or replace function public.change_order_line_items_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.change_order_line_items := coalesce(new, old);
  v_status text;
  v_org uuid;
begin
  select c.status, c.organization_id into v_status, v_org from public.change_orders c where c.id = v_row.change_order_id;
  if v_status is null then return coalesce(new, old); end if;
  if v_status not in ('draft', 'internal_review') then
    raise exception 'Line items are locked because this change order is %.', replace(v_status, '_', ' ');
  end if;
  if tg_op <> 'DELETE' then
    if new.organization_id <> v_org then raise exception 'Line item does not belong to this organization'; end if;
    if tg_op = 'UPDATE' and new.change_order_id <> old.change_order_id then
      raise exception 'Line items cannot be moved between change orders';
    end if;
    new.description := btrim(new.description);
    new.unit := btrim(new.unit);
  end if;
  return coalesce(new, old);
end;
$$;
create trigger change_order_line_items_guard before insert or update or delete on public.change_order_line_items
  for each row execute function public.change_order_line_items_guard();

create or replace function public.change_order_line_items_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.change_orders c set updated_at = now() where c.id = coalesce(new.change_order_id, old.change_order_id);
  return null;
end;
$$;
create trigger change_order_line_items_recalc after insert or update or delete on public.change_order_line_items
  for each row execute function public.change_order_line_items_recalc();

-- ============ RLS (managers with internal project access only) ============
alter table public.change_orders enable row level security;
create policy change_orders_select on public.change_orders for select to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy change_orders_insert on public.change_orders for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy change_orders_update on public.change_orders for update to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy change_orders_delete on public.change_orders for delete to authenticated
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

alter table public.change_order_line_items enable row level security;
create policy change_order_line_items_select on public.change_order_line_items for select to authenticated
  using (exists (select 1 from public.change_orders c where c.id = change_order_id));
create policy change_order_line_items_write on public.change_order_line_items for all to authenticated
  using (exists (select 1 from public.change_orders c where c.id = change_order_id and public.is_org_manager(c.organization_id)))
  with check (exists (select 1 from public.change_orders c where c.id = change_order_id and c.organization_id = change_order_line_items.organization_id
    and public.is_org_manager(c.organization_id)));

alter table public.change_order_events enable row level security;
create policy change_order_events_select on public.change_order_events for select to authenticated
  using (exists (select 1 from public.change_orders c where c.id = change_order_id));
-- No insert/update/delete policies: events are written only by the security-definer trigger.

-- ============ RPCs (security invoker: RLS still applies) ============

-- Saves header + full line set atomically. Creates when p_id is null.
create or replace function public.save_change_order(p_project uuid, p_id uuid, p_header jsonb, p_lines jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid := p_id;
  v_status text;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null or not public.is_org_manager(v_org) then
    raise exception 'Only an administrator or project manager can edit change orders';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 200 then
    raise exception 'Line items are invalid';
  end if;

  if v_id is null then
    insert into public.change_orders (organization_id, project_id, number, title, description, reason, requested_by,
      schedule_impact_days, price_adjustment_cents, created_by, updated_by)
    values (v_org, p_project, 1, p_header->>'title', p_header->>'description', p_header->>'reason', p_header->>'requested_by',
      (p_header->>'schedule_impact_days')::integer, coalesce((p_header->>'price_adjustment_cents')::bigint, 0), auth.uid(), auth.uid())
    returning id into v_id;
  else
    select c.status into v_status from public.change_orders c where c.id = v_id and c.project_id = p_project for update;
    if v_status is null then raise exception 'Change order not found or access denied'; end if;
    if v_status not in ('draft', 'internal_review') then
      raise exception 'Only draft or in-review change orders can be edited';
    end if;
    update public.change_orders c set
      title = p_header->>'title', description = p_header->>'description', reason = p_header->>'reason',
      requested_by = p_header->>'requested_by', schedule_impact_days = (p_header->>'schedule_impact_days')::integer,
      price_adjustment_cents = coalesce((p_header->>'price_adjustment_cents')::bigint, 0), updated_by = auth.uid()
    where c.id = v_id;
    delete from public.change_order_line_items li where li.change_order_id = v_id;
  end if;

  insert into public.change_order_line_items (organization_id, change_order_id, category, description, quantity, unit, unit_cost_cents, sort_order)
  select v_org, v_id, l->>'category', l->>'description', (l->>'quantity')::numeric, l->>'unit', (l->>'unit_cost_cents')::bigint, (ord - 1)::integer
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  return v_id;
end;
$$;
revoke execute on function public.save_change_order(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_change_order(uuid, uuid, jsonb, jsonb) to authenticated;

-- Non-decision transitions. p_expected_version guards against acting on a stale screen.
create or replace function public.transition_change_order(p_id uuid, p_to text, p_expected_version integer, p_note text default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  c public.change_orders;
begin
  select * into c from public.change_orders x where x.id = p_id for update;
  if c.id is null then raise exception 'Change order not found or access denied'; end if;
  if not public.is_org_manager(c.organization_id) then raise exception 'Only an administrator or project manager can do this'; end if;
  if c.version <> p_expected_version then raise exception 'This change order was updated by someone else. Refresh and try again.'; end if;
  if c.status = p_to then return c.id; end if; -- idempotent repeat
  if p_to not in ('draft', 'internal_review', 'awaiting_homeowner', 'void') then raise exception 'Use the decision action to approve or reject'; end if;
  update public.change_orders x set
    status = p_to,
    version = case when c.status = 'awaiting_homeowner' and p_to = 'draft' then c.version + 1 else c.version end,
    void_reason = case when p_to = 'void' then p_note end,
    updated_by = auth.uid()
  where x.id = p_id;
  return p_id;
end;
$$;
revoke execute on function public.transition_change_order(uuid, text, integer, text) from public, anon;
grant execute on function public.transition_change_order(uuid, text, integer, text) to authenticated;

-- Records the homeowner decision once. Repeating the same decision for the same version is a no-op,
-- so concurrent or retried approvals cannot apply a change twice.
create or replace function public.decide_change_order(p_id uuid, p_decision text, p_expected_version integer,
  p_by_name text, p_method text, p_note text default null, p_decision_at timestamptz default null, p_signature_request uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  c public.change_orders;
begin
  if p_decision not in ('approved', 'rejected') then raise exception 'Decision must be approved or rejected'; end if;
  select * into c from public.change_orders x where x.id = p_id for update;
  if c.id is null then raise exception 'Change order not found or access denied'; end if;
  if not public.is_org_manager(c.organization_id) then raise exception 'Only an administrator or project manager can record decisions'; end if;
  if c.version <> p_expected_version then raise exception 'The homeowner was shown a different version. Refresh and try again.'; end if;
  if c.status = p_decision then return c.id; end if;
  if c.status <> 'awaiting_homeowner' then
    raise exception 'Only change orders awaiting the homeowner can be decided (this one is %)', replace(c.status, '_', ' ');
  end if;
  update public.change_orders x set
    status = p_decision, decision_by_name = p_by_name, decision_method = p_method, decision_note = p_note,
    decision_at = p_decision_at, signature_request_id = p_signature_request, updated_by = auth.uid()
  where x.id = p_id;
  return p_id;
end;
$$;
revoke execute on function public.decide_change_order(uuid, text, integer, text, text, text, timestamptz, uuid) from public, anon;
grant execute on function public.decide_change_order(uuid, text, integer, text, text, text, timestamptz, uuid) to authenticated;
