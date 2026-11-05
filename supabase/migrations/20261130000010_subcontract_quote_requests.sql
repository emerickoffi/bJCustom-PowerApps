-- Project-scoped subcontractor quote requests. Additive only.
--
-- Requires 20261102000010, 20261121000010, 20261129000010 and 20261129000020 (portal accounts, sub_company_ids,
-- can_review_sub_project, portal company read).
--
-- * One request = one scope package (roofing, electrical, ...) inside one project; a project may have many.
-- * Lifecycle: draft -> open -> closed, plus cancelled. Closing never implies a winner. Nothing is deleted.
-- * Invitations grant invitation-specific portal access; no work assignment and no organization membership is created.
-- * A company has ONE response per request: a single shared draft plus immutable submitted revisions.
-- * Every published scope is a numbered, immutable version that pins the exact document versions issued.
-- * All writes go through the security-definer functions below, which re-check caller, company, invitation, project,
--   organization and feature access on every call. Tables have SELECT policies only.
-- * Notifications are written to a durable outbox in the same transaction and delivered to the existing
--   in-app notifications table with per-recipient dedupe. Delivery failure never rolls back a committed write.
-- * No comparison, award, rejection, or commitment creation is implemented here.

-- ───────────────────────── Project currency (explicit, never guessed) ─────────────────────────
alter table public.projects
  add column if not exists currency text check (currency is null or currency ~ '^[A-Z]{3}$');

-- ───────────────────────── Capabilities ─────────────────────────
-- Defaults: organization administrators and project managers with internal project access, with the
-- 'subcontractors' feature enabled. Kept as three functions so each capability can diverge later.
create or replace function public.can_view_quotes(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_review_sub_project(p_org, p_project);
$$;
create or replace function public.can_manage_quotes(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_review_sub_project(p_org, p_project);
$$;
create or replace function public.can_review_quotes(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_review_sub_project(p_org, p_project);
$$;

-- ───────────────────────── Requests ─────────────────────────
create table public.subcontract_quote_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 160),
  trade text check (trade is null or char_length(trade) <= 80),
  status text not null default 'draft' check (status in ('draft', 'open', 'closed', 'cancelled')),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  response_deadline timestamptz,
  deadline_timezone text check (deadline_timezone is null or char_length(deadline_timezone) <= 64),
  draft_scope text not null default '' check (char_length(draft_scope) <= 20000),
  draft_document_ids uuid[] not null default '{}',
  current_scope_version integer not null default 0 check (current_scope_version >= 0),
  cost_category text check (cost_category is null or char_length(cost_category) <= 80),
  schedule_activity_id uuid references public.schedule_activities(id) on delete set null,
  work_window_start date,
  work_window_end date,
  row_version integer not null default 1,
  created_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sqr_window check (work_window_start is null or work_window_end is null or work_window_end >= work_window_start),
  constraint sqr_issued_complete check (
    status = 'draft' or status = 'cancelled'
    or (currency is not null and response_deadline is not null and deadline_timezone is not null and current_scope_version >= 1))
);
create index sqr_project_idx on public.subcontract_quote_requests (project_id, status, updated_at desc);
create trigger sqr_updated_at before update on public.subcontract_quote_requests
  for each row execute function public.set_updated_at();

-- ───────────────────────── Scope versions (immutable) ─────────────────────────
create table public.subcontract_quote_scope_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.subcontract_quote_requests(id) on delete restrict,
  version integer not null check (version >= 1),
  scope text not null check (char_length(btrim(scope)) between 1 and 20000),
  -- [{document_id, version_id, version_number, name, filename}] as issued; never follows later file replacements.
  documents jsonb not null default '[]'::jsonb check (jsonb_typeof(documents) = 'array'),
  change_summary text check (change_summary is null or char_length(change_summary) <= 2000),
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (request_id, version)
);

-- ───────────────────────── Invitations ─────────────────────────
create table public.subcontract_quote_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.subcontract_quote_requests(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  status text not null default 'invited' check (status in ('invited', 'declined')),
  decline_reason text check (decline_reason is null or char_length(decline_reason) <= 2000),
  declined_at timestamptz,
  declined_by uuid references auth.users(id) on delete set null,
  revision_requested_at timestamptz,
  revision_instructions text check (revision_instructions is null or char_length(revision_instructions) <= 4000),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (request_id, subcontractor_company_id),
  constraint sqi_declined_state check ((status = 'declined') = (declined_at is not null))
);
create index sqi_company_idx on public.subcontract_quote_invitations (subcontractor_company_id, request_id);
create trigger sqi_updated_at before update on public.subcontract_quote_invitations
  for each row execute function public.set_updated_at();

-- ───────────────────────── Responses: one shared draft + immutable submitted revisions ─────────────────────────
create table public.subcontract_quote_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.subcontract_quote_requests(id) on delete restrict,
  invitation_id uuid not null references public.subcontract_quote_invitations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  revision_number integer not null check (revision_number >= 1),
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  previous_revision_id uuid references public.subcontract_quote_revisions(id) on delete restrict,
  scope_version integer check (scope_version is null or scope_version >= 1),
  amount_cents bigint check (amount_cents is null or amount_cents between 0 and 100000000000000),
  tax_treatment text check (tax_treatment is null or tax_treatment in ('included', 'excluded', 'not_applicable')),
  -- Only meaningful when tax is excluded. NULL there means "unknown", never zero.
  tax_amount_cents bigint check (tax_amount_cents is null or tax_amount_cents between 0 and 100000000000000),
  tax_details text check (tax_details is null or char_length(tax_details) <= 1000),
  inclusions text check (inclusions is null or char_length(inclusions) <= 10000),
  exclusions text check (exclusions is null or char_length(exclusions) <= 10000),
  availability text check (availability is null or char_length(availability) <= 1000),
  allowances text check (allowances is null or char_length(allowances) <= 5000),
  assumptions text check (assumptions is null or char_length(assumptions) <= 5000),
  -- [{description, amount_cents}] — never added to the base amount.
  alternates jsonb not null default '[]'::jsonb check (jsonb_typeof(alternates) = 'array'),
  estimated_duration_days integer check (estimated_duration_days is null or estimated_duration_days between 1 and 3650),
  valid_until date,
  row_version integer not null default 1,
  idempotency_key uuid unique,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (invitation_id, revision_number),
  constraint sqrev_tax_shape check (tax_treatment = 'excluded' or tax_amount_cents is null),
  constraint sqrev_submitted_complete check (
    status = 'draft'
    or (submitted_at is not null and scope_version is not null and amount_cents is not null and tax_treatment is not null))
);
create unique index sqrev_one_draft on public.subcontract_quote_revisions (invitation_id) where status = 'draft';
create index sqrev_request_idx on public.subcontract_quote_revisions (request_id, status, submitted_at desc);
create trigger sqrev_updated_at before update on public.subcontract_quote_revisions
  for each row execute function public.set_updated_at();

