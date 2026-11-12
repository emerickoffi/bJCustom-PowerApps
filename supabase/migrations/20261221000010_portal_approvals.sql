-- Phase 4: homeowner approvals in the client portal.
-- Homeowners approve, reject, or request changes on submitted estimates and change orders.
-- Every decision is an immutable row in approval_decisions written in the same transaction
-- as the document status change, so the record and the state can never disagree.

-- ============ STATUS + METHOD VALUES ============
alter table public.estimates drop constraint if exists estimates_status_check;
alter table public.estimates add constraint estimates_status_check
  check (status in ('draft', 'internal_review', 'submitted', 'approved', 'rejected', 'changes_requested'));

alter table public.estimates drop constraint if exists estimates_decision_method_check;
alter table public.estimates add constraint estimates_decision_method_check
  check (decision_method is null or decision_method in ('in_person', 'email', 'phone', 'paper_signature', 'other', 'homeowner_portal'));

alter table public.change_orders drop constraint if exists change_orders_decision_method_check;
alter table public.change_orders add constraint change_orders_decision_method_check
  check (decision_method is null or decision_method in ('in_person', 'email', 'phone', 'paper_signature', 'electronic_signature', 'other', 'homeowner_portal'));

-- ============ ESTIMATE GUARD (adds changes_requested) ============
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
    if old.status in ('submitted', 'approved', 'rejected', 'changes_requested')
       and (to_jsonb(new) - v_locked_keys) is distinct from (to_jsonb(old) - v_locked_keys) then
      raise exception 'This estimate is locked because it was %. Create a revision to make changes.', replace(old.status, '_', ' ');
    end if;

    if new.status <> old.status then
      if not (
        (old.status = 'draft' and new.status in ('internal_review', 'submitted'))
        or (old.status = 'internal_review' and new.status in ('draft', 'submitted'))
        or (old.status = 'submitted' and new.status in ('approved', 'rejected', 'changes_requested'))
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

      if new.status in ('approved', 'rejected', 'changes_requested') then
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
    elsif old.status in ('submitted', 'approved', 'rejected', 'changes_requested') and (
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

-- Only the portal decision RPC may stamp a decision as made through the homeowner portal.
create or replace function public.portal_decision_method_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.decision_method = 'homeowner_portal'
     and (tg_op = 'INSERT' or old.decision_method is distinct from new.decision_method)
     and coalesce(current_setting('trefort.portal_decision', true), '') <> new.id::text then
    raise exception 'Homeowner portal decisions can only be recorded by the homeowner';
  end if;
  return new;
end;
$$;

drop trigger if exists estimates_portal_method_guard on public.estimates;
create trigger estimates_portal_method_guard before insert or update on public.estimates
  for each row execute function public.portal_decision_method_guard();
drop trigger if exists change_orders_portal_method_guard on public.change_orders;
create trigger change_orders_portal_method_guard before insert or update on public.change_orders
  for each row execute function public.portal_decision_method_guard();

-- ============ IMMUTABLE DECISION RECORD ============
create table if not exists public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  document_type text not null check (document_type in ('estimate', 'change_order')),
  document_id uuid not null,
  document_number text not null,
  document_title text not null,
  revision integer not null check (revision >= 1),
  decision text not null check (decision in ('approved', 'rejected', 'changes_requested')),
  comment text check (comment is null or char_length(comment) <= 2000),
  amount_cents bigint not null,
  schedule_impact_days integer,
  snapshot jsonb not null,
  method text not null default 'homeowner_portal' check (method = 'homeowner_portal'),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_by_name text not null,
  decided_by_email text,
  request_key uuid not null,
  decided_at timestamptz not null default now(),
  unique (document_type, document_id, revision),
  unique (decided_by, request_key)
);
create index if not exists approval_decisions_project_idx on public.approval_decisions (project_id, decided_at desc);
create index if not exists approval_decisions_document_idx on public.approval_decisions (document_type, document_id);

alter table public.approval_decisions enable row level security;
drop policy if exists approval_decisions_select on public.approval_decisions;
create policy approval_decisions_select on public.approval_decisions for select to authenticated
  using (public.can_view_project_internal(project_id) or public.is_project_homeowner(project_id));
revoke insert, update, delete on public.approval_decisions from anon, authenticated;

create or replace function public.approval_decisions_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Approval decisions are permanent records and cannot be changed or deleted';
end;
$$;
drop trigger if exists approval_decisions_immutable on public.approval_decisions;
create trigger approval_decisions_immutable before update or delete on public.approval_decisions
  for each row execute function public.approval_decisions_immutable();

-- ============ NOTIFICATIONS ============
create or replace function public.email_category_for_kind(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'subcontract_quote' then 'quote_requests'
    when p_kind = 'rfi' then 'rfi_activity'
    when p_kind in ('change_order', 'estimate') then 'change_orders'
    when p_kind = 'invoice' then 'billing'
    when p_kind = 'invoice_reminder' then 'invoice_reminders'
    when p_kind = 'signature_request' then 'signatures'
    when p_kind like 'issue%' or p_kind in ('subcontractor_work', 'punch_list') then 'punch_list'
    else 'project_updates'
  end;
$$;

create or replace function public.notify_project_homeowners(
  p_org uuid, p_project uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text, p_action boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_feature_enabled(p_org, 'portal') then return; end if;
  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, client_id, dedupe_key, action_required)
  select p_org, m.user_id, p_title, p_body, p_link, p_kind, p_project, m.client_id, p_dedupe || ':' || m.user_id, p_action
  from public.organization_memberships m
  where m.organization_id = p_org and m.status = 'active' and m.role = 'client'
    and m.client_id in (
      select pc.client_id from public.project_clients pc
      where pc.project_id = p_project and pc.relationship in ('primary_owner', 'co_owner')
      union
      select p.primary_client_id from public.projects p where p.id = p_project and p.primary_client_id is not null)
  on conflict do nothing;
end;
$$;
revoke execute on function public.notify_project_homeowners(uuid, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.estimate_status_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_label text := new.estimate_number || ' Rev ' || new.revision || ' · ' || left(new.name, 120);
  v_staff_link text := '/estimates/' || new.id;
begin
  if new.status is not distinct from old.status then return new; end if;
  begin
    if new.status = 'submitted' and public.is_feature_enabled(new.organization_id, 'estimates') then
      perform public.notify_project_homeowners(new.organization_id, new.project_id, 'estimate',
        'Estimate ready for your review', v_label, '/portal/approvals/estimate/' || new.id,
        'est:' || new.id || ':submitted', true);
    elsif new.decision_method = 'homeowner_portal' and new.status in ('approved', 'rejected', 'changes_requested') then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'estimate',
        case new.status
          when 'approved' then 'Homeowner approved estimate'
          when 'rejected' then 'Homeowner rejected estimate'
          else 'Homeowner requested changes to estimate' end,
        v_label || ' · ' || new.decision_by_name, v_staff_link,
        'est:' || new.id || ':' || new.status, new.status <> 'approved');
    end if;
  exception when others then
    raise warning 'estimate notification skipped for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
drop trigger if exists estimate_status_notify on public.estimates;
create trigger estimate_status_notify after update of status on public.estimates
  for each row execute function public.estimate_status_notify();

create or replace function public.change_order_status_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_link text := '/projects/' || new.project_id || '/change-orders/' || new.id;
  v_label text := new.co_number || ' · ' || left(new.title, 120);
  v_portal boolean := coalesce(current_setting('trefort.portal_decision', true), '') = new.id::text;
  v_by text;
begin
  if new.status is not distinct from old.status then return new; end if;
  begin
    if v_portal then
      v_by := coalesce(new.decision_by_name, current_setting('trefort.portal_decider', true), 'Homeowner');
    end if;
    if new.status = 'internal_review' then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        'Change order ready for internal review', v_label, v_link,
        'co:' || new.id || ':review:' || new.version, true);
    elsif new.status = 'awaiting_homeowner' then
      if public.is_feature_enabled(new.organization_id, 'change_orders') then
        perform public.notify_project_homeowners(new.organization_id, new.project_id, 'change_order',
          'Change order ready for your approval', v_label, '/portal/approvals/change_order/' || new.id,
          'co:' || new.id || ':sent:' || new.version, true);
      end if;
    elsif new.status = 'approved' then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        case when v_portal then 'Homeowner approved change order' else 'Change order approved' end,
        case when v_portal then v_label || ' · ' || v_by else v_label end,
        v_link, 'co:' || new.id || ':approved', false);
    elsif new.status = 'rejected' then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        case when v_portal then 'Homeowner rejected change order' else 'Change order rejected' end,
        case when v_portal then v_label || ' · ' || v_by else v_label end,
        v_link, 'co:' || new.id || ':rejected', true);
    elsif new.status = 'draft' and old.status in ('internal_review', 'awaiting_homeowner') then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        case when v_portal then 'Homeowner requested changes to change order' else 'Change order returned for revision' end,
        case when v_portal then v_label || ' · ' || v_by else v_label end,
        v_link, 'co:' || new.id || ':revision:' || new.version || ':' || old.status, true);
    end if;
  exception when others then
    raise warning 'change order notification skipped for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

