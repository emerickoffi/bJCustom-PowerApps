-- Project Questions (RFIs). FOR REVIEW — not yet applied to the connected environment. Additive only.
--
-- Requires 20261026000003 (feature registry, notification dedupe), 20261101000010 (subcontractor project assignments),
-- 20261121000010 (subcontractor portal accounts) and the project documents tables.
--
-- * Lifecycle: draft -> open -> answered -> closed. Open may close directly (withdrawn/resolved, reason required);
--   answered or closed may return to open when clarification is needed (reason required). Nothing is deleted.
-- * A question gets its project-scoped number (RFI-001) when it is sent, from a per-project counter row, so
--   concurrent sends never share or skip a number. Drafts have no number. The uuid id never changes.
-- * The sent question is preserved in the 'sent' history event. Amendments, reassignment, and every status change
--   append a history event; official answers and comments are append-only rows.
-- * All writes go through the security-definer functions below, which re-check caller, project, organization,
--   feature, status, and row version on every call. Tables have SELECT policies only.
-- * Every state-changing call carries a client request id; a repeated call returns the stored result instead of
--   writing twice. Notifications use per-recipient dedupe keys.
-- * An RFI never authorizes work, changes a schedule, or updates a budget. No other table is written here except
--   public.notifications.
-- * Turning the 'rfis' feature off hides every row from every client; no row is changed or removed.

-- ───────────────────────── Feature registry ─────────────────────────
-- Re-declared with the full current list plus one row.
create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation',   true,  array[]::text[]),
    ('schedule',       true,  array[]::text[]),
    ('estimates',      true,  array[]::text[]),
    ('walkthroughs',   true,  array[]::text[]),
    ('issues',         true,  array[]::text[]),
    ('warranty',       true,  array[]::text[]),
    ('portal',         true,  array[]::text[]),
    ('documents',      false, array[]::text[]),
    ('e_signatures',   false, array['documents']),
    ('reports',        true,  array['walkthroughs']),
    ('invoices',       false, array[]::text[]),
    ('payments',       false, array['estimates']),
    ('quickbooks',     false, array['estimates']),
    ('ai_assistant',   false, array[]::text[]),
    ('daily_logs',     false, array[]::text[]),
    ('subcontractors', false, array[]::text[]),
    ('client_updates', false, array['portal']),
    ('change_orders',  false, array[]::text[]),
    ('rfis',           false, array[]::text[])
$$;

-- ───────────────────────── Tables ─────────────────────────
create table public.project_rfi_counters (
  project_id uuid primary key references public.projects(id) on delete cascade,
  last_number integer not null default 0 check (last_number >= 0)
);

create table public.project_rfis (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  rfi_number integer check (rfi_number is null or rfi_number > 0),
  status text not null default 'draft' check (status in ('draft', 'open', 'answered', 'closed')),
  subject text not null check (char_length(btrim(subject)) between 1 and 200),
  question text not null default '' check (char_length(question) <= 10000),
  responder_user_id uuid references auth.users(id) on delete set null,
  responder_name text check (responder_name is null or char_length(responder_name) <= 200),
  responder_company text check (responder_company is null or char_length(responder_company) <= 200),
  due_date date,
  location text check (location is null or char_length(location) <= 300),
  -- Optional pointer to one exact document version. Opening the file always goes through document permissions.
  document_version_id uuid references public.project_document_versions(id) on delete set null,
  document_label text check (document_label is null or char_length(document_label) <= 300),
  homeowner_shared boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null check (char_length(created_by_name) <= 200),
  sent_at timestamptz,
  answered_at timestamptz,
  closed_at timestamptz,
  -- How many times the question has been opened; an official answer belongs to the cycle it answered.
  cycle integer not null default 0 check (cycle >= 0),
  row_version integer not null default 1 check (row_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_rfis_number_when_sent check ((status = 'draft') = (rfi_number is null)),
  constraint project_rfis_draft_private check (status <> 'draft' or not homeowner_shared),
  unique (project_id, rfi_number)
);
create index project_rfis_project_idx on public.project_rfis (project_id, status, updated_at desc);
create index project_rfis_responder_idx on public.project_rfis (responder_user_id, status) where status <> 'draft';
create index project_rfis_creator_idx on public.project_rfis (created_by, status);
create index project_rfis_org_open_idx on public.project_rfis (organization_id, due_date) where status = 'open';
create trigger project_rfis_updated_at before update on public.project_rfis
  for each row execute function public.set_updated_at();

create table public.project_rfi_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  rfi_id uuid not null references public.project_rfis(id) on delete restrict,
  cycle integer not null check (cycle > 0),
  body text not null check (char_length(btrim(body)) between 1 and 10000),
  responded_by uuid references auth.users(id) on delete set null,
  responded_by_name text not null check (char_length(responded_by_name) <= 200),
  responded_by_company text check (responded_by_company is null or char_length(responded_by_company) <= 200),
  created_at timestamptz not null default now()
);
create index project_rfi_responses_rfi_idx on public.project_rfi_responses (rfi_id, created_at);

create table public.project_rfi_comments (
  -- Supplied by the client so a retried post lands on the same row.
  id uuid primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  rfi_id uuid not null references public.project_rfis(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null check (char_length(author_name) <= 200),
  created_at timestamptz not null default now()
);
create index project_rfi_comments_rfi_idx on public.project_rfi_comments (rfi_id, created_at);

create table public.project_rfi_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  rfi_id uuid not null references public.project_rfis(id) on delete restrict,
  event_type text not null check (event_type in (
    'created', 'sent', 'amended', 'reassigned', 'answered', 'closed', 'reopened',
    'shared', 'unshared', 'attachment_added')),
  -- Internal events are shown to builder staff only.
  internal boolean not null default false,
  actor_id uuid references auth.users(id) on delete set null,
  actor_name text not null check (char_length(actor_name) <= 200),
  from_status text,
  to_status text,
  note text check (note is null or char_length(note) <= 2000),
  details jsonb not null default '{}'::jsonb,
  request_id uuid,
  created_at timestamptz not null default now()
);
create index project_rfi_events_rfi_idx on public.project_rfi_events (rfi_id, created_at);
create unique index project_rfi_events_request_idx on public.project_rfi_events (request_id) where request_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-rfis', 'project-rfis', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              'application/vnd.ms-excel', 'application/msword', 'text/csv'])
on conflict (id) do nothing;