-- ───────────────────────── History (append-only) ─────────────────────────
create table public.subcontract_quote_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.subcontract_quote_requests(id) on delete restrict,
  invitation_id uuid references public.subcontract_quote_invitations(id) on delete restrict,
  revision_id uuid references public.subcontract_quote_revisions(id) on delete restrict,
  event_type text not null check (event_type in (
    'created', 'sent', 'invited', 'amended', 'deadline_changed', 'closed', 'reopened', 'cancelled',
    'submitted', 'revision_requested', 'declined')),
  -- Company-visible events are shown only to the invitation's company (or to every invitee when invitation_id is null).
  company_visible boolean not null default false,
  actor_id uuid references auth.users(id) on delete set null,
  message text check (message is null or char_length(message) <= 4000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index sqe_request_idx on public.subcontract_quote_events (request_id, created_at);

-- ───────────────────────── Private attachments ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subcontract-quotes', 'subcontract-quotes', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/msword', 'text/csv'])
on conflict (id) do nothing;

create table public.subcontract_quote_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  revision_id uuid not null references public.subcontract_quote_revisions(id) on delete restrict,
  -- {organization_id}/{invitation_id}/{uuid}-{filename}; copied rows on a later revision reuse the same object.
  storage_path text not null check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  content_type text check (content_type is null or char_length(content_type) <= 120),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (revision_id, storage_path)
);
create index sqa_revision_idx on public.subcontract_quote_attachments (revision_id);
create index sqa_path_idx on public.subcontract_quote_attachments (storage_path);

-- ───────────────────────── Durable notification outbox ─────────────────────────
create table public.subcontract_quote_outbox (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  request_id uuid not null references public.subcontract_quote_requests(id) on delete restrict,
  event_key text not null unique,
  audience text not null check (audience in ('builder', 'company')),
  invitation_id uuid references public.subcontract_quote_invitations(id) on delete restrict,
  actor_id uuid,
  title text not null,
  body text,
  link text not null,
  action_required boolean not null default true,
  attempts integer not null default 0,
  last_error text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  constraint sqo_company_target check (audience = 'builder' or invitation_id is not null)
);
create index sqo_pending_idx on public.subcontract_quote_outbox (request_id) where delivered_at is null;

-- ───────────────────────── Integrity guards ─────────────────────────
create or replace function public.subcontract_quote_append_only()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% rows are kept as history and cannot be changed', tg_table_name;
end;
$$;
create trigger sqsv_append_only before update or delete on public.subcontract_quote_scope_versions
  for each row execute function public.subcontract_quote_append_only();
create trigger sqe_append_only before update or delete on public.subcontract_quote_events
  for each row execute function public.subcontract_quote_append_only();

create or replace function public.subcontract_quote_requests_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' or old.sent_at is not null then
      raise exception 'Issued quote requests are kept as history; cancel instead';
    end if;
    return old;
  end if;
  if new.organization_id <> old.organization_id or new.project_id <> old.project_id or new.created_at <> old.created_at then
    raise exception 'A quote request cannot move between projects or organizations';
  end if;
  if old.status <> 'draft' and new.currency is distinct from old.currency then
    raise exception 'The currency of an issued request cannot change';
  end if;
  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled request cannot be reopened';
  end if;
  return new;
end;
$$;
create trigger sqr_guard before update or delete on public.subcontract_quote_requests
  for each row execute function public.subcontract_quote_requests_guard();

create or replace function public.subcontract_quote_invitations_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_req public.subcontract_quote_requests;
begin
  if tg_op = 'DELETE' then
    select * into v_req from public.subcontract_quote_requests where id = old.request_id;
    if v_req.status <> 'draft' then raise exception 'Invitations on an issued request are kept as history'; end if;
    return old;
  end if;
  select * into v_req from public.subcontract_quote_requests where id = new.request_id;
  if tg_op = 'INSERT' then
    if new.organization_id <> v_req.organization_id then raise exception 'Invitation organization mismatch'; end if;
    if not exists (select 1 from public.subcontractor_companies c
                   where c.id = new.subcontractor_company_id and c.organization_id = v_req.organization_id and c.status = 'active') then
      raise exception 'Only active subcontractor companies in this organization can be invited';
    end if;
    return new;
  end if;
  if new.request_id <> old.request_id or new.subcontractor_company_id <> old.subcontractor_company_id
     or new.organization_id <> old.organization_id then
    raise exception 'Invitation identity cannot be changed';
  end if;
  return new;
end;
$$;
create trigger sqi_guard before insert or update or delete on public.subcontract_quote_invitations
  for each row execute function public.subcontract_quote_invitations_guard();

create or replace function public.subcontract_quote_revisions_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Quote revisions are kept as history'; end if;
  if old.status = 'submitted' then raise exception 'A submitted quote revision is a permanent record and cannot be changed'; end if;
  if new.invitation_id <> old.invitation_id or new.request_id <> old.request_id
     or new.subcontractor_company_id <> old.subcontractor_company_id or new.revision_number <> old.revision_number
     or new.organization_id <> old.organization_id then
    raise exception 'Quote revision identity cannot be changed';
  end if;
  return new;
end;
$$;
create trigger sqrev_guard before update or delete on public.subcontract_quote_revisions
  for each row execute function public.subcontract_quote_revisions_guard();

create or replace function public.subcontract_quote_attachments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if tg_op = 'UPDATE' then raise exception 'Quote attachments cannot be changed'; end if;
  select status into v_status from public.subcontract_quote_revisions
   where id = case when tg_op = 'DELETE' then old.revision_id else new.revision_id end;
  if v_status is distinct from 'draft' then
    raise exception 'Attachments on a submitted quote are a permanent record';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
create trigger sqa_guard before insert or update or delete on public.subcontract_quote_attachments
  for each row execute function public.subcontract_quote_attachments_guard();

-- ───────────────────────── Access helpers ─────────────────────────
-- Invitations the caller's company may see right now. Draft requests are never visible to invitees.
create or replace function public.sub_quote_invitation_ok(p_invitation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subcontract_quote_invitations i
    join public.subcontract_quote_requests r on r.id = i.request_id
    where i.id = p_invitation and r.status <> 'draft'
      and i.subcontractor_company_id in (select public.sub_company_ids())
  );
$$;

create or replace function public.can_view_quote_request(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subcontract_quote_requests r
    where r.id = p_request
      and (public.can_view_quotes(r.organization_id, r.project_id)
           or exists (select 1 from public.subcontract_quote_invitations i
                      where i.request_id = r.id and public.sub_quote_invitation_ok(i.id)))
  );
$$;