-- ============ CONTRACT CONTEXT ============
-- Original contract = most recently approved estimate on the project; approved change orders adjust it.
create or replace function public.project_contract_amounts(p_project uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with base as (
    select e.total_with_land_cents from public.estimates e
    where e.project_id = p_project and e.status = 'approved'
    order by e.decision_at desc nulls last, e.revision desc limit 1
  ), cos as (
    select coalesce(sum(c.price_adjustment_cents), 0)::bigint as total
    from public.change_orders c where c.project_id = p_project and c.status = 'approved'
  )
  select jsonb_build_object(
    'original_cents', (select total_with_land_cents from base),
    'approved_changes_cents', (select total from cos),
    'current_cents', (select total_with_land_cents from base) + (select total from cos));
$$;
revoke execute on function public.project_contract_amounts(uuid) from public, anon, authenticated;

-- ============ PORTAL READ API ============
-- Status a homeowner sees. A submitted estimate with a newer revision is superseded, never actionable.
create or replace function public.portal_approval_items()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then return '[]'::jsonb; end if;

  with projects as (
    select p.id, p.name, p.organization_id,
           public.portal_contact_can(p.id, 'sign') as can_sign
    from public.projects p
    where p.organization_id in (
      select m.organization_id from public.organization_memberships m
      where m.user_id = v_uid and m.status = 'active' and m.role = 'client')
      and public.is_project_homeowner(p.id)
  ), est as (
    select 'estimate'::text as document_type, e.id, e.project_id, pr.name as project_name,
      e.estimate_number || ' Rev ' || e.revision as number, e.name as title, e.revision,
      e.total_with_land_cents as amount_cents, null::integer as schedule_impact_days,
      case
        when e.status = 'submitted' and exists (
          select 1 from public.estimates n where n.family_id = e.family_id and n.revision > e.revision) then 'superseded'
        when e.status = 'submitted' then 'pending'
        else e.status end as status,
      e.submitted_at as sent_at, e.decision_at, e.decision_by_name, e.decision_method, e.decision_note,
      pr.can_sign
    from public.estimates e join projects pr on pr.id = e.project_id
    where e.status in ('submitted', 'approved', 'rejected', 'changes_requested')
      and public.is_feature_enabled(pr.organization_id, 'estimates')
  ), co as (
    select 'change_order'::text, c.id, c.project_id, pr.name, c.co_number, c.title, c.version,
      c.price_adjustment_cents, c.schedule_impact_days,
      case when c.status = 'awaiting_homeowner' then 'pending' else c.status end,
      c.sent_to_homeowner_at, c.decision_at, c.decision_by_name, c.decision_method, c.decision_note,
      pr.can_sign
    from public.change_orders c join projects pr on pr.id = c.project_id
    where c.status in ('awaiting_homeowner', 'approved', 'rejected')
      and public.is_feature_enabled(pr.organization_id, 'change_orders')
  ), co_returned as (
    -- Change orders sent back for changes return to draft; the decision record is the history.
    select 'change_order'::text, d.document_id, d.project_id, pr.name, d.document_number, d.document_title, d.revision,
      d.amount_cents, d.schedule_impact_days, 'changes_requested'::text,
      null::timestamptz, d.decided_at, d.decided_by_name, d.method, d.comment, pr.can_sign
    from public.approval_decisions d join projects pr on pr.id = d.project_id
    where d.document_type = 'change_order' and d.decision = 'changes_requested'
      and public.is_feature_enabled(pr.organization_id, 'change_orders')
  ), all_items as (
    select * from est union all select * from co union all select * from co_returned
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'document_type', a.document_type, 'id', a.id, 'project_id', a.project_id, 'project_name', a.project_name,
      'number', a.number, 'title', a.title, 'revision', a.revision, 'amount_cents', a.amount_cents,
      'schedule_impact_days', a.schedule_impact_days, 'status', a.status, 'sent_at', a.sent_at,
      'decision_at', a.decision_at, 'decision_by_name', a.decision_by_name, 'decision_method', a.decision_method,
      'decision_note', a.decision_note, 'can_decide', a.can_sign and a.status = 'pending')
    order by a.status = 'pending' desc, coalesce(a.decision_at, a.sent_at) desc nulls last), '[]'::jsonb)
  into v_result from all_items a;
  return v_result;
