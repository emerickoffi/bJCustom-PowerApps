-- Estimate-to-proposal workflow.
--
-- A proposal is the customer-facing presentation of one estimate revision. The estimate stays the only
-- financial source of truth: proposals hold narrative content and presentation choices, never prices.
-- Proposal content is editable only while its estimate is editable (draft / internal review); once the
-- estimate is sent to the homeowner both are frozen, and changes require a new estimate revision, which
-- carries the proposal content forward.
--
-- Customer-facing prices are derived server-side by allocating the estimate's markup and contingency
-- onto line items, so builder unit costs, markup and contingency percentages, and internal notes are
-- never sent to homeowners or written into approval snapshots.

-- ============ TEMPLATES ============
create table public.proposal_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  pricing_display text not null default 'category' check (pricing_display in ('category', 'detailed', 'total')),
  introduction text check (introduction is null or char_length(introduction) <= 5000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 10000),
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 5000),
  terms text check (terms is null or char_length(terms) <= 20000),
  acceptance_text text check (acceptance_text is null or char_length(acceptance_text) <= 2000),
  is_default boolean not null default false,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index proposal_templates_one_default on public.proposal_templates (organization_id)
  where is_default and archived_at is null;
create index proposal_templates_org_idx on public.proposal_templates (organization_id, name);
create trigger proposal_templates_updated_at before update on public.proposal_templates
  for each row execute function public.set_updated_at();
create trigger proposal_templates_audit after insert or update or delete on public.proposal_templates
  for each row execute function public.write_audit_event();

create or replace function public.proposal_templates_before_write()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.organization_id <> old.organization_id then
    raise exception 'Template cannot move to another organization';
  end if;
  if new.archived_at is not null then new.is_default := false; end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger proposal_templates_before_write before insert or update on public.proposal_templates
  for each row execute function public.proposal_templates_before_write();

alter table public.proposal_templates enable row level security;
create policy proposal_templates_feature_gate on public.proposal_templates as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'estimates'))
  with check (public.is_feature_enabled(organization_id, 'estimates'));
create policy proposal_templates_select on public.proposal_templates for select to authenticated
  using (public.is_org_staff(organization_id));
create policy proposal_templates_insert on public.proposal_templates for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy proposal_templates_update on public.proposal_templates for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
-- No delete policy: templates are archived so past proposals keep a resolvable template reference.

-- ============ PER-ESTIMATE PROPOSAL CONTENT ============
create table public.estimate_proposals (
  id uuid primary key default gen_random_uuid(),
  estimate_id uuid not null unique references public.estimates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid references public.proposal_templates(id) on delete set null,
  title text check (title is null or char_length(btrim(title)) between 1 and 200),
  pricing_display text not null default 'category' check (pricing_display in ('category', 'detailed', 'total')),
  show_scope boolean not null default true,
  introduction text check (introduction is null or char_length(introduction) <= 5000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 10000),
  payment_terms text check (payment_terms is null or char_length(payment_terms) <= 5000),
  terms text check (terms is null or char_length(terms) <= 20000),
  acceptance_text text check (acceptance_text is null or char_length(acceptance_text) <= 2000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index estimate_proposals_org_idx on public.estimate_proposals (organization_id);
create trigger estimate_proposals_updated_at before update on public.estimate_proposals
  for each row execute function public.set_updated_at();
create trigger estimate_proposals_audit after insert or update or delete on public.estimate_proposals
  for each row execute function public.write_audit_event();

create or replace function public.estimate_proposals_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_e public.estimates;
begin
  select * into v_e from public.estimates e where e.id = coalesce(new.estimate_id, old.estimate_id);

  if tg_op = 'DELETE' then
    -- Cascading deletes arrive after the estimate row is gone.
    if v_e.id is not null and v_e.status not in ('draft', 'internal_review') then
      raise exception 'This proposal was sent to the homeowner and is kept as part of the record';
    end if;
    return old;
  end if;

  if v_e.id is null then raise exception 'Estimate not found'; end if;
  if tg_op = 'UPDATE' and new.estimate_id <> old.estimate_id then
    raise exception 'A proposal cannot move to another estimate';
  end if;
  if v_e.status not in ('draft', 'internal_review') then
    raise exception 'This proposal is locked because the estimate was sent to the homeowner. Create a revision to change it.';
  end if;
  new.organization_id := v_e.organization_id;
  if new.template_id is not null and not exists (
    select 1 from public.proposal_templates t
    where t.id = new.template_id and t.organization_id = v_e.organization_id
  ) then
    raise exception 'Template not found';
  end if;
  if tg_op = 'INSERT' then new.created_by := coalesce(new.created_by, auth.uid()); end if;
  new.updated_by := auth.uid();
  return new;
end;
$$;
create trigger estimate_proposals_guard before insert or update or delete on public.estimate_proposals
  for each row execute function public.estimate_proposals_guard();

alter table public.estimate_proposals enable row level security;
create policy estimate_proposals_feature_gate on public.estimate_proposals as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'estimates'))
  with check (public.is_feature_enabled(organization_id, 'estimates'));