create or replace function public.quote_invitation_from_path(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
              then split_part(p_name, '/', 2)::uuid end;
$$;

-- A file is visible to its company always, and to builder reviewers only once it is part of a submitted revision.
create or replace function public.can_read_quote_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.sub_quote_invitation_ok(public.quote_invitation_from_path(p_name))
      or exists (
        select 1 from public.subcontract_quote_attachments a
        join public.subcontract_quote_revisions v on v.id = a.revision_id and v.status = 'submitted'
        where a.storage_path = p_name and public.can_review_quotes(v.organization_id,
              (select r.project_id from public.subcontract_quote_requests r where r.id = v.request_id))
      );
$$;

create or replace function public.can_upload_quote_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subcontract_quote_invitations i
    join public.subcontract_quote_requests r on r.id = i.request_id and r.status = 'open'
    join public.subcontract_quote_revisions v on v.invitation_id = i.id and v.status = 'draft'
    where i.id = public.quote_invitation_from_path(p_name)
      and i.status = 'invited'
      and split_part(p_name, '/', 1) = i.organization_id::text
      and public.sub_quote_invitation_ok(i.id)
  );
$$;

-- ───────────────────────── RLS (read-only for clients) ─────────────────────────
alter table public.subcontract_quote_requests enable row level security;
alter table public.subcontract_quote_scope_versions enable row level security;
alter table public.subcontract_quote_invitations enable row level security;
alter table public.subcontract_quote_revisions enable row level security;
alter table public.subcontract_quote_events enable row level security;
alter table public.subcontract_quote_attachments enable row level security;
alter table public.subcontract_quote_outbox enable row level security;

create policy sqr_select on public.subcontract_quote_requests for select to authenticated
  using (public.can_view_quote_request(id));
create policy sqsv_select on public.subcontract_quote_scope_versions for select to authenticated
  using (public.can_view_quote_request(request_id));
create policy sqi_select on public.subcontract_quote_invitations for select to authenticated
  using (public.sub_quote_invitation_ok(id)
         or public.can_view_quotes(organization_id, (select r.project_id from public.subcontract_quote_requests r where r.id = request_id)));
-- Builders never see a company's unsubmitted draft.
create policy sqrev_select on public.subcontract_quote_revisions for select to authenticated
  using (public.sub_quote_invitation_ok(invitation_id)
         or (status = 'submitted'
             and public.can_view_quotes(organization_id, (select r.project_id from public.subcontract_quote_requests r where r.id = request_id))));
create policy sqe_select on public.subcontract_quote_events for select to authenticated
  using (public.can_view_quotes(organization_id, (select r.project_id from public.subcontract_quote_requests r where r.id = request_id))
         or (company_visible and (
               (invitation_id is not null and public.sub_quote_invitation_ok(invitation_id))
               or (invitation_id is null and exists (select 1 from public.subcontract_quote_invitations i
                                                     where i.request_id = subcontract_quote_events.request_id
                                                       and public.sub_quote_invitation_ok(i.id))))));
create policy sqa_select on public.subcontract_quote_attachments for select to authenticated
  using (exists (select 1 from public.subcontract_quote_revisions v where v.id = revision_id));
-- The outbox has no client policies at all.

grant select on public.subcontract_quote_requests, public.subcontract_quote_scope_versions,
  public.subcontract_quote_invitations, public.subcontract_quote_revisions, public.subcontract_quote_events,
  public.subcontract_quote_attachments to authenticated;

create policy subcontract_quotes_select on storage.objects for select to authenticated
  using (bucket_id = 'subcontract-quotes' and public.can_read_quote_object(name));
create policy subcontract_quotes_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'subcontract-quotes' and public.can_upload_quote_object(name));
create policy subcontract_quotes_delete_unregistered on storage.objects for delete to authenticated
  using (bucket_id = 'subcontract-quotes'
         and not exists (select 1 from public.subcontract_quote_attachments a where a.storage_path = name)
         and public.can_upload_quote_object(name));

-- ───────────────────────── Notification delivery ─────────────────────────
create or replace function public.quote_outbox_enqueue(
  p_req public.subcontract_quote_requests, p_key text, p_audience text, p_invitation uuid,
  p_title text, p_body text, p_link text, p_action boolean default true)
returns void language sql security definer set search_path = '' as $$
  insert into public.subcontract_quote_outbox
    (organization_id, request_id, event_key, audience, invitation_id, actor_id, title, body, link, action_required)
  values (p_req.organization_id, p_req.id, p_key, p_audience, p_invitation, auth.uid(), p_title, p_body, p_link, p_action)
  on conflict (event_key) do nothing;
$$;

-- Delivers pending rows for one request. Each row is isolated: a failure is recorded and retried later.
create or replace function public.quote_outbox_deliver(p_request uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare o record; v_req public.subcontract_quote_requests; v_done integer := 0;
begin
  select * into v_req from public.subcontract_quote_requests where id = p_request;
  if v_req.id is null then return 0; end if;
  for o in select * from public.subcontract_quote_outbox
           where request_id = p_request and delivered_at is null and attempts < 20
           order by id for update skip locked loop
    begin
      if o.audience = 'company' then
        insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, dedupe_key, action_required)
        select o.organization_id, a.user_id, o.title, o.body, o.link, 'subcontract_quote', v_req.project_id,
               'quote:' || o.event_key, o.action_required
        from public.subcontract_quote_invitations i
        join public.subcontractor_portal_accounts a
          on a.subcontractor_company_id = i.subcontractor_company_id and a.organization_id = i.organization_id and a.status = 'active'
        join public.subcontractor_companies c on c.id = i.subcontractor_company_id and c.status = 'active'
        where i.id = o.invitation_id and public.is_feature_enabled(o.organization_id, 'subcontractors')
        on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      else
        insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, dedupe_key, action_required)
        select o.organization_id, m.user_id, o.title, o.body, o.link, 'subcontract_quote', v_req.project_id,
               'quote:' || o.event_key, o.action_required
        from public.organization_memberships m
        where m.organization_id = o.organization_id and m.status = 'active'
          and m.role in ('org_admin', 'project_manager')
          and m.user_id is distinct from o.actor_id
          and public.is_feature_enabled(o.organization_id, 'subcontractors')
        on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
      end if;
      update public.subcontract_quote_outbox set delivered_at = now(), attempts = attempts + 1, last_error = null where id = o.id;
      v_done := v_done + 1;
    exception when others then
      update public.subcontract_quote_outbox set attempts = attempts + 1, last_error = left(sqlerrm, 500) where id = o.id;
    end;
  end loop;
  return v_done;
end;
$$;

-- Callable by anyone who can see the request: retries pending deliveries on page load.
create or replace function public.retry_quote_notifications(p_request uuid)
returns integer language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_view_quote_request(p_request) then return 0; end if;
  return public.quote_outbox_deliver(p_request);
end;
$$;