end;
$$;
revoke execute on function public.portal_approval_items() from public, anon;
grant execute on function public.portal_approval_items() to authenticated;

create or replace function public.portal_approval_detail(p_type text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_project uuid;
  v_org uuid;
  v_doc jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_status text;
  v_sig_locked boolean := false;
  v_e public.estimates;
  v_c public.change_orders;
begin
  if auth.uid() is null or p_type not in ('estimate', 'change_order') then return null; end if;

  if p_type = 'estimate' then
    select * into v_e from public.estimates e where e.id = p_id;
    if v_e.id is null or v_e.status not in ('submitted', 'approved', 'rejected', 'changes_requested') then return null; end if;
    v_project := v_e.project_id; v_org := v_e.organization_id;
    if not public.is_project_homeowner(v_project) or not public.is_feature_enabled(v_org, 'estimates') then return null; end if;
    v_status := case
      when v_e.status = 'submitted' and exists (
        select 1 from public.estimates n where n.family_id = v_e.family_id and n.revision > v_e.revision) then 'superseded'
      when v_e.status = 'submitted' then 'pending' else v_e.status end;
    select exists (
      select 1 from public.estimate_signing_snapshots s
      join public.signature_requests r on r.document_id = s.document_id
      where s.estimate_id = v_e.id and r.status in ('awaiting_signatures', 'partially_signed', 'completed'))
      into v_sig_locked;
    select coalesce(jsonb_agg(jsonb_build_object(
        'category', li.category, 'description', li.description, 'quantity', li.quantity, 'unit', li.unit,
        'is_allowance', li.is_allowance, 'notes', li.notes, 'line_total_cents', li.line_total_cents)
      order by li.sort_order, li.created_at), '[]'::jsonb)
      into v_lines from public.estimate_line_items li where li.estimate_id = v_e.id;
    v_doc := jsonb_build_object(
      'document_type', 'estimate', 'id', v_e.id, 'number', v_e.estimate_number || ' Rev ' || v_e.revision,
      'title', v_e.name, 'description', v_e.description, 'revision', v_e.revision,
      'estimate_date', v_e.estimate_date, 'expiration_date', v_e.expiration_date,
      'amount_cents', v_e.total_with_land_cents,
      'totals', jsonb_build_object(
        'direct_cost_cents', v_e.direct_cost_cents, 'allowance_cents', v_e.allowance_cents,
        'markup_cents', v_e.markup_cents, 'contingency_cents', v_e.contingency_cents,
        'construction_total_cents', v_e.construction_total_cents, 'land_cost_cents', v_e.land_cost_cents,
        'total_with_land_cents', v_e.total_with_land_cents),
      'sent_at', v_e.submitted_at, 'decision_at', v_e.decision_at, 'decision_by_name', v_e.decision_by_name,
      'decision_method', v_e.decision_method, 'decision_note', v_e.decision_note);
  else
    select * into v_c from public.change_orders c where c.id = p_id;
    if v_c.id is null or v_c.status not in ('awaiting_homeowner', 'approved', 'rejected', 'draft', 'internal_review') then return null; end if;
    v_project := v_c.project_id; v_org := v_c.organization_id;
    if not public.is_project_homeowner(v_project) or not public.is_feature_enabled(v_org, 'change_orders') then return null; end if;
    -- A change order being revised is only visible through its earlier decision record.
    if v_c.status in ('draft', 'internal_review') and not exists (
      select 1 from public.approval_decisions d where d.document_type = 'change_order' and d.document_id = v_c.id) then
      return null;
    end if;
    v_status := case
      when v_c.status = 'awaiting_homeowner' then 'pending'
      when v_c.status in ('draft', 'internal_review') then 'in_revision'
      else v_c.status end;
    v_doc := jsonb_build_object(
      'document_type', 'change_order', 'id', v_c.id, 'number', v_c.co_number, 'title', v_c.title,
      'description', v_c.description, 'reason', v_c.reason, 'revision', v_c.version,
      'amount_cents', v_c.price_adjustment_cents, 'schedule_impact_days', v_c.schedule_impact_days,
      'sent_at', v_c.sent_to_homeowner_at, 'decision_at', v_c.decision_at, 'decision_by_name', v_c.decision_by_name,
      'decision_method', v_c.decision_method, 'decision_note', v_c.decision_note,
      'contract', public.project_contract_amounts(v_project));
  end if;

  return v_doc || jsonb_build_object(
    'project_id', v_project,
    'project_name', (select p.name from public.projects p where p.id = v_project),
    'status', v_status,
    'lines', v_lines,
    'signature_in_progress', v_sig_locked,
    'can_sign', public.portal_contact_can(v_project, 'sign'),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
          'decision', d.decision, 'revision', d.revision, 'comment', d.comment,
          'decided_by_name', d.decided_by_name, 'decided_at', d.decided_at, 'amount_cents', d.amount_cents)
        order by d.decided_at desc)
      from public.approval_decisions d where d.document_type = p_type and d.document_id = p_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.portal_approval_detail(text, uuid) from public, anon;
