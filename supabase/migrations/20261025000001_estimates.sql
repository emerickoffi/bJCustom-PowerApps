-- Estimates module. Totals are always derived in the database from line items, so
-- a client can never write a total directly. Submitted, approved and rejected
-- estimates are locked; changes require a new revision in the same family.

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  family_id uuid not null,
  revision integer not null default 1 check (revision > 0),
  revised_from_id uuid references public.estimates(id) on delete set null,
  estimate_number text not null default '' check (char_length(estimate_number) <= 40),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 4000),
  estimate_date date not null default current_date,
  expiration_date date,
  status text not null default 'draft'
    check (status in ('draft', 'internal_review', 'submitted', 'approved', 'rejected')),
  markup_percent numeric(6,3) not null default 0 check (markup_percent between 0 and 100),
  contingency_percent numeric(6,3) not null default 0 check (contingency_percent between 0 and 100),
  land_cost_cents bigint check (land_cost_cents is null or land_cost_cents between 0 and 100000000000000),
  notes text check (notes is null or char_length(notes) <= 5000),
  is_demo boolean not null default false,
  material_cents bigint not null default 0,
  labor_cents bigint not null default 0,
  other_cents bigint not null default 0,
  allowance_cents bigint not null default 0,
  direct_cost_cents bigint not null default 0,
  markup_cents bigint not null default 0,
  contingency_cents bigint not null default 0,
  construction_total_cents bigint not null default 0,
  total_with_land_cents bigint not null default 0,
  submitted_at timestamptz,
  decision_at timestamptz,
  decision_by_name text check (decision_by_name is null or char_length(decision_by_name) <= 160),
  decision_method text check (decision_method is null or decision_method in ('in_person', 'email', 'phone', 'paper_signature', 'other')),
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  decision_recorded_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, revision),
  unique (organization_id, estimate_number, revision),
  check (expiration_date is null or expiration_date >= estimate_date)
);
create index estimates_org_idx on public.estimates (organization_id, created_at desc);
create index estimates_project_idx on public.estimates (project_id, created_at desc);
create index estimates_family_idx on public.estimates (family_id, revision desc);
create trigger estimates_updated_at before update on public.estimates
  for each row execute function public.set_updated_at();