-- Never lets a delivery problem abort the caller's committed business write.
create or replace function public.quote_outbox_try_deliver(p_request uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform public.quote_outbox_deliver(p_request);
exception when others then null;
end;
$$;

create or replace function public.quote_audit(p_org uuid, p_entity text, p_id uuid, p_action text, p_fields text[] default null)
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (organization_id, actor_id, entity_type, entity_id, action, changed_fields)
  values (p_org, auth.uid(), p_entity, p_id, p_action, p_fields);
$$;

-- ───────────────────────── Builder operations ─────────────────────────
create or replace function public.quote_builder_lock(p_request uuid, p_expected_org uuid, p_expected_version integer)
returns public.subcontract_quote_requests language plpgsql security definer set search_path = '' as $$
declare v public.subcontract_quote_requests;
begin
  select * into v from public.subcontract_quote_requests where id = p_request for update;
  if v.id is null or v.organization_id is distinct from p_expected_org then
    raise exception 'This quote request could not be found in the current organization' using errcode = 'P0002';
  end if;
  if not public.can_manage_quotes(v.organization_id, v.project_id) then
    raise exception 'You do not have permission to manage quote requests on this project' using errcode = '42501';
  end if;
  if p_expected_version is not null and v.row_version <> p_expected_version then
    raise exception 'This request was changed by someone else. Reload to see the latest version.' using errcode = '40001';
  end if;
  return v;
end;
$$;

create or replace function public.quote_documents_snapshot(p_project uuid, p_org uuid, p_ids uuid[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; v_count integer;
begin
  if coalesce(cardinality(p_ids), 0) = 0 then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'document_id', d.id, 'version_id', dv.id, 'version_number', dv.version_number,
           'name', d.name, 'filename', dv.original_filename) order by d.name), '[]'::jsonb), count(*)
    into v, v_count
  from public.project_documents d
  join public.project_document_versions dv on dv.id = d.current_version_id
  where d.id = any(p_ids) and d.project_id = p_project and d.organization_id = p_org and d.archived_at is null;
  if v_count <> (select count(distinct x) from unnest(p_ids) x) then
    raise exception 'One or more supporting documents are unavailable on this project';
  end if;
  return v;
end;
$$;

create or replace function public.set_project_currency(p_project uuid, p_expected_org uuid, p_currency text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_cur text;
begin
  select organization_id, currency into v_org, v_cur from public.projects where id = p_project for update;
  if v_org is null or v_org is distinct from p_expected_org then
    raise exception 'This project could not be found in the current organization' using errcode = 'P0002';
  end if;
  if not public.can_manage_quotes(v_org, p_project) then
    raise exception 'You do not have permission to set this project''s currency' using errcode = '42501';
  end if;
  if p_currency is null or p_currency !~ '^[A-Z]{3}$' then raise exception 'Choose a valid currency'; end if;
  if v_cur = p_currency then return; end if;
  if v_cur is not null then
    raise exception 'This project already uses %. Its currency cannot be changed here.', v_cur;
  end if;
  update public.projects set currency = p_currency where id = p_project;
  perform public.quote_audit(v_org, 'project', p_project, 'currency_set', array['currency']);
end;
$$;

-- Creates or updates a DRAFT request, including its invited company list. Drafts may be incomplete.
create or replace function public.quote_request_save(
  p_request uuid, p_project uuid, p_expected_org uuid, p_expected_version integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v public.subcontract_quote_requests;
  v_org uuid;
  v_tz text := nullif(btrim(p_payload->>'deadline_timezone'), '');
  v_docs uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p_payload->'document_ids', '[]')) x), '{}');
  v_companies uuid[] := coalesce((select array_agg(distinct x::uuid) from jsonb_array_elements_text(coalesce(p_payload->'company_ids', '[]')) x), '{}');
  v_activity uuid := nullif(p_payload->>'schedule_activity_id', '')::uuid;
begin
  if v_tz is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    raise exception 'Choose a valid timezone';
  end if;
  if p_request is null then
    select organization_id into v_org from public.projects where id = p_project;
    if v_org is null or v_org is distinct from p_expected_org then
      raise exception 'This project could not be found in the current organization' using errcode = 'P0002';
    end if;
    if not public.can_manage_quotes(v_org, p_project) then
      raise exception 'You do not have permission to manage quote requests on this project' using errcode = '42501';
    end if;
    insert into public.subcontract_quote_requests (organization_id, project_id, title, created_by)
    values (v_org, p_project, coalesce(nullif(btrim(p_payload->>'title'), ''), 'Untitled request'), auth.uid())
    returning * into v;
    insert into public.subcontract_quote_events (organization_id, request_id, event_type, actor_id)
    values (v.organization_id, v.id, 'created', auth.uid());
    perform public.quote_audit(v.organization_id, 'subcontract_quote_request', v.id, 'created');
  else
    v := public.quote_builder_lock(p_request, p_expected_org, p_expected_version);
    if v.project_id <> p_project then raise exception 'This request belongs to a different project' using errcode = 'P0002'; end if;
    if v.status <> 'draft' then
      raise exception 'Only draft requests can be edited this way. Use amend or deadline changes for issued requests.';
    end if;
  end if;

  if v_activity is not null and not exists (
    select 1 from public.schedule_activities a where a.id = v_activity and a.project_id = v.project_id) then
    raise exception 'The schedule activity is not part of this project';
  end if;
  if exists (select 1 from unnest(v_docs) d where not exists (
      select 1 from public.project_documents pd
      where pd.id = d and pd.project_id = v.project_id and pd.organization_id = v.organization_id and pd.archived_at is null)) then
    raise exception 'One or more supporting documents are unavailable on this project';
  end if;
  if exists (select 1 from unnest(v_companies) c where not exists (
      select 1 from public.subcontractor_companies sc
      where sc.id = c and sc.organization_id = v.organization_id and sc.status = 'active')) then
    raise exception 'Only active subcontractor companies in this organization can be invited';
  end if;

  update public.subcontract_quote_requests set
    title = coalesce(nullif(btrim(p_payload->>'title'), ''), 'Untitled request'),
    trade = nullif(btrim(p_payload->>'trade'), ''),
    draft_scope = coalesce(p_payload->>'scope', ''),
    draft_document_ids = v_docs,
    response_deadline = nullif(p_payload->>'response_deadline', '')::timestamptz,
    deadline_timezone = v_tz,
    cost_category = nullif(btrim(p_payload->>'cost_category'), ''),
    schedule_activity_id = v_activity,
    work_window_start = nullif(p_payload->>'work_window_start', '')::date,
    work_window_end = nullif(p_payload->>'work_window_end', '')::date,
    row_version = row_version + case when p_request is null then 0 else 1 end
  where id = v.id returning * into v;

  delete from public.subcontract_quote_invitations where request_id = v.id and not (subcontractor_company_id = any(v_companies));
  insert into public.subcontract_quote_invitations (organization_id, request_id, subcontractor_company_id, invited_by)
  select v.organization_id, v.id, c, auth.uid() from unnest(v_companies) c
  on conflict (request_id, subcontractor_company_id) do nothing;

  return jsonb_build_object('id', v.id, 'row_version', v.row_version);