grant execute on function public.portal_approval_detail(text, uuid) to authenticated;

-- ============ PORTAL DECISION ============
create or replace function public.portal_decide_approval(
  p_type text, p_id uuid, p_revision integer, p_decision text, p_comment text,
  p_expected_amount_cents bigint, p_acknowledged boolean, p_request_key uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_existing public.approval_decisions;
  v_e public.estimates;
  v_c public.change_orders;
  v_project uuid;
  v_org uuid;
  v_number text;
  v_title text;
  v_amount bigint;
  v_schedule integer;
  v_snapshot jsonb;
  v_name text;
  v_email text;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to record a decision'; end if;
  if p_type not in ('estimate', 'change_order') then raise exception 'Unknown document type'; end if;
  if p_decision not in ('approved', 'rejected', 'changes_requested') then raise exception 'Unknown decision'; end if;
  if p_request_key is null then raise exception 'Missing request key'; end if;
  if v_comment is not null and char_length(v_comment) > 2000 then raise exception 'Comments are limited to 2,000 characters'; end if;
  if p_decision = 'changes_requested' and v_comment is null then
    raise exception 'Describe the changes you would like so your builder can revise it';
  end if;
  if p_decision = 'approved' and not coalesce(p_acknowledged, false) then
    raise exception 'Confirm that you have reviewed and accept this document before approving';
  end if;

  -- A replayed submission (double click, retried request) returns the original result.
  select * into v_existing from public.approval_decisions d where d.decided_by = v_uid and d.request_key = p_request_key;
  if v_existing.id is not null then
    if v_existing.document_id <> p_id or v_existing.decision <> p_decision then
      raise exception 'This request was already used for a different decision';
    end if;
    return jsonb_build_object('id', v_existing.id, 'decision', v_existing.decision, 'replayed', true);
  end if;

  if p_type = 'estimate' then
    select * into v_e from public.estimates e where e.id = p_id for update;
    if v_e.id is null then raise exception 'Document not found'; end if;
    v_project := v_e.project_id; v_org := v_e.organization_id;
  else
    select * into v_c from public.change_orders c where c.id = p_id for update;
    if v_c.id is null then raise exception 'Document not found'; end if;
    v_project := v_c.project_id; v_org := v_c.organization_id;
  end if;

  if not public.is_project_homeowner(v_project) then raise exception 'Document not found'; end if;
  if not public.is_feature_enabled(v_org, case p_type when 'estimate' then 'estimates' else 'change_orders' end) then
    raise exception 'Approvals for this document type are turned off';
  end if;
  if not public.portal_contact_can(v_project, 'sign') then
    raise exception 'Your portal access does not include approving documents. Contact your builder.';
  end if;

  if p_type = 'estimate' then
    if v_e.status <> 'submitted' then
      raise exception 'This estimate has already been decided or withdrawn. Refresh to see its current status.';
    end if;
    if v_e.revision <> p_revision or exists (
      select 1 from public.estimates n where n.family_id = v_e.family_id and n.revision > v_e.revision) then
      raise exception 'A newer revision of this estimate is available. Refresh to review the latest version.';
    end if;
    if exists (
      select 1 from public.estimate_signing_snapshots s
      join public.signature_requests r on r.document_id = s.document_id
      where s.estimate_id = v_e.id and r.status in ('awaiting_signatures', 'partially_signed', 'completed')) then
      raise exception 'This estimate is being signed electronically. Complete or decline the signature request instead.';
    end if;
    v_number := v_e.estimate_number || ' Rev ' || v_e.revision;
    v_title := v_e.name; v_amount := v_e.total_with_land_cents; v_schedule := null;
    select jsonb_build_object(
        'estimate_number', v_e.estimate_number, 'revision', v_e.revision, 'name', v_e.name,
        'construction_total_cents', v_e.construction_total_cents, 'land_cost_cents', v_e.land_cost_cents,
        'total_with_land_cents', v_e.total_with_land_cents, 'submitted_at', v_e.submitted_at,
        'lines', coalesce(jsonb_agg(jsonb_build_object('description', li.description, 'quantity', li.quantity,
          'unit', li.unit, 'is_allowance', li.is_allowance, 'line_total_cents', li.line_total_cents)
          order by li.sort_order, li.created_at) filter (where li.id is not null), '[]'::jsonb))
      into v_snapshot
      from (select 1) one left join public.estimate_line_items li on li.estimate_id = v_e.id;
  else
    if v_c.status <> 'awaiting_homeowner' then
      raise exception 'This change order has already been decided or withdrawn. Refresh to see its current status.';
    end if;
    if v_c.version <> p_revision then
      raise exception 'This change order was updated. Refresh to review the latest version.';
    end if;
    v_number := v_c.co_number; v_title := v_c.title;
    v_amount := v_c.price_adjustment_cents; v_schedule := v_c.schedule_impact_days;
    v_snapshot := jsonb_build_object(
      'co_number', v_c.co_number, 'version', v_c.version, 'title', v_c.title, 'description', v_c.description,
      'reason', v_c.reason, 'price_adjustment_cents', v_c.price_adjustment_cents,
      'schedule_impact_days', v_c.schedule_impact_days, 'sent_to_homeowner_at', v_c.sent_to_homeowner_at,
      'contract', public.project_contract_amounts(v_project));
  end if;

  if p_expected_amount_cents is distinct from v_amount then
    raise exception 'The amount on this document changed since you opened it. Refresh to review the latest version.';
  end if;

  select nullif(btrim(pf.full_name), ''), coalesce(pf.email, u.email) into v_name, v_email
  from auth.users u left join public.profiles pf on pf.id = u.id where u.id = v_uid;
  v_name := left(coalesce(v_name, v_email, 'Homeowner'), 200);

  begin
    insert into public.approval_decisions (organization_id, project_id, document_type, document_id, document_number,
      document_title, revision, decision, comment, amount_cents, schedule_impact_days, snapshot,
      decided_by, decided_by_name, decided_by_email, request_key)
    values (v_org, v_project, p_type, p_id, v_number, v_title, p_revision, p_decision, v_comment, v_amount, v_schedule,
      v_snapshot, v_uid, v_name, v_email, p_request_key)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'A decision was already recorded for this version. Refresh to see its current status.';
  end;

  perform set_config('trefort.portal_decision', p_id::text, true);
  perform set_config('trefort.portal_decider', v_name, true);

  if p_type = 'estimate' then
    update public.estimates set status = p_decision, decision_by_name = v_name, decision_method = 'homeowner_portal',
      decision_note = v_comment, decision_at = now()
    where id = p_id;
  elsif p_decision = 'changes_requested' then
    update public.change_orders set status = 'draft', version = version + 1 where id = p_id;
  else
    update public.change_orders set status = p_decision, decision_by_name = v_name, decision_method = 'homeowner_portal',
      decision_note = v_comment, decision_at = now()
    where id = p_id;
  end if;

  perform set_config('trefort.portal_decision', '', true);
  perform set_config('trefort.portal_decider', '', true);

  return jsonb_build_object('id', v_id, 'decision', p_decision, 'replayed', false);
end;
$$;
revoke execute on function public.portal_decide_approval(text, uuid, integer, text, text, bigint, boolean, uuid) from public, anon;
grant execute on function public.portal_decide_approval(text, uuid, integer, text, text, bigint, boolean, uuid) to authenticated;
