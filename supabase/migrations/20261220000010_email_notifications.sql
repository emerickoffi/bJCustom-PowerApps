-- Email delivery for Trefort notifications.
--
-- Every workflow already writes in-app rows to public.notifications inside its own
-- transaction. An AFTER INSERT trigger copies each row into public.email_outbox in that
-- same transaction, so an email exists only if the business change committed, and a
-- rolled-back change never produces an email. A server worker (/api/cron/email-dispatch)
-- claims due rows with FOR UPDATE SKIP LOCKED and sends them through the provider using
-- the row's event_key as the provider idempotency key.

-- ---------------------------------------------------------------------------
-- Outbox
-- ---------------------------------------------------------------------------
create table if not exists public.email_outbox (
  id bigint generated always as identity primary key,
  event_key text not null unique check (char_length(event_key) between 3 and 200),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  notification_id uuid references public.notifications(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  recipient_email text,
  category text not null,
  template text not null default 'notification'
    check (template in ('notification', 'staff_invitation', 'client_invitation', 'portal_access')),
  payload jsonb not null default '{}'::jsonb,
  -- accepted = the provider accepted the message for delivery. It does not prove inbox delivery.
  status text not null default 'queued'
    check (status in ('queued', 'sending', 'accepted', 'failed', 'skipped')),
  skip_reason text,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 6 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_outbox_due
  on public.email_outbox (next_attempt_at, id) where status in ('queued', 'sending');
create index if not exists email_outbox_org_recent
  on public.email_outbox (organization_id, created_at desc);
create index if not exists email_outbox_user_recent
  on public.email_outbox (user_id, created_at desc) where user_id is not null;

alter table public.email_outbox enable row level security;
-- Intentionally no policies: rows can hold invitation links, so only the service role
-- and the security-definer functions below read or write them.
revoke all on public.email_outbox from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Preferences (one row per user per optional category; absence = default)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_email_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in
    ('project_updates', 'quote_requests', 'rfi_activity', 'change_orders', 'invoice_reminders', 'punch_list')),
  email_enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

alter table public.notification_email_preferences enable row level security;
drop policy if exists email_prefs_select_own on public.notification_email_preferences;
create policy email_prefs_select_own on public.notification_email_preferences
  for select to authenticated using (user_id = auth.uid());
drop policy if exists email_prefs_insert_own on public.notification_email_preferences;
create policy email_prefs_insert_own on public.notification_email_preferences
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists email_prefs_update_own on public.notification_email_preferences;
create policy email_prefs_update_own on public.notification_email_preferences
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists email_prefs_delete_own on public.notification_email_preferences;
create policy email_prefs_delete_own on public.notification_email_preferences
  for delete to authenticated using (user_id = auth.uid());

-- Mirrors lib/email/categories.ts. Required categories (billing, signatures, account)
-- cannot be turned off; project_updates is opt-in to keep inboxes quiet.
create or replace function public.email_category_for_kind(p_kind text)
returns text language sql immutable set search_path = '' as $$
  select case
    when p_kind = 'subcontract_quote' then 'quote_requests'
    when p_kind = 'rfi' then 'rfi_activity'
    when p_kind = 'change_order' then 'change_orders'
    when p_kind = 'invoice' then 'billing'
    when p_kind = 'invoice_reminder' then 'invoice_reminders'
    when p_kind = 'signature_request' then 'signatures'
    when p_kind like 'issue%' or p_kind in ('subcontractor_work', 'punch_list') then 'punch_list'
    else 'project_updates'
  end;
$$;

create or replace function public.email_category_enabled(p_user uuid, p_category text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when p_category in ('billing', 'signatures', 'account') then true
    else coalesce(
      (select p.email_enabled from public.notification_email_preferences p
        where p.user_id = p_user and p.category = p_category),
      p_category <> 'project_updates')
  end;
$$;

-- A recipient must still belong to the organization that produced the notification:
-- an active membership, or an active subcontractor portal account.
create or replace function public.email_recipient_in_org(p_org uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = p_user and m.status = 'active')
  or exists (
    select 1 from public.subcontractor_portal_accounts a
    where a.organization_id = p_org and a.user_id = p_user and a.status = 'active');
$$;

-- ---------------------------------------------------------------------------
-- notifications -> email_outbox (same transaction)
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_notification_email()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_category text := public.email_category_for_kind(new.kind);
  v_email text;
  v_status text := 'queued';
  v_reason text;
  v_org text;
  v_project text;
  v_action boolean := coalesce(new.action_required, false);
begin
  -- Email is best effort relative to the business change: never fail the workflow.
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
        -- Bursts of informational updates on one record collapse into the first email.
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
$$;

drop trigger if exists notifications_enqueue_email on public.notifications;
create trigger notifications_enqueue_email
  after insert on public.notifications
  for each row execute function public.enqueue_notification_email();

-- ---------------------------------------------------------------------------
-- Change orders: staff notifications on review / decision transitions
-- ---------------------------------------------------------------------------
create or replace function public.notify_project_staff(
  p_org uuid, p_project uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text, p_action boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pm uuid;
begin
  select p.project_manager_id into v_pm from public.projects p where p.id = p_project and p.organization_id = p_org;
  if v_pm is not null and not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = v_pm and m.status = 'active'
      and m.role in ('org_admin', 'project_manager')) then
    v_pm := null;
  end if;

  -- The assigned project manager when there is one, otherwise the organization admins.
  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, dedupe_key, action_required)
  select p_org, m.user_id, p_title, p_body, p_link, p_kind, p_project, p_dedupe, p_action
  from public.organization_memberships m
  where m.organization_id = p_org and m.status = 'active'
    and ((v_pm is not null and m.user_id = v_pm) or (v_pm is null and m.role = 'org_admin'))
    and m.user_id is distinct from auth.uid()
  on conflict do nothing;
end;
$$;

create or replace function public.change_order_status_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_link text := '/projects/' || new.project_id || '/change-orders/' || new.id;
  v_label text := new.co_number || ' · ' || left(new.title, 120);
begin
  if new.status is not distinct from old.status then return new; end if;
  begin
    if new.status = 'internal_review' then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        'Change order ready for internal review', v_label, v_link,
        'co:' || new.id || ':review:' || new.version, true);
    elsif new.status = 'approved' then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        'Change order approved', v_label, v_link, 'co:' || new.id || ':approved', false);
    elsif new.status = 'rejected' then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        'Change order rejected', v_label, v_link, 'co:' || new.id || ':rejected', true);
    elsif new.status = 'draft' and old.status in ('internal_review', 'awaiting_homeowner') then
      perform public.notify_project_staff(new.organization_id, new.project_id, 'change_order',
        'Change order returned for revision', v_label, v_link,
        'co:' || new.id || ':revision:' || new.version || ':' || old.status, true);
    end if;
  exception when others then
    raise warning 'change order notification skipped for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists change_orders_status_notify on public.change_orders;