end;
$$;

create or replace function public.quote_request_send(
  p_request uuid, p_expected_org uuid, p_expected_version integer, p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.subcontract_quote_requests; v_currency text; v_docs jsonb; i record; v_link text;
begin
  v := public.quote_builder_lock(p_request, p_expected_org, p_expected_version);
  if v.status <> 'draft' then
    -- A retried send after a lost response is a success, not a second send.
    if v.status = 'open' and v.sent_at is not null then return jsonb_build_object('id', v.id, 'row_version', v.row_version); end if;
    raise exception 'Only draft requests can be sent';
  end if;
  if p_confirmed is not true then raise exception 'Confirm the scope, documents, deadline and invited companies before sending'; end if;
  if char_length(btrim(v.draft_scope)) = 0 then raise exception 'Describe the scope of work before sending'; end if;
  if v.response_deadline is null or v.deadline_timezone is null then raise exception 'Set a response deadline and timezone'; end if;
  if v.response_deadline <= now() then raise exception 'The response deadline must be in the future'; end if;
  select currency into v_currency from public.projects where id = v.project_id;
  if v_currency is null then raise exception 'Set the project currency before sending quote requests'; end if;
  if not exists (select 1 from public.subcontract_quote_invitations where request_id = v.id) then
    raise exception 'Invite at least one subcontractor company';
  end if;
  if exists (select 1 from public.subcontract_quote_invitations qi
             join public.subcontractor_companies c on c.id = qi.subcontractor_company_id
             where qi.request_id = v.id and c.status <> 'active') then
    raise exception 'Remove inactive companies before sending';
  end if;
  v_docs := public.quote_documents_snapshot(v.project_id, v.organization_id, v.draft_document_ids);

  insert into public.subcontract_quote_scope_versions (organization_id, request_id, version, scope, documents, published_by)
  values (v.organization_id, v.id, 1, v.draft_scope, v_docs, auth.uid());
  update public.subcontract_quote_requests
     set status = 'open', currency = v_currency, current_scope_version = 1, sent_at = now(), row_version = row_version + 1
   where id = v.id returning * into v;

  insert into public.subcontract_quote_events (organization_id, request_id, event_type, actor_id, company_visible)
  values (v.organization_id, v.id, 'sent', auth.uid(), true);
  v_link := '/sub/quotes/' || v.id;
  for i in select * from public.subcontract_quote_invitations where request_id = v.id loop
    insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, event_type, actor_id, company_visible)
    values (v.organization_id, v.id, i.id, 'invited', auth.uid(), true);
    perform public.quote_outbox_enqueue(v, 'invite:' || i.id, 'company', i.id,
      'New quote request: ' || v.title, 'Responses are due ' || to_char(v.response_deadline at time zone v.deadline_timezone, 'Mon DD, YYYY HH12:MI AM') || ' (' || v.deadline_timezone || ').', v_link);
  end loop;
  perform public.quote_audit(v.organization_id, 'subcontract_quote_request', v.id, 'sent', array['status']);
  perform public.quote_outbox_try_deliver(v.id);
  return jsonb_build_object('id', v.id, 'row_version', v.row_version);
end;
$$;

create or replace function public.quote_request_invite(p_request uuid, p_expected_org uuid, p_company_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare v public.subcontract_quote_requests; i record; v_added integer := 0;
begin
  v := public.quote_builder_lock(p_request, p_expected_org, null);
  if v.status <> 'open' then raise exception 'Companies can be added only while the request is open'; end if;
  for i in
    insert into public.subcontract_quote_invitations (organization_id, request_id, subcontractor_company_id, invited_by)
    select v.organization_id, v.id, c, auth.uid() from unnest(coalesce(p_company_ids, '{}')) c
    on conflict (request_id, subcontractor_company_id) do nothing
    returning *
  loop
    v_added := v_added + 1;
    insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, event_type, actor_id, company_visible)
    values (v.organization_id, v.id, i.id, 'invited', auth.uid(), true);
    perform public.quote_outbox_enqueue(v, 'invite:' || i.id, 'company', i.id, 'New quote request: ' || v.title,
      'Responses are due ' || to_char(v.response_deadline at time zone v.deadline_timezone, 'Mon DD, YYYY HH12:MI AM') || ' (' || v.deadline_timezone || ').',
      '/sub/quotes/' || v.id);
    perform public.quote_audit(v.organization_id, 'subcontract_quote_invitation', i.id, 'invited');
  end loop;
  perform public.quote_outbox_try_deliver(v.id);
  return v_added;
end;
$$;