create table public.project_rfi_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  rfi_id uuid not null references public.project_rfis(id) on delete restrict,
  kind text not null check (kind in ('question', 'answer')),
  response_id uuid references public.project_rfi_responses(id) on delete restrict,
  -- {organization_id}/{project_id}/{rfi_id}/{question|answer}/{uuid}-{filename}
  storage_path text not null unique check (char_length(storage_path) <= 500),
  file_name text not null check (char_length(btrim(file_name)) between 1 and 200),
  content_type text check (content_type is null or char_length(content_type) <= 120),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint project_rfi_attachments_answer_link check ((kind = 'answer') = (response_id is not null))
);
create index project_rfi_attachments_rfi_idx on public.project_rfi_attachments (rfi_id, created_at);

-- ───────────────────────── Integrity guards ─────────────────────────
-- History rows never change. The only permitted update is a user reference being cleared when an account is removed.
create or replace function public.project_rfi_append_only()
returns trigger language plpgsql set search_path = '' as $$
declare k constant text[] := array['responded_by', 'author_id', 'actor_id'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - k) = (to_jsonb(old) - k) then
    return new;
  end if;
  raise exception '% rows are kept as history and cannot be changed', tg_table_name;
end;
$$;
create trigger project_rfi_responses_append_only before update or delete on public.project_rfi_responses
  for each row execute function public.project_rfi_append_only();
create trigger project_rfi_comments_append_only before update or delete on public.project_rfi_comments
  for each row execute function public.project_rfi_append_only();
create trigger project_rfi_events_append_only before update or delete on public.project_rfi_events
  for each row execute function public.project_rfi_append_only();

create or replace function public.project_rfis_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Questions are kept as history and cannot be deleted';
  end if;
  if new.organization_id <> old.organization_id or new.project_id <> old.project_id or new.created_at <> old.created_at then
    raise exception 'A question cannot move between projects or organizations';
  end if;
  if old.rfi_number is not null and new.rfi_number is distinct from old.rfi_number then
    raise exception 'A question keeps its number';
  end if;
  if old.status <> 'draft' and new.status = 'draft' then
    raise exception 'A sent question cannot return to draft';
  end if;
  return new;
end;
$$;
create trigger project_rfis_guard before update or delete on public.project_rfis
  for each row execute function public.project_rfis_guard();

create or replace function public.project_rfi_attachments_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'uploaded_by') <> (to_jsonb(old) - 'uploaded_by') then
      raise exception 'Attachments cannot be changed';
    end if;
    return new;
  end if;
  if old.kind <> 'question' or exists (select 1 from public.project_rfis r where r.id = old.rfi_id and r.status <> 'draft') then
    raise exception 'Files on a sent question are kept as history';
  end if;
  return old;
end;
$$;
create trigger project_rfi_attachments_guard before update or delete on public.project_rfi_attachments
  for each row execute function public.project_rfi_attachments_guard();

-- ───────────────────────── Access helpers ─────────────────────────
-- Who may be the assigned responder: a person who can already sign in and reach this project.
-- Staff: administrators and project managers, or builder staff on the project team. External: an active portal
-- account of an active subcontractor company with a current assignment to this project.
-- Directory membership, homeowner accounts, and pending activations never qualify.
create or replace function public.rfi_user_eligible(p_project uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from public.projects p
    where p.id = p_project
      and (
        exists (
          select 1 from public.organization_memberships m
          where m.organization_id = p.organization_id and m.user_id = p_user
            and m.status = 'active' and not m.activation_required
            and (m.role in ('org_admin', 'project_manager')
                 or (m.role = 'builder_staff'
                     and (p.project_manager_id = p_user
                          or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.user_id = p_user)))))
        or (public.is_feature_enabled(p.organization_id, 'subcontractors') and exists (
              select 1 from public.subcontractor_portal_accounts a
              join public.subcontractor_companies c on c.id = a.subcontractor_company_id and c.status = 'active'
              join public.subcontractor_project_assignments spa
                on spa.subcontractor_company_id = c.id and spa.project_id = p.id and spa.ended_at is null
              where a.user_id = p_user and a.status = 'active' and a.organization_id = p.organization_id))
      )
  );
$$;

create or replace function public.rfi_is_staff_user(p_org uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org and m.user_id = p_user and m.status = 'active'
      and m.role in ('org_admin', 'project_manager', 'builder_staff'));
$$;

create or replace function public.rfi_user_name(p_org uuid, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select nullif(btrim(pr.full_name), '') from public.profiles pr where pr.id = p_user),
    (select nullif(btrim(a.full_name), '') from public.subcontractor_portal_accounts a
      where a.user_id = p_user and a.organization_id = p_org limit 1),
    (select nullif(btrim(pr.email), '') from public.profiles pr where pr.id = p_user),
    'Team member');
$$;