create trigger change_orders_status_notify
  after update of status on public.change_orders
  for each row execute function public.change_order_status_notify();

-- ---------------------------------------------------------------------------
-- Invoices: homeowner notifications (issued, payment recorded, reminders)
-- ---------------------------------------------------------------------------
create or replace function public.notify_invoice_homeowners(
  p_invoice uuid, p_kind text, p_title text, p_body text, p_dedupe text, p_action boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_inv record;
begin
  select i.id, i.organization_id, i.project_id, i.client_id, i.status, i.portal_published
    into v_inv from public.invoices i where i.id = p_invoice;
  if v_inv.id is null or not v_inv.portal_published or v_inv.status in ('draft', 'voided') then return; end if;
  if not public.is_feature_enabled(v_inv.organization_id, 'portal') then return; end if;

  -- Owners on the project (the billed client plus primary/co-owners); authorized
  -- contacts are not billing recipients.
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
$$;

create or replace function public.invoice_homeowner_notify()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_label text := coalesce(nullif(new.invoice_number, ''), 'Invoice') || ' · ' || left(new.title, 120);
begin
  begin
    if new.portal_published and new.status in ('issued', 'partially_paid')
       and (old.status = 'draft' or not old.portal_published or new.issue_version <> old.issue_version) then
      perform public.notify_invoice_homeowners(new.id, 'invoice', 'New invoice ready to review',
        v_label || ' · Due ' || to_char(new.due_date, 'Mon FMDD, YYYY'),
        'invoice:' || new.id || ':issued:' || new.issue_version, true);
    elsif new.paid_cents > old.paid_cents and new.status in ('partially_paid', 'paid') then
      perform public.notify_invoice_homeowners(new.id, 'invoice',
        case when new.status = 'paid' then 'Invoice paid in full' else 'Payment recorded on your invoice' end,
        v_label, 'invoice:' || new.id || ':paid:' || new.paid_cents, false);
    end if;
  exception when others then
    raise warning 'invoice notification skipped for %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists invoices_homeowner_notify on public.invoices;
create trigger invoices_homeowner_notify
  after update of status, portal_published, paid_cents, issue_version on public.invoices
  for each row execute function public.invoice_homeowner_notify();

create or replace function public.run_invoice_reminders()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_soon int := 0; v_overdue int := 0;
begin
  for r in
    select i.id, i.due_date, coalesce(nullif(i.invoice_number, ''), 'Invoice') || ' · ' || left(i.title, 120) as label
    from public.invoices i
    where i.portal_published and i.status in ('issued', 'partially_paid')
      and i.due_date in (current_date + 3, current_date - 1)
  loop
    if r.due_date > current_date then
      perform public.notify_invoice_homeowners(r.id, 'invoice_reminder', 'Invoice due in 3 days',
        r.label || ' · Due ' || to_char(r.due_date, 'Mon FMDD, YYYY'), 'invoice:' || r.id || ':due_soon:' || r.due_date, true);
      v_soon := v_soon + 1;
    else
      perform public.notify_invoice_homeowners(r.id, 'invoice_reminder', 'Invoice past due',
        r.label || ' · Was due ' || to_char(r.due_date, 'Mon FMDD, YYYY'), 'invoice:' || r.id || ':overdue:' || r.due_date, true);
      v_overdue := v_overdue + 1;
    end if;
  end loop;
  return jsonb_build_object('due_soon', v_soon, 'overdue', v_overdue);
end;
$$;

-- Company-wide quote deliveries can stay pending when the inline attempt failed or ran
-- before a portal account existed; sweep them so they do not rely on a page visit.
create or replace function public.sweep_quote_outbox()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r record; v_n int := 0;
begin
  for r in
    select distinct o.request_id from public.subcontract_quote_outbox o
    where o.delivered_at is null and o.attempts < 20
    limit 200
  loop
    begin
      perform public.quote_outbox_try_deliver(r.request_id);
      v_n := v_n + 1;
    exception when others then
      raise warning 'quote outbox sweep failed for %: %', r.request_id, sqlerrm;
    end;
  end loop;
  return jsonb_build_object('requests', v_n);
end;
$$;

create or replace function public.run_email_notification_jobs()
returns void language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  v_result := jsonb_build_object('invoices', public.run_invoice_reminders(), 'quotes', public.sweep_quote_outbox());
  insert into public.scheduled_job_runs (job_name, result) values ('email_notifications_daily', v_result);
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname in ('email_notifications_daily', 'quote_outbox_sweep');
    perform cron.schedule('email_notifications_daily', '0 13 * * *', 'select public.run_email_notification_jobs()');
    perform cron.schedule('quote_outbox_sweep', '*/10 * * * *', 'select public.sweep_quote_outbox()');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Worker RPCs (service role only)
-- ---------------------------------------------------------------------------
create or replace function public.claim_email_outbox(p_worker text, p_limit integer default 25)
returns setof public.email_outbox language plpgsql security definer set search_path = '' as $$
begin
  -- A row stuck in 'sending' (worker crashed mid-send) is reclaimable after 10 minutes;
  -- the provider idempotency key makes the resend safe.
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
$$;

create or replace function public.complete_email_outbox(
  p_id bigint, p_worker text, p_outcome text, p_message_id text default null, p_error text default null)
returns boolean language plpgsql security definer set search_path = '' as $$
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
    -- Exponential backoff: 1, 2, 4, 8, 16 minutes (capped at 1 hour).
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
$$;

-- ---------------------------------------------------------------------------
-- Admin visibility and manual retry (organization admins only)
-- ---------------------------------------------------------------------------
create or replace function public.email_delivery_overview(p_org uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active' and m.role = 'org_admin') then
    return null;
  end if;
  return jsonb_build_object(
    'counts', (select coalesce(jsonb_object_agg(s.status, s.n), '{}'::jsonb) from (
       select e.status, count(*) as n from public.email_outbox e
       where e.organization_id = p_org and e.created_at > now() - interval '7 days' group by e.status) s),
    'oldest_queued_at', (select min(e.created_at) from public.email_outbox e
       where e.organization_id = p_org and e.status in ('queued', 'sending')),
    'recent_failures', (select coalesce(jsonb_agg(to_jsonb(f) order by f.updated_at desc), '[]'::jsonb) from (
       select e.id, e.category, e.recipient_email, e.last_error, e.attempts, e.updated_at
       from public.email_outbox e
       where e.organization_id = p_org and e.status = 'failed'
       order by e.updated_at desc limit 10) f));
end;
$$;

create or replace function public.retry_failed_email(p_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  update public.email_outbox e
     set status = 'queued', attempts = 0, next_attempt_at = now(), last_error = null, updated_at = now()
   where e.id = p_id and e.status = 'failed'
     and exists (select 1 from public.organization_memberships m
       where m.organization_id = e.organization_id and m.user_id = auth.uid()
         and m.status = 'active' and m.role = 'org_admin');
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;

-- Functions are executable by PUBLIC by default; lock everything down explicitly.
revoke execute on function public.email_category_enabled(uuid, text) from public, anon, authenticated;
revoke execute on function public.email_recipient_in_org(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.enqueue_notification_email() from public, anon, authenticated;
revoke execute on function public.notify_project_staff(uuid, uuid, text, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.change_order_status_notify() from public, anon, authenticated;
revoke execute on function public.notify_invoice_homeowners(uuid, text, text, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.invoice_homeowner_notify() from public, anon, authenticated;
revoke execute on function public.run_invoice_reminders() from public, anon, authenticated;
revoke execute on function public.sweep_quote_outbox() from public, anon, authenticated;
revoke execute on function public.run_email_notification_jobs() from public, anon, authenticated;
revoke execute on function public.claim_email_outbox(text, integer) from public, anon, authenticated;
revoke execute on function public.complete_email_outbox(bigint, text, text, text, text) from public, anon, authenticated;
grant execute on function public.claim_email_outbox(text, integer) to service_role;
grant execute on function public.complete_email_outbox(bigint, text, text, text, text) to service_role;
revoke execute on function public.email_delivery_overview(uuid) from public, anon;
grant execute on function public.email_delivery_overview(uuid) to authenticated;
revoke execute on function public.retry_failed_email(bigint) from public, anon;
grant execute on function public.retry_failed_email(bigint) to authenticated;