create table public.estimate_line_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  estimate_id uuid not null references public.estimates(id) on delete cascade,
  category text not null check (category in (
    'Site Preparation', 'Survey and Engineering', 'Permits', 'Foundation', 'Framing', 'Roofing',
    'Plumbing', 'Electrical', 'HVAC', 'Insulation', 'Drywall', 'Cabinets', 'Countertops', 'Flooring',
    'Painting', 'Appliances', 'Exterior Work', 'Landscaping', 'Management Fees', 'Other')),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  quantity numeric(14,3) not null default 1 check (quantity >= 0 and quantity <= 1000000000),
  unit text not null default 'ea' check (char_length(btrim(unit)) between 1 and 20),
  material_unit_cents bigint not null default 0 check (material_unit_cents between 0 and 1000000000000),
  labor_unit_cents bigint not null default 0 check (labor_unit_cents between 0 and 1000000000000),
  other_unit_cents bigint not null default 0 check (other_unit_cents between 0 and 1000000000000),
  is_allowance boolean not null default false,
  sort_order integer not null default 0,
  notes text check (notes is null or char_length(notes) <= 1000),
  material_total_cents bigint generated always as (round(quantity * material_unit_cents)::bigint) stored,
  labor_total_cents bigint generated always as (round(quantity * labor_unit_cents)::bigint) stored,
  other_total_cents bigint generated always as (round(quantity * other_unit_cents)::bigint) stored,
  line_total_cents bigint generated always as (
    round(quantity * material_unit_cents)::bigint
    + round(quantity * labor_unit_cents)::bigint
    + round(quantity * other_unit_cents)::bigint
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index estimate_line_items_estimate_idx on public.estimate_line_items (estimate_id, sort_order);
create trigger estimate_line_items_updated_at before update on public.estimate_line_items
  for each row execute function public.set_updated_at();

-- ============ ESTIMATE WRITE GUARD + DERIVED TOTALS ============
create or replace function public.estimates_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_project record;
  v_next integer;
  v_locked_keys text[] := array['status', 'decision_at', 'decision_by_name', 'decision_method', 'decision_note',
                                'decision_recorded_by', 'submitted_at', 'updated_at', 'updated_by'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft estimates can be deleted';
    end if;
    return old;
  end if;

  select p.id, p.organization_id, p.primary_client_id into v_project
  from public.projects p where p.id = new.project_id;
  if v_project.id is null or v_project.organization_id <> new.organization_id then
    raise exception 'Project does not belong to this organization';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'New estimates must start as drafts';
    end if;
    new.family_id := coalesce(new.family_id, new.id);
    new.client_id := coalesce(new.client_id, v_project.primary_client_id);
    new.submitted_at := null;
    new.decision_at := null;
    new.decision_by_name := null;
    new.decision_method := null;
    new.decision_note := null;
    new.decision_recorded_by := null;
    if new.revised_from_id is null and coalesce(btrim(new.estimate_number), '') = '' then
      perform pg_advisory_xact_lock(hashtextextended('estimate_number:' || new.organization_id::text, 0));
      select coalesce(max(substring(e.estimate_number from '^EST-(\d+)$')::integer), 0) + 1 into v_next
      from public.estimates e where e.organization_id = new.organization_id;
      new.estimate_number := 'EST-' || lpad(v_next::text, 4, '0');
    end if;
  else
    if new.project_id <> old.project_id or new.organization_id <> old.organization_id
       or new.family_id <> old.family_id or new.revision <> old.revision
       or new.estimate_number <> old.estimate_number
       or new.revised_from_id is distinct from old.revised_from_id then
      raise exception 'Estimate identity fields cannot be changed';
    end if;
  end if;

  if new.client_id is not null and not exists (
    select 1 from public.clients c where c.id = new.client_id and c.organization_id = new.organization_id
  ) then
    raise exception 'Client does not belong to this organization';
  end if;

  new.name := btrim(new.name);
  new.estimate_number := btrim(new.estimate_number);
  if new.estimate_number = '' then
    raise exception 'Estimate number is required';
  end if;

  -- Derived totals: always recomputed from line items, never trusted from input.
  select
    coalesce(sum(li.material_total_cents) filter (where not li.is_allowance), 0),
    coalesce(sum(li.labor_total_cents) filter (where not li.is_allowance), 0),
    coalesce(sum(li.other_total_cents) filter (where not li.is_allowance), 0),
    coalesce(sum(li.line_total_cents) filter (where li.is_allowance), 0)
  into new.material_cents, new.labor_cents, new.other_cents, new.allowance_cents
  from public.estimate_line_items li where li.estimate_id = new.id;
  new.direct_cost_cents := new.material_cents + new.labor_cents + new.other_cents;
  new.markup_cents := round(new.direct_cost_cents * new.markup_percent / 100)::bigint;
  new.contingency_cents := round((new.direct_cost_cents + new.allowance_cents + new.markup_cents) * new.contingency_percent / 100)::bigint;
  new.construction_total_cents := new.direct_cost_cents + new.allowance_cents + new.markup_cents + new.contingency_cents;
  new.total_with_land_cents := new.construction_total_cents + coalesce(new.land_cost_cents, 0);

  if tg_op = 'UPDATE' then
    if old.status in ('submitted', 'approved', 'rejected')
       and (to_jsonb(new) - v_locked_keys) is distinct from (to_jsonb(old) - v_locked_keys) then
      raise exception 'This estimate is locked because it was %. Create a revision to make changes.', replace(old.status, '_', ' ');
    end if;

    if new.status <> old.status then
      if not (
        (old.status = 'draft' and new.status in ('internal_review', 'submitted'))
        or (old.status = 'internal_review' and new.status in ('draft', 'submitted'))
        or (old.status = 'submitted' and new.status in ('approved', 'rejected'))
      ) then
        raise exception 'An estimate cannot move from % to %', replace(old.status, '_', ' '), replace(new.status, '_', ' ');
      end if;

      if exists (select 1 from public.estimates e where e.family_id = new.family_id and e.revision > new.revision) then
        raise exception 'A newer revision of this estimate exists. Work on the latest revision instead.';
      end if;

      if new.status = 'submitted' then
        if not exists (select 1 from public.estimate_line_items li where li.estimate_id = new.id) then
          raise exception 'Add at least one line item before submitting';
        end if;
        new.submitted_at := now();
      end if;

      if new.status in ('approved', 'rejected') then
        if coalesce(btrim(new.decision_by_name), '') = '' or new.decision_method is null then
          raise exception 'Record who made the decision and how it was communicated';
        end if;
        new.decision_by_name := btrim(new.decision_by_name);
        new.decision_at := coalesce(new.decision_at, now());
        if new.decision_at > now() + interval '1 day' then
          raise exception 'Decision date cannot be in the future';
        end if;
        new.decision_recorded_by := auth.uid();
      end if;
    elsif old.status in ('submitted', 'approved', 'rejected') and (
      new.decision_at is distinct from old.decision_at or new.decision_by_name is distinct from old.decision_by_name
      or new.decision_method is distinct from old.decision_method or new.decision_note is distinct from old.decision_note
      or new.submitted_at is distinct from old.submitted_at
    ) then
      raise exception 'Recorded decisions cannot be changed';
    end if;
  end if;

  return new;
end;
$$;
create trigger estimates_before_write before insert or update or delete on public.estimates
  for each row execute function public.estimates_before_write();
create trigger audit_estimates after insert or update or delete on public.estimates
  for each row execute function public.write_audit_event();

-- ============ LINE ITEM GUARD + RECALC ============
create or replace function public.estimate_line_items_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_row public.estimate_line_items := coalesce(new, old);
  v_status text;
  v_org uuid;
begin
  select e.status, e.organization_id into v_status, v_org from public.estimates e where e.id = v_row.estimate_id;
  if v_status is null then
    -- Parent is being deleted (cascade from a draft); nothing to guard.
    return coalesce(new, old);
  end if;
  if v_status not in ('draft', 'internal_review') then
    raise exception 'Line items are locked because this estimate is %. Create a revision to make changes.', replace(v_status, '_', ' ');
  end if;
  if tg_op <> 'DELETE' then
    if new.organization_id <> v_org then
      raise exception 'Line item does not belong to this organization';
    end if;
    if tg_op = 'UPDATE' and new.estimate_id <> old.estimate_id then
      raise exception 'Line items cannot be moved between estimates';
    end if;
    new.description := btrim(new.description);
    new.unit := btrim(new.unit);
  end if;
  return coalesce(new, old);
end;
$$;
create trigger estimate_line_items_guard before insert or update or delete on public.estimate_line_items
  for each row execute function public.estimate_line_items_guard();

create or replace function public.estimate_line_items_recalc()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.estimates e set updated_at = now()
   where e.id = coalesce(new.estimate_id, old.estimate_id);
  return null;
end;
$$;
create trigger estimate_line_items_recalc after insert or update or delete on public.estimate_line_items
  for each row execute function public.estimate_line_items_recalc();

-- ============ RLS ============
alter table public.estimates enable row level security;
create policy estimates_select on public.estimates for select to authenticated
  using (public.can_view_project_internal(project_id));
create policy estimates_insert on public.estimates for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy estimates_update on public.estimates for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
create policy estimates_delete on public.estimates for delete to authenticated
  using (public.is_org_manager(organization_id));

alter table public.estimate_line_items enable row level security;
create policy estimate_line_items_select on public.estimate_line_items for select to authenticated
  using (exists (select 1 from public.estimates e where e.id = estimate_id));
create policy estimate_line_items_insert on public.estimate_line_items for insert to authenticated
  with check (public.is_org_manager(organization_id));
create policy estimate_line_items_update on public.estimate_line_items for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
create policy estimate_line_items_delete on public.estimate_line_items for delete to authenticated
  using (public.is_org_manager(organization_id));

-- ============ REVISION + DUPLICATE ============
create or replace function public.copy_estimate_line_items(p_from uuid, p_to uuid)
returns void language sql security invoker set search_path = '' as $$
  insert into public.estimate_line_items (organization_id, estimate_id, category, description, quantity, unit,
    material_unit_cents, labor_unit_cents, other_unit_cents, is_allowance, sort_order, notes)
  select li.organization_id, p_to, li.category, li.description, li.quantity, li.unit,
    li.material_unit_cents, li.labor_unit_cents, li.other_unit_cents, li.is_allowance, li.sort_order, li.notes
  from public.estimate_line_items li where li.estimate_id = p_from order by li.sort_order, li.created_at;
$$;
revoke execute on function public.copy_estimate_line_items(uuid, uuid) from public, anon, authenticated;

create or replace function public.create_estimate_revision(p_estimate uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  s public.estimates;
  v_id uuid;
  v_rev integer;
begin
  select * into s from public.estimates e where e.id = p_estimate;
  if s.id is null then raise exception 'Estimate not found or access denied'; end if;
  if not public.is_org_manager(s.organization_id) then
    raise exception 'Only an administrator or project manager can revise estimates';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('estimate_family:' || s.family_id::text, 0));
  if exists (select 1 from public.estimates e where e.family_id = s.family_id and e.revision > s.revision) then
    raise exception 'A newer revision already exists. Revise the latest revision instead.';
  end if;
  if exists (select 1 from public.estimates e where e.family_id = s.family_id and e.status in ('draft', 'internal_review')) then
    raise exception 'This estimate already has an open draft revision.';
  end if;
  v_rev := s.revision + 1;
  insert into public.estimates (organization_id, project_id, client_id, family_id, revision, revised_from_id,
    estimate_number, name, description, estimate_date, expiration_date, markup_percent, contingency_percent,
    land_cost_cents, notes, is_demo, created_by, updated_by)
  values (s.organization_id, s.project_id, s.client_id, s.family_id, v_rev, s.id,
    s.estimate_number, s.name, s.description, current_date,
    case when s.expiration_date is not null and s.expiration_date >= current_date then s.expiration_date end,
    s.markup_percent, s.contingency_percent, s.land_cost_cents, s.notes, s.is_demo, auth.uid(), auth.uid())
  returning id into v_id;
  perform public.copy_estimate_line_items(s.id, v_id);
  return v_id;
end;
$$;
revoke execute on function public.create_estimate_revision(uuid) from public, anon;
grant execute on function public.create_estimate_revision(uuid) to authenticated;

create or replace function public.duplicate_estimate(p_estimate uuid, p_project uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  s public.estimates;
  v_project uuid;
  v_id uuid;
begin
  select * into s from public.estimates e where e.id = p_estimate;
  if s.id is null then raise exception 'Estimate not found or access denied'; end if;
  if not public.is_org_manager(s.organization_id) then
    raise exception 'Only an administrator or project manager can duplicate estimates';
  end if;
  v_project := coalesce(p_project, s.project_id);
  insert into public.estimates (organization_id, project_id, name, description, estimate_date,
    markup_percent, contingency_percent, land_cost_cents, notes, is_demo, created_by, updated_by)
  values (s.organization_id, v_project, left('Copy of ' || s.name, 160), s.description, current_date,
    s.markup_percent, s.contingency_percent,
    case when v_project = s.project_id then s.land_cost_cents end,
    s.notes, s.is_demo, auth.uid(), auth.uid())
  returning id into v_id;
  perform public.copy_estimate_line_items(s.id, v_id);
  return v_id;
end;
$$;
revoke execute on function public.duplicate_estimate(uuid, uuid) from public, anon;
grant execute on function public.duplicate_estimate(uuid, uuid) to authenticated;
