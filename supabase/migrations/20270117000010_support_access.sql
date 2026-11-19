-- Support access: a company admin lets Trefort support look at one project, for one support ticket,
-- for a short time.
--
-- How it is enforced:
-- * Platform administrators still have no table policy on any company's records. The only way support sees
--   a company's data is platform_support_view(), which checks every time that the grant exists, belongs to
--   that project, has not expired and has not been revoked. An expired or revoked grant stops working on
--   the very next request: nothing has to clean it up.
-- * The grant is read-only by construction: platform_support_view() only selects, and there is no write
--   function for support. access_level allows only 'read_only' for now, so a write mode has to be added
--   deliberately later, with its own checks.
-- * Every grant, revoke and support page view is written to support_access_events, which the company's
--   admins can read. Nobody can edit or delete entries.

-- ───────── Grants ─────────

create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null,
  ticket_reference text not null,
  reason text,
  access_level text not null default 'read_only',
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users (id) on delete set null,
  constraint support_access_grants_project_org_fkey
    foreign key (project_id, organization_id) references public.projects (id, organization_id) on delete cascade,
  constraint support_access_grants_ticket_length check (char_length(btrim(ticket_reference)) between 3 and 40),
  constraint support_access_grants_reason_length check (reason is null or char_length(reason) <= 500),
  constraint support_access_grants_access_level check (access_level = 'read_only'),
  constraint support_access_grants_window check (expires_at > granted_at and expires_at <= granted_at + interval '4 hours')
);

create index if not exists support_access_grants_org_idx on public.support_access_grants (organization_id, granted_at desc);
create index if not exists support_access_grants_active_idx on public.support_access_grants (expires_at) where revoked_at is null;

alter table public.support_access_grants enable row level security;
drop policy if exists support_access_grants_select on public.support_access_grants;
create policy support_access_grants_select on public.support_access_grants
  for select to authenticated using (public.is_org_admin(organization_id));
-- No insert, update or delete policies: grants change only through the functions below.

-- ───────── Access log ─────────