create or replace function public.quote_request_amend(
  p_request uuid, p_expected_org uuid, p_expected_version integer, p_scope text, p_document_ids uuid[], p_summary text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.subcontract_quote_requests; v_next integer; i record;
begin
  v := public.quote_builder_lock(p_request, p_expected_org, p_expected_version);
  if v.status not in ('open', 'closed') then raise exception 'Only issued, active requests can be amended'; end if;
  if char_length(btrim(coalesce(p_scope, ''))) = 0 then raise exception 'Describe the scope of work'; end if;
  if char_length(btrim(coalesce(p_summary, ''))) = 0 then raise exception 'Summarize what changed for invitees'; end if;
  v_next := v.current_scope_version + 1;
  insert into public.subcontract_quote_scope_versions (organization_id, request_id, version, scope, documents, change_summary, published_by)
  values (v.organization_id, v.id, v_next, p_scope,
          public.quote_documents_snapshot(v.project_id, v.organization_id, coalesce(p_document_ids, '{}')), p_summary, auth.uid());
  update public.subcontract_quote_requests
     set current_scope_version = v_next, draft_scope = p_scope, draft_document_ids = coalesce(p_document_ids, '{}'), row_version = row_version + 1
   where id = v.id returning * into v;
  insert into public.subcontract_quote_events (organization_id, request_id, event_type, actor_id, company_visible, message, details)
  values (v.organization_id, v.id, 'amended', auth.uid(), true, p_summary, jsonb_build_object('version', v_next));
  for i in select * from public.subcontract_quote_invitations where request_id = v.id and status = 'invited' loop
    perform public.quote_outbox_enqueue(v, 'amend:' || i.id || ':' || v_next, 'company', i.id,
      'Scope amended: ' || v.title, 'Version ' || v_next || ': ' || left(p_summary, 200), '/sub/quotes/' || v.id);
  end loop;
  perform public.quote_audit(v.organization_id, 'subcontract_quote_request', v.id, 'amended', array['scope']);
  perform public.quote_outbox_try_deliver(v.id);
  return jsonb_build_object('id', v.id, 'row_version', v.row_version, 'scope_version', v_next);
end;
$$;

-- close | reopen | cancel | extend. reopen and extend require a future deadline.
create or replace function public.quote_request_transition(
  p_request uuid, p_expected_org uuid, p_expected_version integer, p_action text,
  p_deadline timestamptz default null, p_timezone text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.subcontract_quote_requests; v_old_status text; i record; v_title text; v_body text; v_event text;
begin
  v := public.quote_builder_lock(p_request, p_expected_org, p_expected_version);
  v_old_status := v.status;
  if p_timezone is not null and not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then
    raise exception 'Choose a valid timezone';
  end if;
  if p_action = 'close' then
    if v.status <> 'open' then raise exception 'Only open requests can be closed'; end if;
    update public.subcontract_quote_requests set status = 'closed', closed_at = now(), row_version = row_version + 1
     where id = v.id returning * into v;
    v_event := 'closed'; v_title := 'Quote request closed: ' || v.title; v_body := 'Submissions are no longer accepted. No award decision has been made.';
  elsif p_action = 'reopen' then
    if v.status <> 'closed' then raise exception 'Only closed requests can be reopened'; end if;
    if coalesce(p_deadline, v.response_deadline) <= now() then raise exception 'Set a future deadline to reopen this request'; end if;
    update public.subcontract_quote_requests set status = 'open', closed_at = null,
      response_deadline = coalesce(p_deadline, response_deadline), deadline_timezone = coalesce(p_timezone, deadline_timezone),
      row_version = row_version + 1
     where id = v.id returning * into v;
    v_event := 'reopened'; v_title := 'Quote request reopened: ' || v.title;
    v_body := 'Responses are due ' || to_char(v.response_deadline at time zone v.deadline_timezone, 'Mon DD, YYYY HH12:MI AM') || ' (' || v.deadline_timezone || ').';
  elsif p_action = 'extend' then
    if v.status not in ('open', 'closed') then raise exception 'Only issued, active requests can change deadline'; end if;
    if p_deadline is null or p_deadline <= now() then raise exception 'The new deadline must be in the future'; end if;
    update public.subcontract_quote_requests set response_deadline = p_deadline,
      deadline_timezone = coalesce(p_timezone, deadline_timezone), row_version = row_version + 1
     where id = v.id returning * into v;
    v_event := 'deadline_changed'; v_title := 'Deadline changed: ' || v.title;
    v_body := 'Responses are now due ' || to_char(v.response_deadline at time zone v.deadline_timezone, 'Mon DD, YYYY HH12:MI AM') || ' (' || v.deadline_timezone || ').';
  elsif p_action = 'cancel' then
    if v.status = 'cancelled' then return jsonb_build_object('id', v.id, 'row_version', v.row_version); end if;
    update public.subcontract_quote_requests set status = 'cancelled', cancelled_at = now(), row_version = row_version + 1
     where id = v.id returning * into v;
    v_event := 'cancelled'; v_title := 'Quote request cancelled: ' || v.title; v_body := 'The builder cancelled this request. Your history is kept.';
  else
    raise exception 'Unknown action';
  end if;

  insert into public.subcontract_quote_events (organization_id, request_id, event_type, actor_id, company_visible, details)
  values (v.organization_id, v.id, v_event, auth.uid(), true,
          jsonb_build_object('response_deadline', v.response_deadline, 'deadline_timezone', v.deadline_timezone));
  if v_old_status <> 'draft' then
    for i in select * from public.subcontract_quote_invitations where request_id = v.id loop
      perform public.quote_outbox_enqueue(v, v_event || ':' || i.id || ':' || v.row_version, 'company', i.id,
        v_title, v_body, '/sub/quotes/' || v.id, v_event in ('reopened', 'deadline_changed'));
    end loop;
  end if;
  perform public.quote_audit(v.organization_id, 'subcontract_quote_request', v.id, v_event,
    case when v_event = 'deadline_changed' then array['response_deadline'] else array['status'] end);
  perform public.quote_outbox_try_deliver(v.id);
  return jsonb_build_object('id', v.id, 'row_version', v.row_version);
end;
$$;

create or replace function public.quote_request_revision(p_invitation uuid, p_expected_org uuid, p_instructions text)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.subcontract_quote_invitations; v public.subcontract_quote_requests; v_count integer;
begin
  select * into inv from public.subcontract_quote_invitations where id = p_invitation for update;
  if inv.id is null or inv.organization_id is distinct from p_expected_org then
    raise exception 'This invitation could not be found in the current organization' using errcode = 'P0002';
  end if;
  select * into v from public.subcontract_quote_requests where id = inv.request_id for update;
  if not public.can_review_quotes(v.organization_id, v.project_id) then
    raise exception 'You do not have permission to review quotes on this project' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_instructions, ''))) < 5 then raise exception 'Write specific revision instructions'; end if;
  if v.status <> 'open' then raise exception 'Reopen the request before asking for a revision'; end if;
  if v.response_deadline <= now() then raise exception 'Extend the deadline before asking for a revision'; end if;
  if inv.status <> 'invited' then raise exception 'This company declined the request'; end if;
  if not exists (select 1 from public.subcontract_quote_revisions where invitation_id = inv.id and status = 'submitted') then
    raise exception 'There is no submitted quote to revise';
  end if;
  update public.subcontract_quote_invitations set revision_requested_at = now(), revision_instructions = btrim(p_instructions)
   where id = inv.id;
  insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, event_type, actor_id, company_visible, message)
  values (inv.organization_id, inv.request_id, inv.id, 'revision_requested', auth.uid(), true, btrim(p_instructions));
  select count(*) into v_count from public.subcontract_quote_events where invitation_id = inv.id and event_type = 'revision_requested';
  perform public.quote_outbox_enqueue(v, 'revreq:' || inv.id || ':' || v_count, 'company', inv.id,
    'Revision requested: ' || v.title, left(btrim(p_instructions), 200), '/sub/quotes/' || v.id);
  perform public.quote_audit(inv.organization_id, 'subcontract_quote_invitation', inv.id, 'revision_requested');
  perform public.quote_outbox_try_deliver(v.id);
end;
$$;

-- ───────────────────────── Subcontractor operations ─────────────────────────
create or replace function public.quote_sub_lock(p_invitation uuid)
returns public.subcontract_quote_invitations language plpgsql security definer set search_path = '' as $$
declare inv public.subcontract_quote_invitations;
begin
  if not public.sub_quote_invitation_ok(p_invitation) then
    raise exception 'This quote request is not available to your company' using errcode = '42501';
  end if;
  select * into inv from public.subcontract_quote_invitations where id = p_invitation for update;
  return inv;
end;
$$;

