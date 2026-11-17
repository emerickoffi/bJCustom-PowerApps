-- Snapshot of changes that were made directly in the live database and never saved as migrations.
-- Captured from the live database on 2026-11-17 after the catch-up scripts (supabase/catch-up/step-a/b/c).
-- On the live database this file changes nothing: every definition below is exactly what is already there.
-- One deliberate tightening: reorder_project_schedule is no longer executable by anonymous visitors
-- (it runs with the caller's own permissions, so anonymous calls could never change anything anyway).
-- Its purpose is that a fresh database built from the migrations matches production.
-- Not included on purpose:
--   * platform owner-console functions, user_org_role and sub_company_ids (20270106000010_platform_owner_console.sql)
--   * 20261103000010_primary_contact_on_create.sql (marked for review, never applied)
--   * 20261122000010_subcontractor_performance_reviews.sql (superseded by subcontractor ratings)

-- ============ COLUMNS ============
alter table public.organization_settings add column if not exists dashboard_visibility jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'organization_settings_dashboard_visibility_check') then
    alter table public.organization_settings add constraint organization_settings_dashboard_visibility_check
      check (dashboard_visibility is null or (jsonb_typeof(dashboard_visibility) = 'object' and pg_column_size(dashboard_visibility) < 8192));
  end if;
end $$;

alter table public.project_issue_notes add column if not exists author_kind text not null default 'builder';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_issue_notes_author_kind_check') then
    alter table public.project_issue_notes add constraint project_issue_notes_author_kind_check
      check (author_kind = any (array['builder', 'homeowner']));
  end if;
end $$;