create table if not exists public.support_access_events (
  id uuid primary key default gen_random_uuid(),
  grant_id uuid references public.support_access_grants (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid,
  actor_id uuid references auth.users (id) on delete set null,
  -- Kept as text so the log still says who it was if the account is later removed.
  actor_name text,
  actor_email text,
  actor_kind text not null,
  action text not null,
  section text,
  created_at timestamptz not null default now(),
  constraint support_access_events_actor_kind check (actor_kind in ('company', 'support')),
  constraint support_access_events_action check (action in ('granted', 'revoked', 'viewed'))
);

create index if not exists support_access_events_org_idx on public.support_access_events (organization_id, created_at desc);
create index if not exists support_access_events_grant_idx on public.support_access_events (grant_id, created_at desc);

alter table public.support_access_events enable row level security;
drop policy if exists support_access_events_select on public.support_access_events;
create policy support_access_events_select on public.support_access_events
  for select to authenticated using (public.is_org_admin(organization_id));
-- No insert, update or delete policies: entries are written only by the functions below and never edited.

-- ───────── Helpers ─────────

create or replace function public.support_log_event(
  p_grant uuid, p_org uuid, p_project uuid, p_kind text, p_action text, p_section text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.support_access_events
    (grant_id, organization_id, project_id, actor_id, actor_name, actor_email, actor_kind, action, section)
  select p_grant, p_org, p_project, auth.uid(),
         (select p.full_name from public.profiles p where p.id = auth.uid()),
         (select u.email::text from auth.users u where u.id = auth.uid()),
         p_kind, p_action, p_section;
$$;

-- ───────── Company admin functions ─────────

create or replace function public.support_grant_access(
  p_project uuid, p_ticket text, p_reason text default null, p_minutes integer default 60
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_ticket text := btrim(coalesce(p_ticket, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_existing timestamptz;
  v_id uuid;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  -- Same message whether the project is missing or belongs to someone else.
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'Only company admins can grant support access to this project' using errcode = '42501';
  end if;
  if char_length(v_ticket) < 3 or char_length(v_ticket) > 40 then
    raise exception 'Enter the support ticket number (3 to 40 characters)';
  end if;
  if v_reason is not null and char_length(v_reason) > 500 then
    raise exception 'Keep the note under 500 characters';
  end if;
  if coalesce(p_minutes, 0) not in (30, 60, 120, 240) then
    raise exception 'Choose 30 minutes, 1 hour, 2 hours or 4 hours';
  end if;

  -- One open grant per project, so there is never doubt about which window applies.
  select g.expires_at into v_existing
  from public.support_access_grants g
  where g.project_id = p_project and g.revoked_at is null and g.expires_at > now()
  limit 1;
  if v_existing is not null then
    raise exception 'Support already has access to this project. Revoke it first to start a new window';
  end if;

  insert into public.support_access_grants
    (organization_id, project_id, ticket_reference, reason, granted_by, granted_at, expires_at)
  values (v_org, p_project, v_ticket, v_reason, auth.uid(), now(), now() + make_interval(mins => p_minutes))
  returning id into v_id;

  perform public.support_log_event(v_id, v_org, p_project, 'company', 'granted');
  return v_id;
end $$;

create or replace function public.support_revoke_access(p_grant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare g public.support_access_grants;
begin
  select * into g from public.support_access_grants where id = p_grant for update;
  if g.id is null or not public.is_org_admin(g.organization_id) then
    raise exception 'Only company admins can revoke support access' using errcode = '42501';
  end if;
  if g.revoked_at is not null or g.expires_at <= now() then
    raise exception 'This support access has already ended';
  end if;
  update public.support_access_grants set revoked_at = now(), revoked_by = auth.uid() where id = p_grant;
  perform public.support_log_event(g.id, g.organization_id, g.project_id, 'company', 'revoked');
end $$;

-- ───────── Support (platform administrator) functions ─────────

create or replace function public.platform_support_grants()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  project_id uuid,
  project_name text,
  project_number text,
  ticket_reference text,
  reason text,
  granted_by_name text,
  granted_by_email text,
  granted_at timestamptz,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_platform_admin();
  return query
  select g.id, g.organization_id, o.display_name, g.project_id, p.name, p.project_number,
         g.ticket_reference, g.reason, pr.full_name, u.email::text, g.granted_at, g.expires_at
  from public.support_access_grants g
  join public.organizations o on o.id = g.organization_id
  join public.projects p on p.id = g.project_id
  left join public.profiles pr on pr.id = g.granted_by
  left join auth.users u on u.id = g.granted_by
  where g.revoked_at is null and g.expires_at > now()
  order by g.expires_at;
end $$;

-- The only door into a company's records for support. Checks the grant, logs the view, returns read-only data
-- for the granted project. Internal notes and homeowner contact details are left out on purpose.
create or replace function public.platform_support_view(p_grant uuid, p_section text default 'overview')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  g public.support_access_grants;
  v_section text := coalesce(p_section, 'overview');
  v_rows jsonb;
  v_project jsonb;
begin
  perform public.assert_platform_admin();
  if v_section not in ('overview', 'schedule', 'daily_logs', 'issues', 'rfis', 'change_orders',
                       'selections', 'estimates', 'invoices', 'documents', 'photos') then
    raise exception 'Unknown section';
  end if;

  select * into g from public.support_access_grants
  where id = p_grant and revoked_at is null and expires_at > now();
  if g.id is null then
    raise exception 'This support access has expired or was revoked' using errcode = '42501';
  end if;

  perform public.support_log_event(g.id, g.organization_id, g.project_id, 'support', 'viewed', v_section);

  select jsonb_build_object(
    'id', p.id, 'name', p.name, 'project_number', p.project_number, 'status', p.status,
    'project_type', p.project_type, 'description', p.description,
    'city', p.city, 'state', p.state, 'community', p.community,
    'progress_percent', p.progress_percent, 'estimated_budget_cents', p.estimated_budget_cents,
    'proposed_start_date', p.proposed_start_date, 'target_completion_date', p.target_completion_date,
    'completion_date', p.completion_date, 'archived_at', p.archived_at,
    'created_at', p.created_at, 'updated_at', p.updated_at,
    'project_manager', (select pr.full_name from public.profiles pr where pr.id = p.project_manager_id),
    'client', (select coalesce(nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''), c.company_name)
               from public.clients c where c.id = p.primary_client_id)
  ) into v_project
  from public.projects p where p.id = g.project_id;

  if v_section = 'overview' then
    v_rows := jsonb_build_array(jsonb_build_object(
      'schedule', (select count(*) from public.schedule_activities x where x.project_id = g.project_id),
      'daily_logs', (select count(*) from public.daily_logs x where x.project_id = g.project_id),
      'issues', (select count(*) from public.project_issues x where x.project_id = g.project_id),
      'rfis', (select count(*) from public.project_rfis x where x.project_id = g.project_id),
      'change_orders', (select count(*) from public.change_orders x where x.project_id = g.project_id),
      'selections', (select count(*) from public.selections x where x.project_id = g.project_id),
      'estimates', (select count(*) from public.estimates x where x.project_id = g.project_id),
      'invoices', (select count(*) from public.invoices x where x.project_id = g.project_id),
      'documents', (select count(*) from public.project_documents x where x.project_id = g.project_id and x.archived_at is null),
      'photos', (select count(*) from public.project_photos x where x.project_id = g.project_id and x.deleted_at is null)
    ));
  elsif v_section = 'schedule' then
    select coalesce(jsonb_agg(r order by r.sort_order, r.planned_start), '[]') into v_rows from (
      select x.id, x.name, x.phase, x.status, x.planned_start, x.planned_end, x.actual_start, x.actual_end,
             x.percent_complete, x.delay_reason, x.is_published, x.sort_order
      from public.schedule_activities x where x.project_id = g.project_id
      order by x.sort_order, x.planned_start limit 300) r;
  elsif v_section = 'daily_logs' then
    select coalesce(jsonb_agg(r order by r.log_date desc), '[]') into v_rows from (
      select x.id, x.log_date, x.status, x.weather_conditions, x.temperature_f, x.work_performed,
             x.has_delays, x.delay_description, x.finalized_at
      from public.daily_logs x where x.project_id = g.project_id
      order by x.log_date desc limit 200) r;
  elsif v_section = 'issues' then
    select coalesce(jsonb_agg(r order by r.reported_at desc), '[]') into v_rows from (
      select x.id, x.item_label, x.category, x.status, x.priority, x.due_date, x.location,
             x.homeowner_description, x.reported_source, x.reported_at
      from public.project_issues x where x.project_id = g.project_id
      order by x.reported_at desc limit 200) r;
  elsif v_section = 'rfis' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]') into v_rows from (
      select x.id, x.rfi_number, x.subject, x.status, x.priority, x.due_date, x.responder_name,
             x.sent_at, x.answered_at, x.closed_at, x.created_at
      from public.project_rfis x where x.project_id = g.project_id
      order by x.created_at desc limit 200) r;
  elsif v_section = 'change_orders' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]') into v_rows from (
      select x.id, x.co_number, x.title, x.status, x.price_adjustment_cents, x.schedule_impact_days,
             x.sent_to_homeowner_at, x.decision_at, x.voided_at, x.created_at
      from public.change_orders x where x.project_id = g.project_id
      order by x.created_at desc limit 200) r;
  elsif v_section = 'selections' then
    select coalesce(jsonb_agg(r order by r.due_date nulls last, r.name), '[]') into v_rows from (
      select x.id, x.name, x.category, x.location, x.status, x.allowance_cents, x.selected_price_cents,
             x.due_date, x.decided_at
      from public.selections x where x.project_id = g.project_id
      order by x.due_date nulls last, x.name limit 300) r;
  elsif v_section = 'estimates' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]') into v_rows from (
      select x.id, x.estimate_number, x.name, x.revision, x.status, x.construction_total_cents,
             x.estimate_date, x.expiration_date, x.decision_at, x.created_at
      from public.estimates x where x.project_id = g.project_id
      order by x.created_at desc limit 100) r;
  elsif v_section = 'invoices' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]') into v_rows from (
      select x.id, x.invoice_number, x.title, x.invoice_type, x.status, x.total_cents, x.paid_cents,
             x.invoice_date, x.due_date, x.accounting_sync_status, x.created_at
      from public.invoices x where x.project_id = g.project_id
      order by x.created_at desc limit 200) r;
  elsif v_section = 'documents' then
    select coalesce(jsonb_agg(r order by r.updated_at desc), '[]') into v_rows from (
      select x.id, x.name, x.category, x.visibility, x.current_version_number, x.updated_at
      from public.project_documents x where x.project_id = g.project_id and x.archived_at is null
      order by x.updated_at desc limit 300) r;
  elsif v_section = 'photos' then
    select coalesce(jsonb_agg(r order by r.created_at desc), '[]') into v_rows from (
      select x.id, x.file_name, x.caption, x.phase, x.location, x.created_at
      from public.project_photos x where x.project_id = g.project_id and x.deleted_at is null
      order by x.created_at desc limit 300) r;
  end if;

  return jsonb_build_object(
    'grant', jsonb_build_object(
      'id', g.id, 'ticket_reference', g.ticket_reference, 'reason', g.reason,
      'granted_at', g.granted_at, 'expires_at', g.expires_at, 'access_level', g.access_level,
      'organization_name', (select o.display_name from public.organizations o where o.id = g.organization_id)
    ),
    'project', v_project,
    'section', v_section,
    'rows', coalesce(v_rows, '[]'::jsonb)
  );
end $$;

-- ───────── Access ─────────

do $$
declare f text;
begin
  foreach f in array array[
    'public.support_grant_access(uuid, text, text, integer)',
    'public.support_revoke_access(uuid)',
    'public.platform_support_grants()',
    'public.platform_support_view(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- Internal helper: callable only from the functions above.
revoke execute on function public.support_log_event(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

-- Company admins read through the select policies above; nobody writes to these tables directly.
revoke all on public.support_access_grants, public.support_access_events from anon;
revoke insert, update, delete, truncate on public.support_access_grants, public.support_access_events from authenticated;
grant select on public.support_access_grants, public.support_access_events to authenticated;

notify pgrst, 'reload schema';
