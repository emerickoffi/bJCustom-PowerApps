-- Quote comparison and decisions: private review notes, reject, select (award) and an optional linked draft commitment.
-- FOR REVIEW — NOT YET APPLIED. Apply only after 20261130000010_subcontract_quote_requests.sql and
-- 20261102000010_job_costing.sql.
--
-- Rules enforced here, not only in the UI:
-- - One winning company per request (unique award per request, taken under a row lock). No split awards.
-- - Selection is not reversible in this release: an awarded request is final and cannot be reassigned.
-- - Selection refuses responses priced against an outdated scope or with an outstanding revision request.
-- - Decision notices never mention competitors' prices or identities.
-- - Internal review notes are readable only by builder reviewers; subcontractors have no policy on them.
-- - A draft commitment is created only on explicit request, at most once per award, and never approved here.
--   Draft commitments do not count toward reported committed cost (only approved ones do).
-- - Nothing here touches estimates, invoices, contracts, budgets or payments.

-- ───────────────────────── Capability ─────────────────────────
-- Same default as the other quote capabilities; kept separate so it can diverge later.
create or replace function public.can_select_quotes(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_review_sub_project(p_org, p_project);
$$;

-- ───────────────────────── Status vocabulary ─────────────────────────
alter table public.subcontract_quote_requests drop constraint subcontract_quote_requests_status_check;
alter table public.subcontract_quote_requests add constraint subcontract_quote_requests_status_check
  check (status in ('draft', 'open', 'closed', 'cancelled', 'awarded'));
alter table public.subcontract_quote_requests add column awarded_at timestamptz;

alter table public.subcontract_quote_events drop constraint subcontract_quote_events_event_type_check;
alter table public.subcontract_quote_events add constraint subcontract_quote_events_event_type_check
  check (event_type in (
    'created', 'sent', 'invited', 'amended', 'deadline_changed', 'closed', 'reopened', 'cancelled',
    'submitted', 'revision_requested', 'declined',
    'rejected', 'selected', 'not_selected', 'awarded', 'commitment_created'));

-- Decision on a company's response. Separate from the response status (invited / declined) and from the request status.
alter table public.subcontract_quote_invitations
  add column decision text check (decision is null or decision in ('selected', 'not_selected', 'rejected')),
  add column decision_at timestamptz,
  add column decision_by uuid references auth.users(id) on delete set null,
  add column decision_revision_id uuid references public.subcontract_quote_revisions(id) on delete restrict,
  -- Shown to the company. Internal reasoning belongs in subcontract_quote_review_notes.
  add column decision_message text check (decision_message is null or char_length(decision_message) <= 2000),
  add constraint sqi_decision_state check ((decision is null) = (decision_at is null));

-- ───────────────────────── Private review notes (append-only) ─────────────────────────
create table public.subcontract_quote_review_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.subcontract_quote_requests(id) on delete restrict,
  invitation_id uuid references public.subcontract_quote_invitations(id) on delete restrict,
  revision_id uuid references public.subcontract_quote_revisions(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index sqrn_request_idx on public.subcontract_quote_review_notes (request_id, created_at desc);
create trigger sqrn_append_only before update or delete on public.subcontract_quote_review_notes
  for each row execute function public.subcontract_quote_append_only();

-- ───────────────────────── Awards (one per request) ─────────────────────────
create table public.subcontract_quote_awards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  request_id uuid not null unique references public.subcontract_quote_requests(id) on delete restrict,
  invitation_id uuid not null references public.subcontract_quote_invitations(id) on delete restrict,
  revision_id uuid not null references public.subcontract_quote_revisions(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  scope_version integer not null,
  currency text not null,
  amount_cents bigint not null,
  tax_treatment text not null,
  tax_amount_cents bigint,
  acknowledged_warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(acknowledged_warnings) = 'array'),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz not null default now(),
  commitment_id uuid unique,
  commitment_created_at timestamptz
);

-- Links back from the existing commitment service. Unique so one award can never produce two commitments.
alter table public.project_commitments
  add column source_quote_award_id uuid unique references public.subcontract_quote_awards(id) on delete restrict,
  add column source_quote_revision_id uuid references public.subcontract_quote_revisions(id) on delete restrict;
alter table public.subcontract_quote_awards
  add constraint sqaw_commitment_fk foreign key (commitment_id) references public.project_commitments(id) on delete restrict;

-- ───────────────────────── Guards ─────────────────────────
create or replace function public.subcontract_quote_awards_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Quote selections are kept as history and cannot be removed'; end if;
  if old.commitment_id is null and new.commitment_id is not null
     and (to_jsonb(new) - 'commitment_id' - 'commitment_created_at') = (to_jsonb(old) - 'commitment_id' - 'commitment_created_at') then
    return new;
  end if;
  raise exception 'A quote selection is a permanent record and cannot be changed or reassigned';
end;
$$;
create trigger sqaw_guard before update or delete on public.subcontract_quote_awards
  for each row execute function public.subcontract_quote_awards_guard();

create or replace function public.project_commitments_quote_link_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.source_quote_award_id is distinct from old.source_quote_award_id
     or new.source_quote_revision_id is distinct from old.source_quote_revision_id then
    raise exception 'The quote a commitment was created from cannot be changed';
  end if;
  return new;
end;
$$;
create trigger project_commitments_quote_link before update on public.project_commitments
  for each row execute function public.project_commitments_quote_link_guard();

-- Awarded requests are final (no silent reassignment); the existing guard still applies to everything else.
create or replace function public.subcontract_quote_requests_award_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'awarded' and new.status <> 'awarded' then
    raise exception 'This request has been awarded. Selection cannot be reversed or reassigned in this release.';
  end if;
  if new.status = 'awarded' and old.status <> 'awarded'
     and not exists (select 1 from public.subcontract_quote_awards a where a.request_id = new.id) then
    raise exception 'A request can only be awarded through quote selection';
  end if;
  return new;
end;
$$;
create trigger sqr_award_guard before update on public.subcontract_quote_requests
  for each row execute function public.subcontract_quote_requests_award_guard();

-- A decision is final for that company: no later decision change and no further revision requests.
create or replace function public.subcontract_quote_invitations_decision_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.decision is not null and (
       new.decision is distinct from old.decision or new.decision_at is distinct from old.decision_at
       or new.decision_revision_id is distinct from old.decision_revision_id
       or new.decision_message is distinct from old.decision_message
       or new.revision_requested_at is distinct from old.revision_requested_at
       or new.status is distinct from old.status) then
    raise exception 'A decision has already been recorded for this company';
  end if;
  return new;
end;
$$;
create trigger sqi_decision_guard before update on public.subcontract_quote_invitations
  for each row execute function public.subcontract_quote_invitations_decision_guard();

-- Once a company's quote is decided, it cannot open a new draft or submit another revision.
create or replace function public.subcontract_quote_revisions_decision_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.subcontract_quote_invitations i where i.id = new.invitation_id and i.decision is not null) then
    raise exception 'A decision has been recorded on this quote; it no longer accepts revisions';
  end if;
  return new;