create or replace function public.quote_draft_save(p_invitation uuid, p_expected_row_version integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  inv public.subcontract_quote_invitations; v_req public.subcontract_quote_requests;
  d public.subcontract_quote_revisions; prev public.subcontract_quote_revisions;
  v_tax text := nullif(p_payload->>'tax_treatment', '');
  v_alts jsonb := coalesce(p_payload->'alternates', '[]'::jsonb);
begin
  inv := public.quote_sub_lock(p_invitation);
  select * into v_req from public.subcontract_quote_requests where id = inv.request_id;
  if v_req.status <> 'open' then raise exception 'This request is not accepting quotes. Your saved work is kept.'; end if;
  if inv.status <> 'invited' then raise exception 'Your company declined this request'; end if;
  if jsonb_typeof(v_alts) <> 'array' or exists (
      select 1 from jsonb_array_elements(v_alts) a
      where char_length(btrim(coalesce(a->>'description', ''))) = 0
         or (a ? 'amount_cents' and a->>'amount_cents' is not null and (a->>'amount_cents') !~ '^[0-9]{1,14}$')) then
    raise exception 'Each alternate needs a description and a valid amount';
  end if;

  select * into d from public.subcontract_quote_revisions where invitation_id = inv.id and status = 'draft' for update;
  if d.id is null then
    if p_expected_row_version is not null then
      raise exception 'This draft was already submitted. Reload to see the latest version.' using errcode = '40001';
    end if;
    select * into prev from public.subcontract_quote_revisions where invitation_id = inv.id and status = 'submitted'
      order by revision_number desc limit 1;
    insert into public.subcontract_quote_revisions (organization_id, request_id, invitation_id, subcontractor_company_id,
      revision_number, previous_revision_id, created_by, updated_by)
    values (inv.organization_id, inv.request_id, inv.id, inv.subcontractor_company_id,
      coalesce(prev.revision_number, 0) + 1, prev.id, auth.uid(), auth.uid())
    returning * into d;
    if prev.id is not null then
      insert into public.subcontract_quote_attachments (organization_id, revision_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
      select organization_id, d.id, storage_path, file_name, content_type, size_bytes, uploaded_by
      from public.subcontract_quote_attachments where revision_id = prev.id;
    end if;
  elsif p_expected_row_version is null or d.row_version <> p_expected_row_version then
    raise exception 'A colleague saved this draft since you opened it. Reload to see their changes.' using errcode = '40001';
  end if;

  update public.subcontract_quote_revisions set
    amount_cents = nullif(p_payload->>'amount_cents', '')::bigint,
    tax_treatment = v_tax,
    tax_amount_cents = case when v_tax = 'excluded' then nullif(p_payload->>'tax_amount_cents', '')::bigint end,
    tax_details = nullif(btrim(p_payload->>'tax_details'), ''),
    inclusions = nullif(btrim(p_payload->>'inclusions'), ''),
    exclusions = nullif(btrim(p_payload->>'exclusions'), ''),
    availability = nullif(btrim(p_payload->>'availability'), ''),
    allowances = nullif(btrim(p_payload->>'allowances'), ''),
    assumptions = nullif(btrim(p_payload->>'assumptions'), ''),
    alternates = v_alts,
    estimated_duration_days = nullif(p_payload->>'estimated_duration_days', '')::integer,
    valid_until = nullif(p_payload->>'valid_until', '')::date,
    row_version = row_version + 1,
    updated_by = auth.uid()
  where id = d.id returning * into d;
  return jsonb_build_object('revision_id', d.id, 'row_version', d.row_version, 'revision_number', d.revision_number);
end;
$$;

create or replace function public.quote_submit(
  p_revision uuid, p_expected_row_version integer, p_idempotency_key uuid, p_ack_scope_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.subcontract_quote_revisions; inv public.subcontract_quote_invitations; v_req public.subcontract_quote_requests;
begin
  if p_idempotency_key is null then raise exception 'Missing submission key'; end if;
  select * into d from public.subcontract_quote_revisions where idempotency_key = p_idempotency_key;
  if d.id is not null then
    if not public.sub_quote_invitation_ok(d.invitation_id) then
      raise exception 'This quote request is not available to your company' using errcode = '42501';
    end if;
    return jsonb_build_object('revision_id', d.id, 'revision_number', d.revision_number, 'replayed', true);
  end if;
  select * into d from public.subcontract_quote_revisions where id = p_revision;
  if d.id is null then raise exception 'This draft could not be found' using errcode = 'P0002'; end if;
  inv := public.quote_sub_lock(d.invitation_id);
  select * into d from public.subcontract_quote_revisions where id = p_revision for update;
  select * into v_req from public.subcontract_quote_requests where id = inv.request_id for share;
  if d.status <> 'draft' then raise exception 'This draft was already submitted. Reload to see the latest version.' using errcode = '40001'; end if;
  if d.row_version <> p_expected_row_version then
    raise exception 'A colleague changed this draft. Review their changes before submitting.' using errcode = '40001';
  end if;
  if inv.status <> 'invited' then raise exception 'Your company declined this request'; end if;
  if v_req.status <> 'open' then raise exception 'This request is not accepting quotes'; end if;
  if now() > v_req.response_deadline then raise exception 'The response deadline has passed'; end if;
  if p_ack_scope_version is distinct from v_req.current_scope_version then
    raise exception 'The scope was amended to version %. Review and acknowledge it before submitting.', v_req.current_scope_version;
  end if;
  if d.amount_cents is null then raise exception 'Enter the quote amount'; end if;
  if d.tax_treatment is null then raise exception 'Choose how tax is treated'; end if;
  if exists (select 1 from public.subcontract_quote_attachments a where a.revision_id = d.id
             and not exists (select 1 from storage.objects o where o.bucket_id = 'subcontract-quotes' and o.name = a.storage_path)) then
    raise exception 'An attachment did not finish uploading. Remove it or upload it again.';
  end if;

  update public.subcontract_quote_revisions set status = 'submitted', submitted_at = now(), submitted_by = auth.uid(),
    scope_version = v_req.current_scope_version, idempotency_key = p_idempotency_key
   where id = d.id returning * into d;
  insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, revision_id, event_type, actor_id, company_visible, details)
  values (d.organization_id, d.request_id, d.invitation_id, d.id, 'submitted', auth.uid(), true,
          jsonb_build_object('revision_number', d.revision_number, 'scope_version', d.scope_version));
  perform public.quote_outbox_enqueue(v_req, 'submitted:' || d.id, 'builder', d.invitation_id,
    case when d.revision_number = 1 then 'Quote received: ' else 'Quote revision received: ' end || v_req.title,
    (select c.company_name from public.subcontractor_companies c where c.id = d.subcontractor_company_id)
      || ' submitted revision ' || d.revision_number || '.',
    '/projects/' || v_req.project_id || '/subcontractor-work/quotes/' || v_req.id || '?company=' || d.subcontractor_company_id);
  perform public.quote_audit(d.organization_id, 'subcontract_quote_revision', d.id, 'submitted');
  perform public.quote_outbox_try_deliver(v_req.id);
  return jsonb_build_object('revision_id', d.id, 'revision_number', d.revision_number, 'replayed', false);
end;
$$;

create or replace function public.quote_decline(p_invitation uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare inv public.subcontract_quote_invitations; v_req public.subcontract_quote_requests;
begin
  inv := public.quote_sub_lock(p_invitation);
  select * into v_req from public.subcontract_quote_requests where id = inv.request_id;
  if inv.status = 'declined' then return; end if;
  if v_req.status <> 'open' then raise exception 'This request is not accepting responses'; end if;
  update public.subcontract_quote_invitations
     set status = 'declined', declined_at = now(), declined_by = auth.uid(), decline_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = inv.id;
  insert into public.subcontract_quote_events (organization_id, request_id, invitation_id, event_type, actor_id, company_visible, message)
  values (inv.organization_id, inv.request_id, inv.id, 'declined', auth.uid(), true, nullif(btrim(coalesce(p_reason, '')), ''));
  perform public.quote_outbox_enqueue(v_req, 'declined:' || inv.id, 'builder', inv.id, 'Quote declined: ' || v_req.title,
    (select c.company_name from public.subcontractor_companies c where c.id = inv.subcontractor_company_id) || ' declined to quote.',
    '/projects/' || v_req.project_id || '/subcontractor-work/quotes/' || v_req.id, false);
  perform public.quote_audit(inv.organization_id, 'subcontract_quote_invitation', inv.id, 'declined');
  perform public.quote_outbox_try_deliver(v_req.id);
end;
$$;

create or replace function public.quote_attachment_register(
  p_revision uuid, p_path text, p_file_name text, p_content_type text, p_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare d public.subcontract_quote_revisions; v_id uuid;
begin
  select * into d from public.subcontract_quote_revisions where id = p_revision;
  if d.id is null or not public.sub_quote_invitation_ok(d.invitation_id) then
    raise exception 'This draft is not available to your company' using errcode = '42501';
  end if;
  if d.status <> 'draft' then raise exception 'Attachments on a submitted quote are a permanent record'; end if;
  if public.quote_invitation_from_path(p_path) is distinct from d.invitation_id
     or split_part(p_path, '/', 1) <> d.organization_id::text then
    raise exception 'This file does not belong to this quote' using errcode = '42501';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'subcontract-quotes' and o.name = p_path) then
    raise exception 'The upload did not finish. Try again.';
  end if;
  insert into public.subcontract_quote_attachments (organization_id, revision_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
  values (d.organization_id, d.id, p_path, p_file_name, p_content_type, p_size, auth.uid())
  on conflict (revision_id, storage_path) do update set file_name = public.subcontract_quote_attachments.file_name
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.quote_attachment_remove(p_attachment uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.subcontract_quote_attachments; d public.subcontract_quote_revisions;
begin
  select * into a from public.subcontract_quote_attachments where id = p_attachment;
  select * into d from public.subcontract_quote_revisions where id = a.revision_id;
  if a.id is null or not public.sub_quote_invitation_ok(d.invitation_id) then
    raise exception 'This file is not available to your company' using errcode = '42501';
  end if;
  delete from public.subcontract_quote_attachments where id = a.id;
end;
$$;

-- Project label and issued document file paths for invitees (they cannot read projects or project_documents directly).
create or replace function public.sub_quote_requests()
returns table (request_id uuid, invitation_id uuid, project_name text, project_number text, title text, trade text,
               status text, currency text, response_deadline timestamptz, deadline_timezone text, current_scope_version integer,
               invitation_status text, revision_requested_at timestamptz, last_submitted_at timestamptz,
               last_submitted_scope_version integer, has_draft boolean, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, i.id, p.name, p.project_number, r.title, r.trade, r.status, r.currency, r.response_deadline, r.deadline_timezone,
         r.current_scope_version, i.status, i.revision_requested_at,
         (select max(v.submitted_at) from public.subcontract_quote_revisions v where v.invitation_id = i.id and v.status = 'submitted'),
         (select v.scope_version from public.subcontract_quote_revisions v where v.invitation_id = i.id and v.status = 'submitted'
           order by v.revision_number desc limit 1),
         exists (select 1 from public.subcontract_quote_revisions v where v.invitation_id = i.id and v.status = 'draft'),
         r.updated_at
  from public.subcontract_quote_invitations i
  join public.subcontract_quote_requests r on r.id = i.request_id
  join public.projects p on p.id = r.project_id
  where public.sub_quote_invitation_ok(i.id)
  order by (r.status = 'open') desc, r.response_deadline asc nulls last;
$$;

create or replace function public.sub_quote_document_path(p_request uuid, p_version_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select dv.storage_path from public.project_document_versions dv
  where dv.id = p_version_id
    and exists (select 1 from public.subcontract_quote_scope_versions s
                where s.request_id = p_request and s.documents @> jsonb_build_array(jsonb_build_object('version_id', p_version_id)))
    and exists (select 1 from public.subcontract_quote_invitations i
                where i.request_id = p_request and public.sub_quote_invitation_ok(i.id));
$$;

-- ───────────────────────── Execute grants ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.set_project_currency(uuid, uuid, text)',
    'public.quote_request_save(uuid, uuid, uuid, integer, jsonb)',
    'public.quote_request_send(uuid, uuid, integer, boolean)',
    'public.quote_request_invite(uuid, uuid, uuid[])',
    'public.quote_request_amend(uuid, uuid, integer, text, uuid[], text)',
    'public.quote_request_transition(uuid, uuid, integer, text, timestamptz, text)',
    'public.quote_request_revision(uuid, uuid, text)',
    'public.quote_draft_save(uuid, integer, jsonb)',
    'public.quote_submit(uuid, integer, uuid, integer)',
    'public.quote_decline(uuid, text)',
    'public.quote_attachment_register(uuid, text, text, text, bigint)',
    'public.quote_attachment_remove(uuid)',
    'public.sub_quote_requests()',
    'public.sub_quote_document_path(uuid, uuid)',
    'public.retry_quote_notifications(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Internal helpers are not callable by clients.
  foreach f in array array[
    'public.quote_outbox_enqueue(public.subcontract_quote_requests, text, text, uuid, text, text, text, boolean)',
    'public.quote_outbox_deliver(uuid)',
    'public.quote_outbox_try_deliver(uuid)',
    'public.quote_audit(uuid, text, uuid, text, text[])',
    'public.quote_builder_lock(uuid, uuid, integer)',
    'public.quote_sub_lock(uuid)',
    'public.quote_documents_snapshot(uuid, uuid, uuid[])'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