-- The company an external responder answers for; null for builder staff.
create or replace function public.rfi_user_company(p_org uuid, p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select c.company_name
  from public.subcontractor_portal_accounts a
  join public.subcontractor_companies c on c.id = a.subcontractor_company_id
  where a.user_id = p_user and a.organization_id = p_org and a.status = 'active'
    and not public.rfi_is_staff_user(p_org, p_user)
  limit 1;
$$;

-- Builder staff who may ask questions on a project: existing internal project access, nothing more.
create or replace function public.rfi_can_ask(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_feature_enabled(p_org, 'rfis')
     and public.is_org_staff(p_org)
     and public.can_view_project_internal(p_project);
$$;

-- Administrators and project managers on projects they can open.
create or replace function public.rfi_can_manage(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_feature_enabled(p_org, 'rfis')
     and public.is_org_manager(p_org)
     and public.can_view_project_internal(p_project);
$$;

-- Requester rights: the creator (while still on the project) and authorized managers.
create or replace function public.rfi_can_edit(p_rfi uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_rfis r
    where r.id = p_rfi
      and (public.rfi_can_manage(r.organization_id, r.project_id)
           or (r.created_by = auth.uid() and public.rfi_can_ask(r.organization_id, r.project_id))));
$$;

-- Everyone who works the question: requester, managers, project staff, and the current responder. No homeowners.
-- Drafts stay with their creator and managers. A reassigned responder drops out immediately.
create or replace function public.rfi_can_participate(p_rfi uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_rfis r
    where r.id = p_rfi
      and public.is_feature_enabled(r.organization_id, 'rfis')
      and (public.rfi_can_manage(r.organization_id, r.project_id)
           or (r.created_by = auth.uid() and public.rfi_can_ask(r.organization_id, r.project_id))
           or (r.status <> 'draft' and public.rfi_can_ask(r.organization_id, r.project_id))
           or (r.status <> 'draft' and r.responder_user_id = auth.uid()
               and public.rfi_user_eligible(r.project_id, auth.uid()))));
$$;

-- Participants, plus linked homeowners for a question a manager explicitly shared (read-only).
create or replace function public.rfi_can_view(p_rfi uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.rfi_can_participate(p_rfi)
      or exists (
        select 1 from public.project_rfis r
        where r.id = p_rfi and r.status <> 'draft' and r.homeowner_shared
          and public.is_feature_enabled(r.organization_id, 'rfis')
          and public.is_project_homeowner(r.project_id));
$$;

create or replace function public.rfi_path_rfi(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_name ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/){3}(question|answer)/[^/]+$'
              then split_part(p_name, '/', 3)::uuid end;
$$;

-- Question files: the requester side while the question is a draft or open.
-- Answer files: the current responder while the question is open.
create or replace function public.rfi_can_upload_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_rfis r
    where r.id = public.rfi_path_rfi(p_name)
      and split_part(p_name, '/', 1) = r.organization_id::text
      and split_part(p_name, '/', 2) = r.project_id::text
      and public.is_feature_enabled(r.organization_id, 'rfis')
      and case split_part(p_name, '/', 4)
            when 'question' then r.status in ('draft', 'open') and public.rfi_can_edit(r.id)
            when 'answer' then r.status = 'open' and r.responder_user_id = auth.uid()
                               and public.rfi_user_eligible(r.project_id, auth.uid())
            else false
          end);
$$;

-- A registered file follows its question's access rules exactly.
create or replace function public.rfi_can_read_object(p_name text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_rfi_attachments a
    where a.storage_path = p_name and public.rfi_can_view(a.rfi_id));
$$;

-- ───────────────────────── RLS (read-only for clients) ─────────────────────────
alter table public.project_rfi_counters enable row level security;
alter table public.project_rfis enable row level security;
alter table public.project_rfi_responses enable row level security;
alter table public.project_rfi_comments enable row level security;
alter table public.project_rfi_events enable row level security;
alter table public.project_rfi_attachments enable row level security;

-- The counter has no client policies at all.
create policy project_rfis_select on public.project_rfis for select to authenticated
  using (public.rfi_can_view(id));
create policy project_rfi_responses_select on public.project_rfi_responses for select to authenticated
  using (public.rfi_can_view(rfi_id));
create policy project_rfi_attachments_select on public.project_rfi_attachments for select to authenticated
  using (public.rfi_can_view(rfi_id));
-- Comments and history are working notes: never shown to homeowners.
create policy project_rfi_comments_select on public.project_rfi_comments for select to authenticated
  using (public.rfi_can_participate(rfi_id));
create policy project_rfi_events_select on public.project_rfi_events for select to authenticated
  using (public.rfi_can_participate(rfi_id) and (not internal or public.is_org_staff(organization_id)));

revoke all on public.project_rfi_counters, public.project_rfis, public.project_rfi_responses,
  public.project_rfi_comments, public.project_rfi_events, public.project_rfi_attachments from anon, authenticated;
grant select on public.project_rfis, public.project_rfi_responses, public.project_rfi_comments,
  public.project_rfi_events, public.project_rfi_attachments to authenticated;

create policy project_rfis_objects_select on storage.objects for select to authenticated
  using (bucket_id = 'project-rfis'
         and (public.rfi_can_read_object(name)
              -- The uploader can see a file that is not attached to anything yet, so a failed step can be cleaned up.
              or (owner_id = auth.uid()::text
                  and not exists (select 1 from public.project_rfi_attachments a where a.storage_path = name))));
create policy project_rfis_objects_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-rfis' and public.rfi_can_upload_object(name));
create policy project_rfis_objects_delete_unregistered on storage.objects for delete to authenticated
  using (bucket_id = 'project-rfis'
         and owner_id = auth.uid()::text
         and not exists (select 1 from public.project_rfi_attachments a where a.storage_path = name));

-- ───────────────────────── Internal write helpers ─────────────────────────
create or replace function public.rfi_ref(r public.project_rfis)
returns text language sql immutable set search_path = '' as $$
  select case when r.rfi_number is null then 'Draft question' else 'RFI-' || lpad(r.rfi_number::text, 3, '0') end;
$$;

create or replace function public.rfi_result(r public.project_rfis, p_replayed boolean default false)
returns jsonb language sql immutable set search_path = '' as $$
  select jsonb_build_object('id', r.id, 'row_version', r.row_version, 'status', r.status,
                            'rfi_number', r.rfi_number, 'replayed', p_replayed);
$$;

-- Locks the question for the rest of the transaction and confirms the caller may see it at all.
create or replace function public.rfi_lock(p_rfi uuid)
returns public.project_rfis language plpgsql security definer set search_path = '' as $$
declare r public.project_rfis;
begin
  if auth.uid() is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select * into r from public.project_rfis where id = p_rfi for update;
  if not found or not public.rfi_can_participate(p_rfi) then
    raise exception 'This question is not available.' using errcode = '42501';
  end if;
  return r;
end;
$$;

create or replace function public.rfi_check_version(r public.project_rfis, p_expected integer)
returns void language plpgsql set search_path = '' as $$
begin
  if p_expected is null or p_expected <> r.row_version then
    raise exception 'This question changed since you opened it. Reload to see the latest version, then try again.'
      using errcode = '40001';
  end if;
end;
$$;

create or replace function public.rfi_replayed(p_rfi uuid, p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_request is not null and exists (
    select 1 from public.project_rfi_events e
    where e.request_id = p_request and e.rfi_id = p_rfi and e.actor_id = auth.uid());
$$;

create or replace function public.rfi_log(
  r public.project_rfis, p_type text, p_from text, p_to text, p_note text, p_details jsonb, p_request uuid,
  p_internal boolean default false)
returns void language sql security definer set search_path = '' as $$
  insert into public.project_rfi_events
    (organization_id, project_id, rfi_id, event_type, internal, actor_id, actor_name, from_status, to_status, note, details, request_id)
  values (r.organization_id, r.project_id, r.id, p_type, p_internal, auth.uid(),
          public.rfi_user_name(r.organization_id, auth.uid()), p_from, p_to,
          nullif(btrim(coalesce(p_note, '')), ''), coalesce(p_details, '{}'::jsonb), p_request);
$$;

-- One in-app notification, linked to the view the recipient can actually open. Never notifies the actor.
create or replace function public.rfi_notify(
  r public.project_rfis, p_user uuid, p_title text, p_key text, p_action boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_link text;
begin
  if p_user is null or p_user = auth.uid() then return; end if;
  if public.rfi_is_staff_user(r.organization_id, p_user) then
    v_link := '/projects/' || r.project_id || '/rfis?rfi=' || r.id;
  elsif public.rfi_user_eligible(r.project_id, p_user) then
    v_link := '/sub/questions/' || r.id;
  else
    return;
  end if;
  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, dedupe_key, action_required)
  values (r.organization_id, p_user, p_title, left(r.subject, 200), v_link, 'rfi', r.project_id,
          'rfi:' || r.id || ':' || p_key, p_action)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

-- Clears earlier "your turn" notices for this question once the turn has passed.
create or replace function public.rfi_resolve_notices(r public.project_rfis, p_users uuid[])
returns void language sql security definer set search_path = '' as $$
  update public.notifications n set acknowledged_at = now()
  where n.user_id = any (p_users) and n.acknowledged_at is null and n.action_required
    and n.dedupe_key like 'rfi:' || r.id || ':%';
$$;

create or replace function public.rfi_file_ok(p_rfi public.project_rfis, p_kind text, p_path text, p_name text, p_type text, p_size bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_path is null or public.rfi_path_rfi(p_path) is distinct from p_rfi.id
     or split_part(p_path, '/', 1) <> p_rfi.organization_id::text
     or split_part(p_path, '/', 2) <> p_rfi.project_id::text
     or split_part(p_path, '/', 4) <> p_kind then
    raise exception 'This file does not belong to this question.';
  end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 200 then
    raise exception 'The file needs a name of 200 characters or fewer.';
  end if;
  if p_size is null or p_size not between 1 and 26214400 then
    raise exception 'Files must be 25 MB or smaller.';
  end if;
  if coalesce(p_type, '') not in (
    'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/msword', 'text/csv') then
    raise exception 'This file type is not supported. Use PDF, image, Word, Excel, or CSV files.';
  end if;
  if not exists (select 1 from storage.objects o
                 where o.bucket_id = 'project-rfis' and o.name = p_path and o.owner_id = auth.uid()::text) then
    raise exception 'The file was not uploaded. Try attaching it again.';
  end if;
  if exists (select 1 from public.project_rfi_attachments a where a.storage_path = p_path) then
    raise exception 'This file is already attached.';
  end if;
end;
$$;

-- ───────────────────────── Requester: draft, send, amend ─────────────────────────
-- Creates the draft (p_rfi is the client-chosen id, so a retried create lands on the same row) or updates it.
create or replace function public.rfi_save_draft(p_rfi uuid, p_project uuid, p_expected_version integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_archived timestamptz;
  r public.project_rfis;
  v_subject text := btrim(coalesce(p_payload ->> 'subject', ''));
  v_question text := coalesce(p_payload ->> 'question', '');
  v_responder uuid := nullif(p_payload ->> 'responder_user_id', '')::uuid;
  v_due date := nullif(p_payload ->> 'due_date', '')::date;
  v_location text := nullif(btrim(coalesce(p_payload ->> 'location', '')), '');
  v_doc uuid := nullif(p_payload ->> 'document_version_id', '')::uuid;
  v_doc_label text;
begin
  if auth.uid() is null or p_rfi is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select p.organization_id, p.archived_at into v_org, v_archived from public.projects p where p.id = p_project;
  if v_org is null or not public.rfi_can_ask(v_org, p_project) then
    raise exception 'You do not have access to ask questions on this project.' using errcode = '42501';
  end if;
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'Add a subject of 200 characters or fewer.';
  end if;
  if char_length(v_question) > 10000 then
    raise exception 'The question is too long. Keep it under 10,000 characters.';
  end if;
  if v_location is not null and char_length(v_location) > 300 then
    raise exception 'The location is too long. Keep it under 300 characters.';
  end if;
  if v_responder is not null and not public.rfi_user_eligible(p_project, v_responder) then
    raise exception 'The selected responder cannot sign in to this project yet. Choose someone with access, or set up their access first.';
  end if;
  if v_doc is not null then
    select left(d.name || ' (v' || v.version_number || ')', 300) into v_doc_label
    from public.project_document_versions v
    join public.project_documents d on d.id = v.document_id
    where v.id = v_doc and d.scope = 'project' and d.project_id = p_project
      and public.can_view_document_version(v.id);
    if v_doc_label is null then
      raise exception 'That document is not available on this project.';
    end if;
  end if;

  select * into r from public.project_rfis where id = p_rfi for update;
  if not found then
    if v_archived is not null then
      raise exception 'This project is archived. Restore it before asking a new question.';
    end if;
    insert into public.project_rfis
      (id, organization_id, project_id, subject, question, responder_user_id, responder_name, responder_company,
       due_date, location, document_version_id, document_label, created_by, created_by_name)
    values (p_rfi, v_org, p_project, v_subject, v_question, v_responder,
            case when v_responder is not null then public.rfi_user_name(v_org, v_responder) end,
            case when v_responder is not null then public.rfi_user_company(v_org, v_responder) end,
            v_due, v_location, v_doc, v_doc_label, auth.uid(), public.rfi_user_name(v_org, auth.uid()))
    returning * into r;
    perform public.rfi_log(r, 'created', null, 'draft', null, '{}'::jsonb, null, true);
    return public.rfi_result(r);
  end if;

  if r.project_id <> p_project or not public.rfi_can_edit(r.id) then
    raise exception 'This question is not available.' using errcode = '42501';
  end if;
  if r.status <> 'draft' then
    raise exception 'This question has already been sent. Reload to see it.' using errcode = '40001';
  end if;
  if p_expected_version is not null and p_expected_version <> r.row_version then
    raise exception 'This draft changed since you opened it. Reload to see the latest version, then try again.'
      using errcode = '40001';
  end if;
  update public.project_rfis set
    subject = v_subject, question = v_question, responder_user_id = v_responder,
    responder_name = case when v_responder is not null then public.rfi_user_name(v_org, v_responder) end,
    responder_company = case when v_responder is not null then public.rfi_user_company(v_org, v_responder) end,
    due_date = v_due, location = v_location, document_version_id = v_doc, document_label = v_doc_label,
    row_version = row_version + 1
  where id = r.id returning * into r;
  return public.rfi_result(r);
end;
$$;

create or replace function public.rfi_send(p_rfi uuid, p_expected_version integer, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.project_rfis;
  v_number integer;
begin
  r := public.rfi_lock(p_rfi);
  if public.rfi_replayed(p_rfi, p_request) then return public.rfi_result(r, true); end if;
  if not public.rfi_can_edit(r.id) then
    raise exception 'Only the person who wrote this question or a project manager can send it.' using errcode = '42501';
  end if;
  if r.status <> 'draft' then
    raise exception 'This question has already been sent. Reload to see it.' using errcode = '40001';
  end if;
  perform public.rfi_check_version(r, p_expected_version);
  if exists (select 1 from public.projects p where p.id = r.project_id and p.archived_at is not null) then
    raise exception 'This project is archived. Restore it before sending a question.';
  end if;
  if char_length(btrim(r.question)) = 0 then
    raise exception 'Write the question before sending.';
  end if;
  if r.responder_user_id is null then
    raise exception 'Choose who should answer before sending.';
  end if;
  if not public.rfi_user_eligible(r.project_id, r.responder_user_id) then
    raise exception '% can no longer sign in to this project. Choose another responder, or restore their access first.',
      coalesce(r.responder_name, 'The selected responder');
  end if;

  insert into public.project_rfi_counters (project_id, last_number) values (r.project_id, 1)
  on conflict (project_id) do update set last_number = public.project_rfi_counters.last_number + 1
  returning last_number into v_number;

  update public.project_rfis set
    status = 'open', rfi_number = v_number, cycle = 1, sent_at = now(), row_version = row_version + 1,
    responder_name = public.rfi_user_name(r.organization_id, r.responder_user_id),
    responder_company = public.rfi_user_company(r.organization_id, r.responder_user_id)
  where id = r.id returning * into r;

  perform public.rfi_log(r, 'sent', 'draft', 'open', null, jsonb_build_object(
    'subject', r.subject, 'question', r.question, 'due_date', r.due_date, 'location', r.location,
    'document_version_id', r.document_version_id, 'document_label', r.document_label,
    'responder_user_id', r.responder_user_id, 'responder_name', r.responder_name,
    'responder_company', r.responder_company), p_request);
  perform public.rfi_notify(r, r.responder_user_id, 'New question for you: ' || public.rfi_ref(r),
                            'v' || r.row_version || ':assigned', true);
  return public.rfi_result(r);
end;
$$;

-- Changes to an open question are recorded with the before and after values; the sent snapshot is never edited.
create or replace function public.rfi_amend(p_rfi uuid, p_expected_version integer, p_payload jsonb, p_note text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.project_rfis;
  o public.project_rfis;
  v_subject text := btrim(coalesce(p_payload ->> 'subject', ''));
  v_question text := coalesce(p_payload ->> 'question', '');
  v_due date := nullif(p_payload ->> 'due_date', '')::date;
  v_location text := nullif(btrim(coalesce(p_payload ->> 'location', '')), '');
begin
  r := public.rfi_lock(p_rfi);
  if public.rfi_replayed(p_rfi, p_request) then return public.rfi_result(r, true); end if;
  if not public.rfi_can_edit(r.id) then
    raise exception 'Only the person who asked this question or a project manager can change it.' using errcode = '42501';
  end if;
  if r.status <> 'open' then
    raise exception 'Only an open question can be amended. Request clarification to reopen it first.' using errcode = '40001';
  end if;
  perform public.rfi_check_version(r, p_expected_version);
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'Add a subject of 200 characters or fewer.';
  end if;
  if char_length(btrim(v_question)) = 0 or char_length(v_question) > 10000 then
    raise exception 'Write the question (up to 10,000 characters).';
  end if;
  if v_location is not null and char_length(v_location) > 300 then
    raise exception 'The location is too long. Keep it under 300 characters.';
  end if;
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Describe what changed so the responder knows.';
  end if;
  o := r;
  if o.subject = v_subject and o.question = v_question and o.due_date is not distinct from v_due
     and o.location is not distinct from v_location then
    raise exception 'Nothing was changed.';
  end if;
  update public.project_rfis set
    subject = v_subject, question = v_question, due_date = v_due, location = v_location, row_version = row_version + 1
  where id = r.id returning * into r;
  perform public.rfi_log(r, 'amended', 'open', 'open', p_note, jsonb_build_object(
    'before', jsonb_build_object('subject', o.subject, 'question', o.question, 'due_date', o.due_date, 'location', o.location),
    'after', jsonb_build_object('subject', r.subject, 'question', r.question, 'due_date', r.due_date, 'location', r.location)),
    p_request);
  perform public.rfi_notify(r, r.responder_user_id, 'Question updated: ' || public.rfi_ref(r),
                            'v' || r.row_version || ':amended', true);
  return public.rfi_result(r);
end;
$$;

create or replace function public.rfi_reassign(p_rfi uuid, p_expected_version integer, p_responder uuid, p_note text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.project_rfis;
  o public.project_rfis;
begin
  r := public.rfi_lock(p_rfi);
  if public.rfi_replayed(p_rfi, p_request) then return public.rfi_result(r, true); end if;
  if not public.rfi_can_edit(r.id) then
    raise exception 'Only the person who asked this question or a project manager can reassign it.' using errcode = '42501';
  end if;
  if r.status = 'draft' then
    raise exception 'Choose the responder in the draft before sending.';
  end if;
  perform public.rfi_check_version(r, p_expected_version);
  if p_responder is null or p_responder is not distinct from r.responder_user_id then
    raise exception 'Choose a different responder.';
  end if;
  if not public.rfi_user_eligible(r.project_id, p_responder) then
    raise exception 'The selected responder cannot sign in to this project yet. Choose someone with access, or set up their access first.';
  end if;
  o := r;
  update public.project_rfis set
    responder_user_id = p_responder,
    responder_name = public.rfi_user_name(r.organization_id, p_responder),
    responder_company = public.rfi_user_company(r.organization_id, p_responder),
    row_version = row_version + 1
  where id = r.id returning * into r;
  perform public.rfi_log(r, 'reassigned', r.status, r.status, p_note, jsonb_build_object(
    'from_user_id', o.responder_user_id, 'from_name', o.responder_name, 'from_company', o.responder_company,
    'to_user_id', r.responder_user_id, 'to_name', r.responder_name, 'to_company', r.responder_company), p_request);
  perform public.rfi_resolve_notices(r, array[o.responder_user_id]);
  perform public.rfi_notify(r, r.responder_user_id,
    case when r.status = 'open' then 'Question assigned to you: ' else 'You are now the responder on ' end || public.rfi_ref(r),
    'v' || r.row_version || ':assigned', r.status = 'open');
  return public.rfi_result(r);
end;
$$;

-- ───────────────────────── Responder: official answer ─────────────────────────
create or replace function public.rfi_answer(p_rfi uuid, p_expected_version integer, p_body text, p_files jsonb, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.project_rfis;
  v_response uuid;
  f jsonb;
  v_files jsonb := coalesce(p_files, '[]'::jsonb);
begin
  r := public.rfi_lock(p_rfi);
  if public.rfi_replayed(p_rfi, p_request) then return public.rfi_result(r, true); end if;
  if r.responder_user_id is distinct from auth.uid() or not public.rfi_user_eligible(r.project_id, auth.uid()) then
    raise exception 'Only the assigned responder can submit the official answer.' using errcode = '42501';
  end if;
  if r.status <> 'open' then
    raise exception 'This question is no longer waiting for an answer. Reload to see its current status.' using errcode = '40001';
  end if;
  perform public.rfi_check_version(r, p_expected_version);
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 10000 then
    raise exception 'Write your answer (up to 10,000 characters).';
  end if;
  if jsonb_typeof(v_files) <> 'array' or jsonb_array_length(v_files) > 10 then
    raise exception 'Attach up to 10 files.';
  end if;

  insert into public.project_rfi_responses
    (organization_id, project_id, rfi_id, cycle, body, responded_by, responded_by_name, responded_by_company)
  values (r.organization_id, r.project_id, r.id, r.cycle, p_body, auth.uid(),
          public.rfi_user_name(r.organization_id, auth.uid()), public.rfi_user_company(r.organization_id, auth.uid()))
  returning id into v_response;

  for f in select * from jsonb_array_elements(v_files) loop
    perform public.rfi_file_ok(r, 'answer', f ->> 'path', f ->> 'name', f ->> 'type', (f ->> 'size')::bigint);
    insert into public.project_rfi_attachments
      (organization_id, project_id, rfi_id, kind, response_id, storage_path, file_name, content_type, size_bytes, uploaded_by)
    values (r.organization_id, r.project_id, r.id, 'answer', v_response, f ->> 'path', btrim(f ->> 'name'),
            f ->> 'type', (f ->> 'size')::bigint, auth.uid());
  end loop;

  update public.project_rfis set status = 'answered', answered_at = now(), row_version = row_version + 1
  where id = r.id returning * into r;
  perform public.rfi_log(r, 'answered', 'open', 'answered', null,
                         jsonb_build_object('response_id', v_response, 'files', jsonb_array_length(v_files)), p_request);
  perform public.rfi_resolve_notices(r, array[auth.uid()]);
  perform public.rfi_notify(
    r,
    coalesce(
      case when public.rfi_user_eligible(r.project_id, r.created_by) then r.created_by end,
      (select p.project_manager_id from public.projects p where p.id = r.project_id)),
    public.rfi_ref(r) || ' was answered. Review and close it.', 'v' || r.row_version || ':answered', true);
  return public.rfi_result(r);
end;
$$;

-- ───────────────────────── Requester: close, request clarification ─────────────────────────
create or replace function public.rfi_transition(p_rfi uuid, p_expected_version integer, p_action text, p_reason text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.project_rfis;
  v_from text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  r := public.rfi_lock(p_rfi);
  if public.rfi_replayed(p_rfi, p_request) then return public.rfi_result(r, true); end if;
  if not public.rfi_can_edit(r.id) then
    raise exception 'Only the person who asked this question or a project manager can do that.' using errcode = '42501';
  end if;
  perform public.rfi_check_version(r, p_expected_version);
  if v_reason is not null and char_length(v_reason) > 2000 then
    raise exception 'Keep the reason under 2,000 characters.';
  end if;
  v_from := r.status;

  if p_action = 'close' then
    if r.status not in ('open', 'answered') then
      raise exception 'This question cannot be closed from its current status. Reload to see it.' using errcode = '40001';
    end if;
    if r.status = 'open' and v_reason is null then
      raise exception 'Give a reason for closing a question that has not been answered.';
    end if;
    update public.project_rfis set status = 'closed', closed_at = now(), row_version = row_version + 1
    where id = r.id returning * into r;
    perform public.rfi_log(r, 'closed', v_from, 'closed', v_reason, '{}'::jsonb, p_request);
    perform public.rfi_resolve_notices(r, array[r.responder_user_id, r.created_by, auth.uid()]);
    perform public.rfi_notify(r, r.responder_user_id, public.rfi_ref(r) || ' was closed',
                              'v' || r.row_version || ':closed', false);
  elsif p_action = 'reopen' then
    if r.status not in ('answered', 'closed') then
      raise exception 'This question is already open. Reload to see it.' using errcode = '40001';
    end if;
    if v_reason is null then
      raise exception 'Explain what needs clarification.';
    end if;
    if not public.rfi_user_eligible(r.project_id, r.responder_user_id) then
      raise exception '% can no longer sign in to this project. Reassign the question before requesting clarification.',
        coalesce(r.responder_name, 'The responder');
    end if;
    update public.project_rfis set
      status = 'open', cycle = cycle + 1, answered_at = null, closed_at = null, row_version = row_version + 1
    where id = r.id returning * into r;
    perform public.rfi_log(r, 'reopened', v_from, 'open', v_reason, '{}'::jsonb, p_request);
    perform public.rfi_resolve_notices(r, array[r.created_by, auth.uid()]);
    perform public.rfi_notify(r, r.responder_user_id, 'Clarification requested: ' || public.rfi_ref(r),
                              'v' || r.row_version || ':reopened', true);
  else
    raise exception 'Unknown action.';
  end if;
  return public.rfi_result(r);
end;
$$;

-- ───────────────────────── Comments, sharing, question files ─────────────────────────
-- Comments never change the status or the row version.
create or replace function public.rfi_comment(p_rfi uuid, p_comment uuid, p_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.project_rfis;
begin
  r := public.rfi_lock(p_rfi);
  if p_comment is null then raise exception 'Invalid comment.'; end if;
  if r.status = 'draft' then
    raise exception 'Comments open once the question is sent.';
  end if;
  if char_length(btrim(coalesce(p_body, ''))) not between 1 and 4000 then
    raise exception 'Write a comment of up to 4,000 characters.';
  end if;
  insert into public.project_rfi_comments (id, organization_id, project_id, rfi_id, body, author_id, author_name)
  values (p_comment, r.organization_id, r.project_id, r.id, btrim(p_body), auth.uid(),
          public.rfi_user_name(r.organization_id, auth.uid()))
  on conflict (id) do nothing;
  if not exists (select 1 from public.project_rfi_comments c
                 where c.id = p_comment and c.rfi_id = r.id and c.author_id = auth.uid()) then
    raise exception 'Invalid comment.';
  end if;
  return p_comment;
end;
$$;

-- Read-only homeowner sharing for one question. Grants nothing else on the project.
create or replace function public.rfi_set_homeowner_shared(p_rfi uuid, p_shared boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r public.project_rfis;
begin
  r := public.rfi_lock(p_rfi);
  if not public.rfi_can_manage(r.organization_id, r.project_id) then
    raise exception 'Only an administrator or project manager can share a question with the homeowner.' using errcode = '42501';
  end if;
  if r.status = 'draft' then
    raise exception 'Send the question before sharing it.';
  end if;
  if r.homeowner_shared is not distinct from coalesce(p_shared, false) then
    return public.rfi_result(r, true);
  end if;
  update public.project_rfis set homeowner_shared = coalesce(p_shared, false) where id = r.id returning * into r;
  perform public.rfi_log(r, case when r.homeowner_shared then 'shared' else 'unshared' end, r.status, r.status,
                         null, '{}'::jsonb, null, true);
  return public.rfi_result(r);
end;
$$;

create or replace function public.rfi_attachment_add(p_rfi uuid, p_path text, p_name text, p_type text, p_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  r public.project_rfis;
  v_id uuid;
begin
  r := public.rfi_lock(p_rfi);
  if not public.rfi_can_edit(r.id) then
    raise exception 'Only the person who asked this question or a project manager can attach files to it.' using errcode = '42501';
  end if;
  if r.status not in ('draft', 'open') then
    raise exception 'Files can be added to the question only while it is a draft or open.' using errcode = '40001';
  end if;
  select a.id into v_id from public.project_rfi_attachments a
  where a.storage_path = p_path and a.rfi_id = r.id and a.uploaded_by = auth.uid();
  if v_id is not null then return v_id; end if;
  if (select count(*) from public.project_rfi_attachments a where a.rfi_id = r.id and a.kind = 'question') >= 10 then
    raise exception 'A question can have up to 10 files.';
  end if;
  perform public.rfi_file_ok(r, 'question', p_path, p_name, p_type, p_size);
  insert into public.project_rfi_attachments
    (organization_id, project_id, rfi_id, kind, storage_path, file_name, content_type, size_bytes, uploaded_by)
  values (r.organization_id, r.project_id, r.id, 'question', p_path, btrim(p_name), p_type, p_size, auth.uid())
  returning id into v_id;
  if r.status = 'open' then
    perform public.rfi_log(r, 'attachment_added', 'open', 'open', null, jsonb_build_object('file_name', btrim(p_name)), null);
  end if;
  return v_id;
end;
$$;

-- Draft only. Returns the storage path so the caller can remove the now-unreferenced object.
create or replace function public.rfi_attachment_remove(p_attachment uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  a public.project_rfi_attachments;
  r public.project_rfis;
begin
  select * into a from public.project_rfi_attachments where id = p_attachment;
  if not found then raise exception 'This file is not available.' using errcode = '42501'; end if;
  r := public.rfi_lock(a.rfi_id);
  if not public.rfi_can_edit(r.id) then
    raise exception 'This file is not available.' using errcode = '42501';
  end if;
  if r.status <> 'draft' or a.kind <> 'question' then
    raise exception 'Files on a sent question are kept as history.';
  end if;
  delete from public.project_rfi_attachments where id = a.id;
  return a.storage_path;
end;
$$;

-- ───────────────────────── Reads that cross table permissions ─────────────────────────
-- Responder choices for the requester, including people who cannot be chosen yet and why.
create or replace function public.rfi_responder_options(p_project uuid)
returns table (
  option_key text, user_id uuid, full_name text, email text, kind text,
  company_id uuid, company_name text, person_id uuid, eligible boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_org uuid;
  v_subs boolean;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null or not public.rfi_can_ask(v_org, p_project) then
    raise exception 'You do not have access to this project.' using errcode = '42501';
  end if;
  v_subs := public.is_feature_enabled(v_org, 'subcontractors');
  return query
  with staff as (
    select m.user_id as uid,
           coalesce(nullif(btrim(pr.full_name), ''), nullif(btrim(pr.email), ''), 'Team member') as name,
           pr.email as mail, m.activation_required as pending,
           public.rfi_user_eligible(p_project, m.user_id) as ok
    from public.organization_memberships m
    left join public.profiles pr on pr.id = m.user_id
    where m.organization_id = v_org and m.status = 'active'
      and m.role in ('org_admin', 'project_manager', 'builder_staff')
  ), companies as (
    select c.id as cid, c.company_name as cname, c.status as cstatus
    from public.subcontractor_project_assignments spa
    join public.subcontractor_companies c on c.id = spa.subcontractor_company_id
    where v_subs and spa.project_id = p_project and spa.ended_at is null
  ), accounts as (
    select a.user_id as uid, a.full_name as name, a.email as mail, co.cid, co.cname, co.cstatus
    from companies co
    join public.subcontractor_portal_accounts a
      on a.subcontractor_company_id = co.cid and a.organization_id = v_org and a.status = 'active'
    where a.user_id not in (select s.uid from staff s)
  ), directory as (
    select bp.id as pid, btrim(bp.first_name || ' ' || bp.last_name) as name, bp.email as mail,
           (select bc.company_name from public.business_person_companies bpc
              join public.business_companies bc on bc.id = bpc.company_id
             where bpc.id = bpp.person_company_id) as cname
    from public.business_person_projects bpp
    join public.business_people bp on bp.id = bpp.person_id and bp.status = 'active'
    where bpp.project_id = p_project and bpp.status = 'active' and bpp.organization_id = v_org
  )
  select 'user:' || s.uid, s.uid, s.name, s.mail, 'team'::text, null::uuid, null::text, null::uuid, s.ok,
         case when s.ok then null when s.pending then 'not_activated' else 'not_on_project' end
  from staff s
  union all
  select 'user:' || a.uid, a.uid, a.name, a.mail, 'subcontractor'::text, a.cid, a.cname, null::uuid,
         a.cstatus = 'active', case when a.cstatus = 'active' then null else 'company_inactive' end
  from accounts a
  union all
  select 'company:' || co.cid, null::uuid, co.cname, null::text, 'subcontractor'::text, co.cid, co.cname, null::uuid,
         false, 'no_portal_account'
  from companies co
  where not exists (select 1 from accounts a where a.cid = co.cid)
  union all
  select distinct on (d.pid) 'person:' || d.pid, null::uuid, d.name, d.mail, 'directory'::text, null::uuid, d.cname, d.pid,
         false, 'directory_only'
  from directory d
  where d.mail is null
     or (lower(d.mail) not in (select lower(s.mail) from staff s where s.mail is not null)
         and lower(d.mail) not in (select lower(a.mail) from accounts a));
end;
$$;

-- Questions assigned to the caller, for people who cannot read the projects table (subcontractor workspace).
create or replace function public.my_assigned_rfis()
returns table (
  id uuid, organization_id uuid, project_id uuid, project_name text, rfi_number integer, status text,
  subject text, due_date date, sent_at timestamptz, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.organization_id, r.project_id, p.name, r.rfi_number, r.status, r.subject, r.due_date, r.sent_at, r.updated_at
  from public.project_rfis r
  join public.projects p on p.id = r.project_id
  where r.responder_user_id = auth.uid() and r.status <> 'draft'
    and public.is_feature_enabled(r.organization_id, 'rfis')
    and public.rfi_user_eligible(r.project_id, auth.uid())
  order by (r.status = 'open') desc, r.due_date asc nulls last, r.updated_at desc;
$$;

-- The storage path of the referenced document version, only for a caller who may open that document.
create or replace function public.rfi_document_path(p_rfi uuid)
returns text language sql stable security definer set search_path = '' as $$
  select v.storage_path
  from public.project_rfis r
  join public.project_document_versions v on v.id = r.document_version_id
  where r.id = p_rfi and public.rfi_can_view(r.id) and public.can_view_document_version(v.id);
$$;

-- ───────────────────────── Execute grants ─────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.rfi_can_ask(uuid, uuid)',
    'public.rfi_can_manage(uuid, uuid)',
    'public.rfi_can_edit(uuid)',
    'public.rfi_can_participate(uuid)',
    'public.rfi_can_view(uuid)',
    'public.rfi_can_upload_object(text)',
    'public.rfi_can_read_object(text)',
    'public.rfi_save_draft(uuid, uuid, integer, jsonb)',
    'public.rfi_send(uuid, integer, uuid)',
    'public.rfi_amend(uuid, integer, jsonb, text, uuid)',
    'public.rfi_reassign(uuid, integer, uuid, text, uuid)',
    'public.rfi_answer(uuid, integer, text, jsonb, uuid)',
    'public.rfi_transition(uuid, integer, text, text, uuid)',
    'public.rfi_comment(uuid, uuid, text)',
    'public.rfi_set_homeowner_shared(uuid, boolean)',
    'public.rfi_attachment_add(uuid, text, text, text, bigint)',
    'public.rfi_attachment_remove(uuid)',
    'public.rfi_responder_options(uuid)',
    'public.my_assigned_rfis()',
    'public.rfi_document_path(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
  -- Internal building blocks: reachable only from the functions above.
  foreach f in array array[
    'public.rfi_user_eligible(uuid, uuid)',
    'public.rfi_is_staff_user(uuid, uuid)',
    'public.rfi_user_name(uuid, uuid)',
    'public.rfi_user_company(uuid, uuid)',
    'public.rfi_lock(uuid)',
    'public.rfi_check_version(public.project_rfis, integer)',
    'public.rfi_replayed(uuid, uuid)',
    'public.rfi_log(public.project_rfis, text, text, text, text, jsonb, uuid, boolean)',
    'public.rfi_notify(public.project_rfis, uuid, text, text, boolean)',
    'public.rfi_resolve_notices(public.project_rfis, uuid[])',
    'public.rfi_file_ok(public.project_rfis, text, text, text, text, bigint)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;