end;
$$;
create trigger sqrev_decision_guard before insert or update on public.subcontract_quote_revisions
  for each row execute function public.subcontract_quote_revisions_decision_guard();

-- ───────────────────────── RLS ─────────────────────────
alter table public.subcontract_quote_review_notes enable row level security;
alter table public.subcontract_quote_awards enable row level security;
create policy sqrn_select on public.subcontract_quote_review_notes for select to authenticated
  using (public.can_review_quotes(organization_id, (select r.project_id from public.subcontract_quote_requests r where r.id = request_id)));
create policy sqaw_select on public.subcontract_quote_awards for select to authenticated
  using (public.can_view_quotes(organization_id, project_id));
grant select on public.subcontract_quote_review_notes, public.subcontract_quote_awards to authenticated;

-- ───────────────────────── Reviewer helpers ─────────────────────────
create or replace function public.quote_review_lock(p_request uuid, p_expected_org uuid, p_capability text)
returns public.subcontract_quote_requests language plpgsql security definer set search_path = '' as $$
declare v public.subcontract_quote_requests;
begin
  select * into v from public.subcontract_quote_requests where id = p_request for update;
  if v.id is null or v.organization_id is distinct from p_expected_org then
    raise exception 'This quote request could not be found in the current organization' using errcode = 'P0002';
  end if;
  if (p_capability = 'select' and not public.can_select_quotes(v.organization_id, v.project_id))
     or (p_capability = 'review' and not public.can_review_quotes(v.organization_id, v.project_id)) then
    raise exception 'You do not have permission to % quotes on this project', p_capability using errcode = '42501';
  end if;
  return v;
end;
$$;