-- ============ FUNCTIONS (only in the live database) ============
CREATE OR REPLACE FUNCTION public.document_object_unreferenced(p_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select not exists (select 1 from public.project_document_versions v where v.storage_path = p_name);
$function$;

CREATE OR REPLACE FUNCTION public.is_project_homeowner_base(p_project uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.portal_project_access a
    join public.portal_accounts pa on pa.id = a.portal_account_id
    join public.projects p on p.id = a.project_id
    join public.project_clients pc on pc.project_id = p.id and pc.client_id = pa.client_id
    where a.project_id = p_project
      and a.user_id = auth.uid()
      and p.archived_at is null
      and public.user_org_role(p.organization_id) = 'client'
  );
$function$;

CREATE OR REPLACE FUNCTION public.project_document_versions_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'Document versions are permanent and cannot be changed or deleted';
end $function$;

CREATE OR REPLACE FUNCTION public.signature_events_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  raise exception 'Signature events are immutable';
end $function$;

-- ============ FUNCTIONS (live version differs from the repo) ============
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_inv public.invitations;
  v_existing public.organization_memberships;
begin
  if v_uid is null then return jsonb_build_object('result', 'signed_out'); end if;
  if p_token is null or length(p_token) not between 32 and 128 then return jsonb_build_object('result', 'invalid'); end if;

  select * into v_inv from public.invitations
    where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') and role <> 'client'
    for update;
  if not found then return jsonb_build_object('result', 'invalid'); end if;

  select lower(u.email), u.email_confirmed_at into v_email, v_confirmed from auth.users u where u.id = v_uid;

  if v_inv.status = 'accepted' then
    if v_inv.accepted_by = v_uid then
      return jsonb_build_object('result', 'accepted', 'organization_id', v_inv.organization_id);
    end if;
    return jsonb_build_object('result', 'used');
  end if;
  if v_inv.status = 'revoked' then return jsonb_build_object('result', 'revoked'); end if;
  if v_inv.expires_at <= now() then return jsonb_build_object('result', 'expired'); end if;
  if v_email is distinct from lower(v_inv.email) then return jsonb_build_object('result', 'wrong_account'); end if;
  if v_confirmed is null then return jsonb_build_object('result', 'unconfirmed'); end if;

  select * into v_existing from public.organization_memberships
    where organization_id = v_inv.organization_id and user_id = v_uid;
  if found and v_existing.status <> 'active' then
    return jsonb_build_object('result', 'suspended');
  end if;

  if not found then
    insert into public.organization_memberships (organization_id, user_id, role, status, invited_by)
      values (v_inv.organization_id, v_uid, v_inv.role, 'active', v_inv.invited_by);
  end if;

  insert into public.project_members (organization_id, project_id, user_id, created_by)
    select v_inv.organization_id, p.id, v_uid, v_inv.invited_by
    from public.projects p
    where p.id = any (v_inv.project_ids) and p.organization_id = v_inv.organization_id and p.archived_at is null
  on conflict (project_id, user_id) do nothing;

  update public.invitations set status = 'accepted', accepted_by = v_uid, accepted_at = now() where id = v_inv.id;
  return jsonb_build_object('result', 'accepted', 'organization_id', v_inv.organization_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.after_project_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.primary_client_id is not null then
      insert into public.project_clients (organization_id, project_id, client_id, relationship, created_by)
        values (new.organization_id, new.id, new.primary_client_id, 'primary_owner', auth.uid())
        on conflict (project_id, client_id) do update set relationship = 'primary_owner';
      insert into public.client_activity (organization_id, client_id, project_id, activity_type, summary, created_by)
        values (new.organization_id, new.primary_client_id, new.id, 'system',
                'Project ' || new.project_number || ' "' || new.name || '" created', auth.uid());
    end if;
    insert into public.project_status_history (organization_id, project_id, from_status, to_status, note, changed_by)
      values (new.organization_id, new.id, null, new.status, 'Project created', auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.project_status_history (organization_id, project_id, from_status, to_status, note, changed_by)
      values (new.organization_id, new.id, old.status, new.status,
              nullif(current_setting('app.status_note', true), ''), auth.uid());
  end if;

  if tg_op = 'UPDATE' and new.primary_client_id is distinct from old.primary_client_id then
    if new.primary_client_id is not null then
      insert into public.project_clients (organization_id, project_id, client_id, relationship, created_by)
        values (new.organization_id, new.id, new.primary_client_id, 'primary_owner', auth.uid())
        on conflict (project_id, client_id) do update set relationship = 'primary_owner';
      insert into public.client_activity (organization_id, client_id, project_id, activity_type, summary, created_by)
        values (new.organization_id, new.primary_client_id, new.id, 'system',
                'Linked as primary homeowner on project ' || new.project_number || ' "' || new.name || '"', auth.uid());
    end if;
    if old.primary_client_id is not null then
      if new.primary_client_id is null then
        delete from public.project_clients
          where project_id = new.id and client_id = old.primary_client_id and relationship = 'primary_owner';
        insert into public.client_activity (organization_id, client_id, project_id, activity_type, summary, created_by)
          values (new.organization_id, old.primary_client_id, new.id, 'system',
                  'Removed as primary homeowner from project ' || new.project_number || ' "' || new.name || '"', auth.uid());
      else
        update public.project_clients set relationship = 'co_owner'
          where project_id = new.id and client_id = old.primary_client_id;
      end if;
    end if;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_email_outbox(p_worker text, p_limit integer DEFAULT 25)
 RETURNS SETOF email_outbox
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  return query
  update public.email_outbox e
     set status = 'sending', locked_at = now(), locked_by = p_worker,
         attempts = e.attempts + 1, updated_at = now()
   where e.id in (
     select c.id from public.email_outbox c
     where (c.status = 'queued' and c.next_attempt_at <= now())
        or (c.status = 'sending' and c.locked_at < now() - interval '10 minutes')
     order by c.next_attempt_at, c.id
     limit greatest(1, least(p_limit, 100))
     for update skip locked)
  returning e.*;
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_email_outbox(p_id bigint, p_worker text, p_outcome text, p_message_id text DEFAULT NULL::text, p_error text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_row public.email_outbox;
begin
  select * into v_row from public.email_outbox where id = p_id and status = 'sending' and locked_by = p_worker for update;
  if v_row.id is null then return false; end if;

  if p_outcome = 'accepted' then
    update public.email_outbox set status = 'accepted', provider_message_id = left(p_message_id, 200),
      accepted_at = now(), last_error = null, locked_at = null, locked_by = null, updated_at = now(),
      payload = case when template = 'notification' then payload else payload - 'link' end
    where id = p_id;
  elsif p_outcome = 'skipped' then
    update public.email_outbox set status = 'skipped', skip_reason = left(p_error, 120),
      locked_at = null, locked_by = null, updated_at = now(), payload = payload - 'link'
    where id = p_id;
  elsif p_outcome = 'retry' and v_row.attempts < v_row.max_attempts then
    update public.email_outbox set status = 'queued', last_error = left(p_error, 500),
      next_attempt_at = now() + least(interval '1 hour', interval '1 minute' * power(2, v_row.attempts - 1)),
      locked_at = null, locked_by = null, updated_at = now()
    where id = p_id;
  else
    update public.email_outbox set status = 'failed', last_error = left(coalesce(p_error, 'unknown_error'), 500),
      locked_at = null, locked_by = null, updated_at = now()
    where id = p_id;
  end if;
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_notification_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_category text := public.email_category_for_kind(new.kind);
  v_email text;
  v_status text := 'queued';
  v_reason text;
  v_org text;
  v_project text;
  v_action boolean := coalesce(new.action_required, false);
begin
  begin
    if not public.email_recipient_in_org(new.organization_id, new.user_id) then
      v_status := 'skipped'; v_reason := 'recipient_not_in_organization';
    else
      select u.email into v_email from auth.users u where u.id = new.user_id;
      if v_email is null or v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        v_status := 'skipped'; v_reason := 'missing_or_invalid_address';
      elsif not public.email_category_enabled(new.user_id, v_category) then
        v_status := 'skipped'; v_reason := 'preference_disabled';
      elsif not v_action and new.link is not null and exists (
        select 1 from public.email_outbox e
        where e.user_id = new.user_id
          and e.status in ('queued', 'sending', 'accepted')
          and e.payload ->> 'link' = new.link
          and e.created_at > now() - interval '30 minutes') then
        v_status := 'skipped'; v_reason := 'coalesced_recent_update';
      end if;
    end if;

    select o.display_name into v_org from public.organizations o where o.id = new.organization_id;
    if new.project_id is not null then
      select p.name into v_project from public.projects p where p.id = new.project_id;
    end if;

    insert into public.email_outbox
      (event_key, organization_id, notification_id, user_id, recipient_email, category, template, payload, status, skip_reason)
    values (
      'notification:' || new.id, new.organization_id, new.id, new.user_id,
      case when v_reason = 'recipient_not_in_organization' then null else v_email end,
      v_category, 'notification',
      jsonb_build_object(
        'title', new.title, 'body', new.body, 'link', new.link, 'kind', new.kind,
        'organization_name', v_org, 'project_name', v_project, 'action_required', v_action),
      v_status, v_reason)
    on conflict (event_key) do nothing;
  exception when others then
    raise warning 'email enqueue skipped for notification %: %', new.id, sqlerrm;
  end;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.estimate_line_items_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.estimate_line_items := coalesce(new, old);
  v_status text;
  v_org uuid;
begin
  select e.status, e.organization_id into v_status, v_org from public.estimates e where e.id = v_row.estimate_id;
  if v_status is null then
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_invoice_homeowners(p_invoice uuid, p_kind text, p_title text, p_body text, p_dedupe text, p_action boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_inv record;
begin
  select i.id, i.organization_id, i.project_id, i.client_id, i.status, i.portal_published
    into v_inv from public.invoices i where i.id = p_invoice;
  if v_inv.id is null or not v_inv.portal_published or v_inv.status in ('draft', 'voided') then return; end if;
  if not public.is_feature_enabled(v_inv.organization_id, 'portal') then return; end if;

  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, client_id, dedupe_key, action_required)
  select v_inv.organization_id, m.user_id, p_title, p_body, '/portal/invoices/' || v_inv.id, p_kind,
         v_inv.project_id, m.client_id, p_dedupe || ':' || m.user_id, p_action
  from public.organization_memberships m
  where m.organization_id = v_inv.organization_id and m.status = 'active' and m.role = 'client'
    and (m.client_id = v_inv.client_id or m.client_id in (
      select pc.client_id from public.project_clients pc
      where pc.project_id = v_inv.project_id and pc.relationship in ('primary_owner', 'co_owner')))
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_project_staff(p_org uuid, p_project uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text, p_action boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_pm uuid;
begin
  select p.project_manager_id into v_pm from public.projects p where p.id = p_project and p.organization_id = p_org;
  if v_pm is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = v_pm and m.status = 'active'
      and m.role in ('org_admin', 'project_manager')) then
    v_pm := null;
  end if;

  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, dedupe_key, action_required)
  select p_org, m.user_id, p_title, p_body, p_link, p_kind, p_project, p_dedupe, p_action
  from public.organization_memberships m
  where m.organization_id = p_org and m.status = 'active'
    and ((v_pm is not null and m.user_id = v_pm) or (v_pm is null and m.role = 'org_admin'))
    and m.user_id is distinct from auth.uid()
  on conflict do nothing;
end;
$function$;

CREATE OR REPLACE FUNCTION public.portal_approval_items()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.record_vendor_payment(p_bill uuid, p_payment_date date, p_amount_cents bigint, p_method text, p_reference text, p_idempotency_key uuid, p_notes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_bill record;
  v_paid bigint;
  v_id uuid;
begin
  if p_idempotency_key is null then
    raise exception 'An idempotency key is required' using errcode = '22023';
  end if;
  select id into v_id from public.vendor_payments where idempotency_key = p_idempotency_key;
  if v_id is not null then
    return v_id;
  end if;
  if p_payment_date is null then
    raise exception 'Enter the payment date.' using errcode = 'P0001';
  end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment amount must be greater than zero.' using errcode = 'P0001';
  end if;

  select id, organization_id, project_id, status, amount_cents into v_bill from public.vendor_bills where id = p_bill for update;
  if v_bill.id is null or not public.can_manage_project_costs(v_bill.project_id) then
    raise exception 'Bill not found' using errcode = '42501';
  end if;
  if v_bill.status <> 'approved' then
    raise exception 'Only approved bills can be paid.' using errcode = 'P0001';
  end if;

  select coalesce(sum(amount_cents), 0) into v_paid from public.vendor_payments where bill_id = p_bill and reversed_at is null;
  if v_paid + p_amount_cents > v_bill.amount_cents then
    raise exception 'Payment exceeds the unpaid balance of % cents.', v_bill.amount_cents - v_paid using errcode = 'P0001';
  end if;

  insert into public.vendor_payments (organization_id, project_id, bill_id, payment_date, amount_cents, method, reference, idempotency_key, notes)
  values (v_bill.organization_id, v_bill.project_id, p_bill, p_payment_date, p_amount_cents, p_method, nullif(btrim(p_reference), ''), p_idempotency_key, nullif(btrim(p_notes), ''))
  returning id into v_id;
  return v_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_project_schedule(p_project uuid, p_phases uuid[], p_activities uuid[], p_activity_phases uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_phase_count integer;
  v_activity_count integer;
  v_expected integer;
  v_changed integer;
  v_stale constant text := 'The schedule changed since it was loaded. Refresh the page and try again.';
begin
  if p_project is null then raise exception 'Invalid project'; end if;
  p_phases := coalesce(p_phases, '{}');
  p_activities := coalesce(p_activities, '{}');
  p_activity_phases := coalesce(p_activity_phases, '{}');
  if cardinality(p_activities) <> cardinality(p_activity_phases) then raise exception 'Invalid schedule order'; end if;

  perform 1 from public.schedule_phases where project_id = p_project order by id for update;
  perform 1 from public.schedule_activities where project_id = p_project order by id for update;

  select count(*) into v_phase_count from public.schedule_phases where project_id = p_project;
  select count(*) into v_activity_count from public.schedule_activities where project_id = p_project;

  if cardinality(p_phases) <> v_phase_count
     or (select count(distinct x) from unnest(p_phases) x) <> v_phase_count
     or exists (select 1 from unnest(p_phases) x where not exists (
       select 1 from public.schedule_phases ph where ph.id = x and ph.project_id = p_project))
  then raise exception '%', v_stale; end if;

  if cardinality(p_activities) <> v_activity_count
     or (select count(distinct x) from unnest(p_activities) x) <> v_activity_count
     or exists (select 1 from unnest(p_activities) x where not exists (
       select 1 from public.schedule_activities a where a.id = x and a.project_id = p_project))
     or exists (select 1 from unnest(p_activity_phases) x where x is null or not (x = any (p_phases)))
  then raise exception '%', v_stale; end if;

  select count(*) into v_expected
  from unnest(p_phases) with ordinality o(id, ord)
  join public.schedule_phases ph on ph.id = o.id
  where ph.sort_order <> o.ord * 10;

  update public.schedule_phases ph set sort_order = o.ord * 10
  from unnest(p_phases) with ordinality o(id, ord)
  where ph.id = o.id and ph.project_id = p_project and ph.sort_order <> o.ord * 10;
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then raise exception 'You do not have permission to reorder this schedule.'; end if;

  select count(*) into v_expected
  from unnest(p_activities, p_activity_phases) with ordinality o(id, phase_id, ord)
  join public.schedule_activities a on a.id = o.id
  where a.sort_order <> o.ord * 10 or a.phase_id is distinct from o.phase_id;

  update public.schedule_activities a set sort_order = o.ord * 10, phase_id = o.phase_id
  from unnest(p_activities, p_activity_phases) with ordinality o(id, phase_id, ord)
  where a.id = o.id and a.project_id = p_project
    and (a.sort_order <> o.ord * 10 or a.phase_id is distinct from o.phase_id);
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then raise exception 'You do not have permission to reorder this schedule.'; end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_estimate_line_items(p_estimate uuid, p_items jsonb, p_expected_updated_at timestamp with time zone)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_est record;
  v_item jsonb;
  v_pos bigint;
  v_keep uuid[];
  v_updated timestamptz;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid line items';
  end if;
  if jsonb_array_length(p_items) > 1000 then
    raise exception 'An estimate can have at most 1,000 line items';
  end if;

  select e.id, e.organization_id, e.status, e.updated_at
    into v_est
    from public.estimates e
   where e.id = p_estimate
   for update;
  if v_est.id is null then
    raise exception 'Estimate not found';
  end if;
  if not public.is_org_manager(v_est.organization_id) then
    raise exception 'Only managers can edit estimate line items';
  end if;
  if v_est.status not in ('draft', 'internal_review') then
    raise exception 'Line items are locked because this estimate is %. Create a revision to make changes.',
      replace(v_est.status, '_', ' ');
  end if;
  if p_expected_updated_at is not null and v_est.updated_at <> p_expected_updated_at then
    raise exception 'This estimate was changed since you opened it. Reload the page to get the latest version, then reapply your edits.';
  end if;

  v_keep := array(
    select (x->>'id')::uuid from jsonb_array_elements(p_items) x where nullif(x->>'id', '') is not null
  );

  delete from public.estimate_line_items li
   where li.estimate_id = p_estimate
     and not (li.id = any (v_keep));

  for v_item, v_pos in select x, o from jsonb_array_elements(p_items) with ordinality as t(x, o) loop
    if nullif(v_item->>'id', '') is not null then
      update public.estimate_line_items li set
        category = v_item->>'category',
        description = v_item->>'description',
        quantity = (v_item->>'quantity')::numeric,
        unit = v_item->>'unit',
        material_unit_cents = (v_item->>'material_unit_cents')::bigint,
        labor_unit_cents = (v_item->>'labor_unit_cents')::bigint,
        other_unit_cents = (v_item->>'other_unit_cents')::bigint,
        is_allowance = coalesce((v_item->>'is_allowance')::boolean, false),
        notes = nullif(btrim(coalesce(v_item->>'notes', '')), ''),
        sort_order = (v_pos * 10)::integer
       where li.id = (v_item->>'id')::uuid
         and li.estimate_id = p_estimate;
      if not found then
        raise exception 'A line item was removed since you opened this estimate. Reload the page and try again.';
      end if;
    else
      insert into public.estimate_line_items (
        organization_id, estimate_id, category, description, quantity, unit,
        material_unit_cents, labor_unit_cents, other_unit_cents, is_allowance, notes, sort_order
      ) values (
        v_est.organization_id, p_estimate, v_item->>'category', v_item->>'description',
        (v_item->>'quantity')::numeric, v_item->>'unit',
        (v_item->>'material_unit_cents')::bigint, (v_item->>'labor_unit_cents')::bigint,
        (v_item->>'other_unit_cents')::bigint, coalesce((v_item->>'is_allowance')::boolean, false),
        nullif(btrim(coalesce(v_item->>'notes', '')), ''), (v_pos * 10)::integer
      );
    end if;
  end loop;

  update public.estimates e set updated_at = now() where e.id = p_estimate
  returning e.updated_at into v_updated;
  return v_updated;
end;
$function$;

CREATE OR REPLACE FUNCTION public.save_subcontractor_rating(p_company uuid, p_project uuid, p_overall smallint, p_quality smallint, p_schedule_reliability smallint, p_communication smallint, p_cleanliness smallint, p_safety smallint, p_comments text, p_work_confirmed boolean, p_expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_assignment uuid;
  v_r public.subcontractor_ratings;
  v_comments text := nullif(btrim(coalesce(p_comments, '')), '');
  v_id uuid;
begin
  if v_uid is null then raise exception 'Sign in to review subcontractors'; end if;

  select c.organization_id into v_org from public.subcontractor_companies c where c.id = p_company;
  if v_org is null then raise exception 'This subcontractor could not be found'; end if;
  if not public.is_org_manager(v_org) or not public.is_feature_enabled(v_org, 'subcontractors') then
    raise exception 'Only administrators and project managers can review subcontractors';
  end if;

  select a.id into v_assignment from public.subcontractor_project_assignments a
    where a.subcontractor_company_id = p_company and a.project_id = p_project and a.organization_id = v_org
    order by a.created_at desc limit 1;
  if v_assignment is null then raise exception 'This subcontractor is not linked to that project'; end if;

  if p_work_confirmed is not true then
    raise exception 'Confirm that you assessed this company''s work on the project';
  end if;
  if p_overall is null or p_overall not between 1 and 5 then raise exception 'Choose an overall rating from 1 to 5 stars'; end if;
  if (p_quality is not null and p_quality not between 1 and 5)
     or (p_schedule_reliability is not null and p_schedule_reliability not between 1 and 5)
     or (p_communication is not null and p_communication not between 1 and 5)
     or (p_cleanliness is not null and p_cleanliness not between 1 and 5)
     or (p_safety is not null and p_safety not between 1 and 5) then
    raise exception 'Category ratings must be 1 to 5 stars or Not assessed';
  end if;
  if char_length(coalesce(v_comments, '')) > 2000 then raise exception 'Comments are too long'; end if;

  select * into v_r from public.subcontractor_ratings r
    where r.organization_id = v_org and r.subcontractor_company_id = p_company and r.project_id = p_project
      and r.reviewer_id = v_uid
    for update;

  if v_r.id is null then
    if p_expected_revision is not null then
      raise exception 'This review could not be found. Refresh and try again';
    end if;
    insert into public.subcontractor_ratings (
      organization_id, subcontractor_company_id, project_id, project_assignment_id, reviewer_id, overall_rating,
      quality, schedule_reliability, communication, cleanliness, safety, comments, work_confirmed_at)
    values (
      v_org, p_company, p_project, v_assignment, v_uid, p_overall, p_quality, p_schedule_reliability,
      p_communication, p_cleanliness, p_safety, v_comments, now())
    on conflict (organization_id, subcontractor_company_id, project_id, reviewer_id) do nothing
    returning id into v_id;
    if v_id is not null then return v_id; end if;
    select * into v_r from public.subcontractor_ratings r
      where r.organization_id = v_org and r.subcontractor_company_id = p_company and r.project_id = p_project
        and r.reviewer_id = v_uid
      for update;
  end if;

  if v_r.overall_rating = p_overall and v_r.quality is not distinct from p_quality
     and v_r.schedule_reliability is not distinct from p_schedule_reliability
     and v_r.communication is not distinct from p_communication
     and v_r.cleanliness is not distinct from p_cleanliness and v_r.safety is not distinct from p_safety
     and v_r.comments is not distinct from v_comments then
    return v_r.id;
  end if;

  if p_expected_revision is distinct from v_r.revision then
    raise exception 'You already reviewed this project. Refresh to see your latest review before editing it';
  end if;

  update public.subcontractor_ratings set
    overall_rating = p_overall, quality = p_quality, schedule_reliability = p_schedule_reliability,
    communication = p_communication, cleanliness = p_cleanliness, safety = p_safety, comments = v_comments,
    work_confirmed_at = now(), revision = v_r.revision + 1
  where id = v_r.id;
  return v_r.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.schedule_activity_assignments_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_activity record;
  v_company record;
  v_project_status public.project_status;
begin
  if tg_op = 'INSERT' then
    select a.project_id, a.organization_id into v_activity
      from public.schedule_activities a where a.id = new.schedule_activity_id;
    if v_activity.project_id is null then raise exception 'Schedule activity not found'; end if;
    new.project_id := v_activity.project_id;
    new.organization_id := v_activity.organization_id;

    select p.status into v_project_status from public.projects p where p.id = new.project_id;
    if v_project_status is null or not public.project_accepts_new_assignments(v_project_status) then
      raise exception 'New subcontractor assignments are only allowed on projects in preconstruction, construction, or closeout';
    end if;

    select c.organization_id, c.status into v_company
      from public.subcontractor_companies c where c.id = new.subcontractor_company_id;
    if v_company.organization_id is null or v_company.organization_id <> new.organization_id then
      raise exception 'Subcontractor must belong to this organization';
    end if;
    if v_company.status <> 'active' then
      raise exception 'Inactive subcontractors cannot receive new assignments';
    end if;

    new.scope_of_work := btrim(new.scope_of_work);
    new.status := 'active';
    new.assigned_by := auth.uid();
    new.revoked_by := null;
    new.revoked_at := null;
    new.revoke_reason := null;
    return new;
  end if;

  if old.status = 'revoked' then
    raise exception 'Revoked assignments are kept as history and cannot be changed';
  end if;
  if new.organization_id <> old.organization_id or new.project_id <> old.project_id
     or new.schedule_activity_id <> old.schedule_activity_id
     or new.subcontractor_company_id <> old.subcontractor_company_id
     or new.assigned_by is distinct from old.assigned_by or new.created_at <> old.created_at then
    raise exception 'Assignment identity fields cannot be changed; reassign instead';
  end if;
  new.scope_of_work := btrim(new.scope_of_work);
  if new.status = 'revoked' then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  else
    new.revoked_at := null;
    new.revoked_by := null;
    new.revoke_reason := null;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.validate_schedule_dependency()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  if (select count(*) from public.schedule_activities a
      where a.id in (new.predecessor_id, new.successor_id) and a.project_id = new.project_id) <> 2 then
    raise exception 'Both activities must belong to the same project schedule';
  end if;

  perform 1 from public.projects p where p.id = new.project_id for update;

  if exists (
    with recursive downstream(id) as (
      select d.successor_id from public.schedule_dependencies d where d.predecessor_id = new.successor_id
      union
      select d.successor_id from public.schedule_dependencies d join downstream ds on d.predecessor_id = ds.id
    )
    select 1 from downstream where id = new.predecessor_id
  ) then
    raise exception 'This dependency would create a circular schedule';
  end if;
  return new;
end;
$function$;

-- ============ TRIGGERS for the database-only guards ============
drop trigger if exists project_document_versions_guard on public.project_document_versions;
create trigger project_document_versions_guard before delete or update on public.project_document_versions
  for each row execute function public.project_document_versions_guard();

drop trigger if exists signature_events_guard on public.signature_events;
create trigger signature_events_guard before delete or update on public.signature_events
  for each row execute function public.signature_events_guard();

-- ============ PERMISSIONS (as they are live) ============
do $$
declare f text;
begin
  foreach f in array array[
    'public.document_object_unreferenced(text)', 'public.is_project_homeowner_base(uuid)',
    'public.project_document_versions_guard()', 'public.signature_events_guard()',
    'public.accept_invitation(text)', 'public.after_project_change()', 'public.estimate_line_items_guard()',
    'public.portal_approval_items()', 'public.record_vendor_payment(uuid, date, bigint, text, text, uuid, text)',
    'public.reorder_project_schedule(uuid, uuid[], uuid[], uuid[])',
    'public.save_estimate_line_items(uuid, jsonb, timestamptz)',
    'public.save_subcontractor_rating(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, boolean, integer)',
    'public.schedule_activity_assignments_before_write()', 'public.validate_schedule_dependency()'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array[
    'public.claim_email_outbox(text, integer)',
    'public.complete_email_outbox(bigint, text, text, text, text)',
    'public.enqueue_notification_email()',
    'public.notify_invoice_homeowners(uuid, text, text, text, text, boolean)',
    'public.notify_project_staff(uuid, uuid, text, text, text, text, text, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