create policy estimate_proposals_select on public.estimate_proposals for select to authenticated
  using (exists (select 1 from public.estimates e where e.id = estimate_id and public.can_view_project_internal(e.project_id)));
create policy estimate_proposals_insert on public.estimate_proposals for insert to authenticated
  with check (public.is_org_manager(organization_id)
    and exists (select 1 from public.estimates e where e.id = estimate_id and public.can_view_project_internal(e.project_id)));
create policy estimate_proposals_update on public.estimate_proposals for update to authenticated
  using (public.is_org_manager(organization_id))
  with check (public.is_org_manager(organization_id)
    and exists (select 1 from public.estimates e where e.id = estimate_id and public.can_view_project_internal(e.project_id)));
create policy estimate_proposals_delete on public.estimate_proposals for delete to authenticated
  using (public.is_org_manager(organization_id));

-- New estimate revisions start from the previous revision's proposal content.
create or replace function public.estimate_proposals_carry_forward()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.revision > 1 then
    insert into public.estimate_proposals (estimate_id, organization_id, template_id, title, pricing_display, show_scope,
      introduction, exclusions, payment_terms, terms, acceptance_text, created_by)
    select new.id, new.organization_id, p.template_id, p.title, p.pricing_display, p.show_scope,
      p.introduction, p.exclusions, p.payment_terms, p.terms, p.acceptance_text, auth.uid()
    from public.estimate_proposals p
    join public.estimates prev on prev.id = p.estimate_id
    where prev.family_id = new.family_id and prev.id <> new.id
    order by prev.revision desc
    limit 1
    on conflict (estimate_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger estimates_proposal_carry_forward after insert on public.estimates
  for each row execute function public.estimate_proposals_carry_forward();

-- ============ STARTER CONTENT ============
create or replace function public.proposal_starter_content()
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object(
    'name', 'Standard Residential Construction Proposal',
    'pricing_display', 'category',
    'introduction', 'Thank you for the opportunity to propose on your project. This proposal describes the scope of work, pricing, and terms for your review. Pricing is based on the scope described here; any changes will be handled through a written change order.',
    'exclusions', E'Unless specifically included in this proposal, the following are excluded:\n- Permit, impact, and utility connection fees\n- Survey, engineering, and soil testing\n- Removal or remediation of hazardous materials\n- Landscaping and site work beyond the scope described\n- Furnishings, window treatments, and low-voltage systems',
    'payment_terms', 'Payments are due as work progresses according to the project draw schedule. Invoices are due within 10 days of issue. Final payment is due at substantial completion.',
    'terms', E'1. Allowances. Allowance amounts are budgets for items selected by the homeowner. Selections above or below an allowance are adjusted by change order.\n2. Changes. Any change to scope, schedule, or price requires a written change order approved by both parties before the work proceeds.\n3. Schedule. Start and completion dates depend on permits, weather, material availability, and timely selections.\n4. Validity. This proposal is valid until the expiration date shown. Pricing after that date may be revised.\n5. Warranty. Workmanship is warranted for one year from substantial completion, in addition to any manufacturer warranties.',
    'acceptance_text', 'By approving this proposal, you accept the scope, pricing, and terms described above and authorize the builder to proceed.'
  );
$$;
grant execute on function public.proposal_starter_content() to authenticated;

insert into public.proposal_templates (organization_id, name, pricing_display, introduction, exclusions, payment_terms, terms, acceptance_text, is_default)
select o.id, s->>'name', s->>'pricing_display', s->>'introduction', s->>'exclusions', s->>'payment_terms', s->>'terms', s->>'acceptance_text', true
from public.organizations o cross join public.proposal_starter_content() s
where not exists (select 1 from public.proposal_templates t where t.organization_id = o.id);

-- ============ CLIENT-SAFE PRICING (internal helpers) ============
-- Each line's customer price = line cost x (1 + markup%, allowances excluded) x (1 + contingency%),
-- rounded to the cent. Rounding residue is assigned to the largest line so prices sum exactly to the
-- estimate's construction total.
create or replace function public.estimate_client_lines(p_estimate uuid)
returns table (line_id uuid, category text, description text, quantity numeric, unit text,
  is_allowance boolean, sort_order integer, price_cents bigint)
language sql stable security definer set search_path = '' as $$
  with e as (
    select id, markup_percent, contingency_percent, construction_total_cents from public.estimates where id = p_estimate
  ),
  priced as (
    select li.id, li.category, li.description, li.quantity, li.unit, li.is_allowance, li.sort_order, li.created_at,
      round(li.line_total_cents::numeric
        * case when li.is_allowance then 1 else 1 + e.markup_percent / 100 end
        * (1 + e.contingency_percent / 100))::bigint as price
    from public.estimate_line_items li join e on li.estimate_id = e.id
  ),
  ranked as (
    select p.*,
      (select construction_total_cents from e) - sum(p.price) over () as residue,
      row_number() over (order by p.price desc, p.sort_order, p.created_at, p.id) as size_rank
    from priced p
  )
  select r.id, r.category, r.description, r.quantity, r.unit, r.is_allowance, r.sort_order,
    r.price + case when r.size_rank = 1 then r.residue else 0 end
  from ranked r
  order by r.sort_order, r.created_at, r.id;
$$;

create or replace function public.estimate_client_pricing_json(p_estimate uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  with e as (select * from public.estimates where id = p_estimate),
  l as (select * from public.estimate_client_lines(p_estimate))
  select jsonb_build_object(
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object('category', l.category, 'description', l.description, 'quantity', l.quantity,
        'unit', l.unit, 'is_allowance', l.is_allowance, 'price_cents', l.price_cents) order by l.sort_order, l.line_id)
      from l), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('category', c.category, 'price_cents', c.price_cents,
        'allowance_cents', c.allowance_cents, 'line_count', c.line_count) order by c.first_sort, c.category)
      from (
        select l.category, sum(l.price_cents) as price_cents,
          sum(case when l.is_allowance then l.price_cents else 0 end) as allowance_cents,
          count(*) as line_count, min(l.sort_order) as first_sort
        from l group by l.category
      ) c), '[]'::jsonb),
    'construction_total_cents', (select construction_total_cents from e),
    'allowance_cents', coalesce((select sum(price_cents) from l where is_allowance), 0),
    'land_cost_cents', (select land_cost_cents from e),
    'total_with_land_cents', (select total_with_land_cents from e)
  );