-- Whether each company has an unsubmitted draft in progress. Never returns draft content.
create or replace function public.quote_request_draft_flags(p_request uuid)
returns table (invitation_id uuid, draft_updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select v.invitation_id, v.updated_at
  from public.subcontract_quote_revisions v
  join public.subcontract_quote_requests r on r.id = v.request_id
  where v.request_id = p_request and v.status = 'draft'
    and public.can_review_quotes(r.organization_id, r.project_id);
$$;

create or replace function public.quote_review_note_add(p_invitation uuid, p_expected_org uuid, p_body text, p_revision uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare inv public.subcontract_quote_invitations; v_req public.subcontract_quote_requests; v_id uuid;
begin
  select * into inv from public.subcontract_quote_invitations where id = p_invitation;
  if inv.id is null then raise exception 'This company is not on the request' using errcode = 'P0002'; end if;
  v_req := public.quote_review_lock(inv.request_id, p_expected_org, 'review');
  if p_revision is not null and not exists (
       select 1 from public.subcontract_quote_revisions v where v.id = p_revision and v.invitation_id = inv.id and v.status = 'submitted') then
    raise exception 'That revision does not belong to this company' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) = 0 then raise exception 'Write a note first'; end if;
  insert into public.subcontract_quote_review_notes (organization_id, request_id, invitation_id, revision_id, body, author_id)
  values (inv.organization_id, inv.request_id, inv.id, p_revision, btrim(p_body), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Rejects one company's quote. Other companies are untouched; the request stays as it is.
create or replace function public.quote_reject(p_invitation uuid, p_expected_org uuid, p_message text, p_internal_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.subcontract_quote_invitations; v_req public.subcontract_quote_requests; v_latest uuid; v_msg text;
begin
  select * into inv from public.subcontract_quote_invitations where id = p_invitation;
  if inv.id is null then raise exception 'This company is not on the request' using errcode = 'P0002'; end if;
  v_req := public.quote_review_lock(inv.request_id, p_expected_org, 'review');
  select * into inv from public.subcontract_quote_invitations where id = p_invitation for update;
  if inv.decision = 'rejected' then return; end if;
  if inv.decision is not null then raise exception 'A decision has already been recorded for this company'; end if;
  if v_req.status not in ('open', 'closed') then raise exception 'Quotes can only be rejected on an open or closed request'; end if;
  if inv.status = 'declined' then raise exception 'This company declined to quote'; end if;
  select v.id into v_latest from public.subcontract_quote_revisions v
   where v.invitation_id = inv.id and v.status = 'submitted' order by v.revision_number desc limit 1;
  if v_latest is null then raise exception 'There is no submitted quote to reject'; end if;
  v_msg := nullif(btrim(coalesce(p_message, '')), '');

  update public.subcontract_quote_invitations
     set decision = 'rejected', decision_at = now(), decision_by = auth.uid(), decision_revision_id = v_latest, decision_message = v_msg
   where id = inv.id;
  if nullif(btrim(coalesce(p_internal_note, '')), '') is not null then
    insert into public.subcontract_quote_review_notes (organization_id, request_id, invitation_id, revision_id, body, author_id)
    values (inv.organization_id, inv.request_id, inv.id, v_latest, btrim(p_internal_note), auth.uid());
  end if;
  insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, revision_id, event_type, actor_id, company_visible, message)
  values (inv.organization_id, inv.request_id, inv.id, v_latest, 'rejected', auth.uid(), true, v_msg);
  perform public.quote_outbox_enqueue(v_req, 'rejected:' || inv.id, 'company', inv.id,
    'Quote not accepted: ' || v_req.title,
    coalesce(v_msg, 'The builder did not accept your quote for this request.'),
    '/sub/quotes/' || v_req.id, false);
  perform public.quote_audit(inv.organization_id, 'subcontract_quote_invitation', inv.id, 'rejected');
  perform public.quote_outbox_try_deliver(v_req.id);
end;
$$;

-- Selects one company's exact submitted revision. Atomic: the request row is locked and the award is unique per request.
create or replace function public.quote_select(
  p_request uuid, p_expected_org uuid, p_revision uuid, p_confirmed boolean, p_acknowledged_warnings text[])
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_req public.subcontract_quote_requests; rev public.subcontract_quote_revisions; inv public.subcontract_quote_invitations;
  v_award public.subcontract_quote_awards; v_latest uuid; v_company record; v_mode text; v_qual text;
  v_warnings text[] := '{}'; o record;
begin
  v_req := public.quote_review_lock(p_request, p_expected_org, 'select');

  select * into v_award from public.subcontract_quote_awards where request_id = v_req.id;
  if v_award.id is not null then
    if v_award.revision_id = p_revision then
      return jsonb_build_object('award_id', v_award.id, 'replayed', true);
    end if;
    raise exception 'A quote has already been selected for this request' using errcode = 'P0001';
  end if;
  if not coalesce(p_confirmed, false) then raise exception 'Confirm the selection first'; end if;
  if v_req.status not in ('open', 'closed') then raise exception 'Quotes can only be selected on an open or closed request'; end if;

  select * into rev from public.subcontract_quote_revisions where id = p_revision and request_id = v_req.id;
  if rev.id is null or rev.status <> 'submitted' then raise exception 'That quote revision is not available' using errcode = 'P0002'; end if;
  select * into inv from public.subcontract_quote_invitations where id = rev.invitation_id for update;
  if inv.status = 'declined' then raise exception 'This company declined to quote'; end if;
  if inv.decision is not null then raise exception 'A decision has already been recorded for this company'; end if;
  select v.id into v_latest from public.subcontract_quote_revisions v
   where v.invitation_id = inv.id and v.status = 'submitted' order by v.revision_number desc limit 1;
  if v_latest <> rev.id then raise exception 'A newer revision from this company exists. Select its latest revision.'; end if;
  if rev.scope_version <> v_req.current_scope_version then
    raise exception 'This quote was priced against scope v%, but the current scope is v%. Request a revision first.',
      rev.scope_version, v_req.current_scope_version;
  end if;
  if inv.revision_requested_at is not null and inv.revision_requested_at > rev.submitted_at then
    raise exception 'A revision request to this company is still outstanding. Wait for the revised quote.';
  end if;

  select c.status, c.company_name into v_company from public.subcontractor_companies c
   where c.id = inv.subcontractor_company_id and c.organization_id = v_req.organization_id;
  if v_company.status is distinct from 'active' then raise exception 'This company is no longer active in your directory'; end if;
  select q.assignment_mode into v_mode from public.subcontractor_qualification_policies q where q.organization_id = v_req.organization_id;
  v_qual := public.subcontractor_qualification_status(inv.subcontractor_company_id);
  if v_qual <> 'qualified' then
    if v_mode = 'enforcement' then
      raise exception 'This company is not qualified for new project work. Complete vetting and final approval first';
    end if;
    v_warnings := array_append(v_warnings, 'qualification');
  end if;
  if rev.valid_until is not null and rev.valid_until < current_date then v_warnings := array_append(v_warnings, 'expired'); end if;
  if exists (select 1 from unnest(v_warnings) w where not (w = any(coalesce(p_acknowledged_warnings, '{}')))) then
    raise exception 'Acknowledge the qualification and validity warnings before selecting';
  end if;

  insert into public.subcontract_quote_awards (organization_id, project_id, request_id, invitation_id, revision_id, subcontractor_company_id,
    scope_version, currency, amount_cents, tax_treatment, tax_amount_cents, acknowledged_warnings, decided_by)
  values (v_req.organization_id, v_req.project_id, v_req.id, inv.id, rev.id, inv.subcontractor_company_id,
    rev.scope_version, v_req.currency, rev.amount_cents, rev.tax_treatment, rev.tax_amount_cents, to_jsonb(v_warnings), auth.uid())
  returning * into v_award;

  update public.subcontract_quote_requests set status = 'awarded', awarded_at = now(), row_version = row_version + 1 where id = v_req.id;
  update public.subcontract_quote_invitations
     set decision = 'selected', decision_at = now(), decision_by = auth.uid(), decision_revision_id = rev.id
   where id = inv.id;
  insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, revision_id, event_type, actor_id, company_visible, details)
  values (v_req.organization_id, v_req.id, inv.id, rev.id, 'selected', auth.uid(), true,
          jsonb_build_object('revision_number', rev.revision_number, 'scope_version', rev.scope_version));
  insert into public.subcontract_quote_events (organization_id, request_id, event_type, actor_id, company_visible, details)
  values (v_req.organization_id, v_req.id, 'awarded', auth.uid(), false,
          jsonb_build_object('award_id', v_award.id, 'warnings', to_jsonb(v_warnings)));
  perform public.quote_outbox_enqueue(v_req, 'selected:' || inv.id, 'company', inv.id, 'Quote selected: ' || v_req.title,
    'Your quote (revision ' || rev.revision_number || ') was selected. This is not a signed contract, a payment approval, or authorization to start work; the builder will follow up.',
    '/sub/quotes/' || v_req.id, false);
  perform public.quote_outbox_enqueue(v_req, 'awarded:' || v_req.id, 'builder', null, 'Quote selected: ' || v_req.title,
    v_company.company_name || ' was selected.',
    '/projects/' || v_req.project_id || '/subcontractor-work/quotes/' || v_req.id, false);

  -- Every other company still in the running: participants are marked Not selected; non-responders are told it closed.
  -- Declined and already-rejected responses are preserved exactly as they are.
  for o in select i.* from public.subcontract_quote_invitations i
           where i.request_id = v_req.id and i.id <> inv.id and i.status = 'invited' and i.decision is null
           order by i.id for update loop
    if exists (select 1 from public.subcontract_quote_revisions v where v.invitation_id = o.id and v.status = 'submitted') then
      update public.subcontract_quote_invitations
         set decision = 'not_selected', decision_at = now(), decision_by = auth.uid(),
             decision_revision_id = (select v.id from public.subcontract_quote_revisions v
                                      where v.invitation_id = o.id and v.status = 'submitted' order by v.revision_number desc limit 1)
       where id = o.id;
      insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, event_type, actor_id, company_visible)
      values (o.organization_id, o.request_id, o.id, 'not_selected', auth.uid(), true);
      perform public.quote_outbox_enqueue(v_req, 'not_selected:' || o.id, 'company', o.id, 'Quote decision: ' || v_req.title,
        'Thank you for quoting. Your quote was not selected for this request.', '/sub/quotes/' || v_req.id, false);
    else
      perform public.quote_outbox_enqueue(v_req, 'awarded_closed:' || o.id, 'company', o.id, 'Quote request closed: ' || v_req.title,
        'This request is no longer accepting quotes.', '/sub/quotes/' || v_req.id, false);
    end if;
  end loop;

  perform public.quote_audit(v_req.organization_id, 'subcontract_quote_award', v_award.id, 'selected');
  perform public.quote_outbox_try_deliver(v_req.id);
  return jsonb_build_object('award_id', v_award.id, 'replayed', false);
end;
$$;

-- Creates the single draft commitment for an award through the existing commitment table and its rules.
-- Retries return the existing commitment. The commitment stays draft until approved through normal job costing.
create or replace function public.quote_create_commitment(
  p_request uuid, p_expected_org uuid, p_cost_category text, p_description text, p_amount_cents bigint)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_req public.subcontract_quote_requests; a public.subcontract_quote_awards; v_cur text; v_name text; v_id uuid;
begin
  v_req := public.quote_review_lock(p_request, p_expected_org, 'select');
  select * into a from public.subcontract_quote_awards where request_id = v_req.id for update;
  if a.id is null then raise exception 'Select a quote before creating a commitment'; end if;
  if a.commitment_id is not null then return jsonb_build_object('commitment_id', a.commitment_id, 'replayed', true); end if;
  if not public.can_manage_project_costs(v_req.project_id) then
    raise exception 'You do not have permission to manage job costs on this project' using errcode = '42501';
  end if;
  if p_cost_category is null or not public.is_cost_category(p_cost_category) then raise exception 'Choose a cost category'; end if;
  if char_length(btrim(coalesce(p_description, ''))) not between 2 and 500 then
    raise exception 'Describe the commitment (2 to 500 characters)';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000000 then
    raise exception 'Enter the agreed amount';
  end if;
  select currency into v_cur from public.projects where id = v_req.project_id;
  if v_cur is distinct from a.currency then
    raise exception 'The project currency (%) does not match the quote currency (%)', coalesce(v_cur, 'not set'), a.currency;
  end if;
  select company_name into v_name from public.subcontractor_companies where id = a.subcontractor_company_id;

  insert into public.project_commitments (organization_id, project_id, subcontractor_company_id, vendor_name, commitment_type,
    cost_category, description, amount_cents, status, source_quote_award_id, source_quote_revision_id, updated_by)
  values (a.organization_id, a.project_id, a.subcontractor_company_id, v_name, 'subcontract',
    p_cost_category, btrim(p_description), p_amount_cents, 'draft', a.id, a.revision_id, auth.uid())
  returning id into v_id;
  update public.subcontract_quote_awards set commitment_id = v_id, commitment_created_at = now() where id = a.id;
  insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, revision_id, event_type, actor_id, company_visible, details)
  values (a.organization_id, a.request_id, a.invitation_id, a.revision_id, 'commitment_created', auth.uid(), false,
          jsonb_build_object('commitment_id', v_id));
  perform public.quote_audit(a.organization_id, 'subcontract_quote_award', a.id, 'commitment_created');
  return jsonb_build_object('commitment_id', v_id, 'replayed', false);
end;
$$;

-- ───────────────────────── Execute grants ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.quote_request_draft_flags(uuid)',
    'public.quote_review_note_add(uuid, uuid, text, uuid)',
    'public.quote_reject(uuid, uuid, text, text)',
    'public.quote_select(uuid, uuid, uuid, boolean, text[])',
    'public.quote_create_commitment(uuid, uuid, text, text, bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  foreach f in array array['public.quote_review_lock(uuid, uuid, text)'] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