$$;

-- Proposal content for an estimate: its saved proposal, else the organization's default template, else
-- the starter content. Never includes prices.
create or replace function public.estimate_proposal_json(p_estimate uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_e public.estimates;
  v_p public.estimate_proposals;
  v_t public.proposal_templates;
  v_s jsonb := public.proposal_starter_content();
begin
  select * into v_e from public.estimates where id = p_estimate;
  if v_e.id is null then return null; end if;
  select * into v_p from public.estimate_proposals where estimate_id = p_estimate;
  if v_p.id is not null then
    select * into v_t from public.proposal_templates where id = v_p.template_id;
    return jsonb_build_object(
      'saved', true, 'template_id', v_p.template_id, 'template_name', v_t.name,
      'title', coalesce(v_p.title, v_e.name), 'pricing_display', v_p.pricing_display, 'show_scope', v_p.show_scope,
      'introduction', v_p.introduction, 'exclusions', v_p.exclusions, 'payment_terms', v_p.payment_terms,
      'terms', v_p.terms, 'acceptance_text', v_p.acceptance_text, 'updated_at', v_p.updated_at);
  end if;
  select * into v_t from public.proposal_templates
  where organization_id = v_e.organization_id and is_default and archived_at is null;
  if v_t.id is not null then
    return jsonb_build_object(
      'saved', false, 'template_id', v_t.id, 'template_name', v_t.name,
      'title', v_e.name, 'pricing_display', v_t.pricing_display, 'show_scope', true,
      'introduction', v_t.introduction, 'exclusions', v_t.exclusions, 'payment_terms', v_t.payment_terms,
      'terms', v_t.terms, 'acceptance_text', v_t.acceptance_text, 'updated_at', null);
  end if;
  return jsonb_build_object(
    'saved', false, 'template_id', null, 'template_name', v_s->>'name',
    'title', v_e.name, 'pricing_display', v_s->>'pricing_display', 'show_scope', true,
    'introduction', v_s->>'introduction', 'exclusions', v_s->>'exclusions', 'payment_terms', v_s->>'payment_terms',
    'terms', v_s->>'terms', 'acceptance_text', v_s->>'acceptance_text', 'updated_at', null);
end;
$$;

revoke execute on function public.estimate_client_lines(uuid) from public, anon, authenticated;
revoke execute on function public.estimate_client_pricing_json(uuid) from public, anon, authenticated;
revoke execute on function public.estimate_proposal_json(uuid) from public, anon, authenticated;

-- Staff preview: exactly what the homeowner will see, for estimates the caller can view internally.
create or replace function public.proposal_preview(p_estimate uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_e public.estimates;
begin
  select * into v_e from public.estimates where id = p_estimate;
  if v_e.id is null or not public.can_view_project_internal(v_e.project_id)
     or not public.is_feature_enabled(v_e.organization_id, 'estimates') then
    return null;
  end if;
  return jsonb_build_object(
    'proposal', public.estimate_proposal_json(p_estimate),
    'pricing', public.estimate_client_pricing_json(p_estimate));
end;
$$;
revoke execute on function public.proposal_preview(uuid) from public, anon;
grant execute on function public.proposal_preview(uuid) to authenticated;

-- ============ HOMEOWNER PORTAL: CLIENT-SAFE ESTIMATE DETAIL ============
-- Replaces internal cost fields (direct cost, markup, contingency, line costs, line notes) with
-- allocated customer prices and proposal content.
CREATE OR REPLACE FUNCTION public.portal_approval_detail(p_type text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_project uuid;
  v_org uuid;
  v_doc jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_status text;
  v_sig_locked boolean := false;
  v_e public.estimates;
  v_c public.change_orders;
  v_pricing jsonb;
  v_proposal jsonb;
  v_display text;
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
    v_pricing := public.estimate_client_pricing_json(v_e.id);
    v_proposal := public.estimate_proposal_json(v_e.id);
    v_display := coalesce(v_proposal->>'pricing_display', 'category');
    if v_display = 'detailed' then v_lines := v_pricing->'lines'; end if;
    v_doc := jsonb_build_object(
      'document_type', 'estimate', 'id', v_e.id, 'number', v_e.estimate_number || ' Rev ' || v_e.revision,
      'title', coalesce(v_proposal->>'title', v_e.name),
      'description', case when coalesce((v_proposal->>'show_scope')::boolean, true) then v_e.description end,
      'revision', v_e.revision, 'estimate_date', v_e.estimate_date, 'expiration_date', v_e.expiration_date,
      'amount_cents', v_e.total_with_land_cents,
      'pricing_display', v_display,
      'categories', case when v_display in ('category', 'detailed') then v_pricing->'categories' else '[]'::jsonb end,
      'proposal', jsonb_build_object(
        'introduction', v_proposal->>'introduction', 'exclusions', v_proposal->>'exclusions',
        'payment_terms', v_proposal->>'payment_terms', 'terms', v_proposal->>'terms',
        'acceptance_text', v_proposal->>'acceptance_text'),
      'totals', jsonb_build_object(
        'construction_total_cents', v_e.construction_total_cents,
        'allowance_cents', (v_pricing->>'allowance_cents')::bigint,
        'land_cost_cents', v_e.land_cost_cents,
        'total_with_land_cents', v_e.total_with_land_cents),
      'sent_at', v_e.submitted_at, 'decision_at', v_e.decision_at, 'decision_by_name', v_e.decision_by_name,
      'decision_method', v_e.decision_method, 'decision_note', v_e.decision_note);
  else
    select * into v_c from public.change_orders c where c.id = p_id;
    if v_c.id is null or v_c.status not in ('awaiting_homeowner', 'approved', 'rejected', 'draft', 'internal_review') then return null; end if;
    v_project := v_c.project_id; v_org := v_c.organization_id;
    if not public.is_project_homeowner(v_project) or not public.is_feature_enabled(v_org, 'change_orders') then return null; end if;
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
$function$;

-- ============ HOMEOWNER DECISION: CLIENT-SAFE SNAPSHOT ============
CREATE OR REPLACE FUNCTION public.portal_decide_approval(p_type text, p_id uuid, p_revision integer, p_decision text, p_comment text, p_expected_amount_cents bigint, p_acknowledged boolean, p_request_key uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    v_snapshot := jsonb_build_object(
      'estimate_number', v_e.estimate_number, 'revision', v_e.revision, 'name', v_e.name,
      'construction_total_cents', v_e.construction_total_cents, 'land_cost_cents', v_e.land_cost_cents,
      'total_with_land_cents', v_e.total_with_land_cents, 'submitted_at', v_e.submitted_at,
      'proposal', public.estimate_proposal_json(v_e.id),
      'pricing', public.estimate_client_pricing_json(v_e.id));
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
$function$;
