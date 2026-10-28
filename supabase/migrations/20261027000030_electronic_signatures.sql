-- Electronic Signatures (Dropbox Sign). Additive only.
-- Requests, signers, and provider events are written exclusively by the server (service role) after
-- authorization checks and verified provider data. Clients only read, through RLS.
-- Signed artifacts live in the private project-documents bucket under signed/{org}/{project}/{request}/,
-- which no client storage policy grants, so they are only served through short-lived server-signed URLs.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation', true,  array[]::text[]),
    ('schedule',     true,  array[]::text[]),
    ('estimates',    true,  array[]::text[]),
    ('walkthroughs', true,  array[]::text[]),
    ('issues',       true,  array[]::text[]),
    ('warranty',     true,  array[]::text[]),
    ('portal',       true,  array[]::text[]),
    ('documents',    false, array[]::text[]),
    ('e_signatures', false, array['documents']),
    ('reports',      true,  array['walkthroughs']),
    ('invoices',     false, array[]::text[]),
    ('payments',     false, array['estimates']),
    ('quickbooks',   false, array['estimates'])
$$;

create table if not exists public.signature_requests (
  id uuid primary key,
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  document_id uuid not null references public.project_documents(id),
  source_version_id uuid not null references public.project_document_versions(id),
  provider text not null default 'dropbox_sign' check (provider in ('dropbox_sign')),
  provider_request_id text unique,
  signing_method text not null check (signing_method in ('email', 'embedded')),
  ordered boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'awaiting_signatures', 'partially_signed', 'completed', 'declined', 'cancelled', 'expired', 'failed')),
  title text not null check (char_length(title) between 1 and 200),
  message text check (message is null or char_length(message) <= 2000),
  test_mode boolean not null,
  requested_by uuid not null references auth.users(id),
  send_claimed_at timestamptz,
  error_message text,
  signed_storage_path text unique,
  signed_size_bytes bigint,
  signed_stored_at timestamptz,
  artifact_error text,
  provider_snapshot jsonb,
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists signature_requests_document_idx on public.signature_requests (document_id, created_at desc);
create index if not exists signature_requests_project_idx on public.signature_requests (project_id, created_at desc);
-- One open request per exact document version prevents duplicate sends from retries or double clicks.
create unique index if not exists signature_requests_one_open_per_version
  on public.signature_requests (source_version_id) where status in ('draft', 'awaiting_signatures', 'partially_signed');

create table if not exists public.signature_request_signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.signature_requests(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  signer_kind text not null check (signer_kind in ('homeowner', 'staff')),
  contact_id uuid references public.client_contacts(id),
  user_id uuid references auth.users(id),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (email = lower(email) and position('@' in email) > 1),
  signing_order int not null check (signing_order >= 0),
  initials_each_page boolean not null default false,
  provider_signature_id text unique,
  status text not null default 'awaiting' check (status in ('awaiting', 'on_hold', 'signed', 'declined', 'error')),
  signed_at timestamptz,
  last_viewed_at timestamptz,
  decline_reason text,
  updated_at timestamptz not null default now(),
  check ((signer_kind = 'homeowner' and contact_id is not null) or (signer_kind = 'staff' and user_id is not null)),
  unique (request_id, email),
  unique (request_id, signing_order)
);

create index if not exists signature_request_signers_user_idx on public.signature_request_signers (user_id) where user_id is not null;

create table if not exists public.signature_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.signature_requests(id),
  organization_id uuid not null references public.organizations(id),
  event_key text not null unique,
  event_type text not null,
  event_time timestamptz not null,
  provider_signature_id text,
  source text not null check (source in ('webhook', 'sync', 'app')),
  details jsonb,
  received_at timestamptz not null default now()
);

create index if not exists signature_events_request_idx on public.signature_events (request_id, event_time);

-- Signature records are evidence: never deleted, never moved between projects or organizations.
create or replace function public.signature_records_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Signature records cannot be deleted'; end if;
  if tg_table_name = 'signature_events' then raise exception 'Signature events are immutable'; end if;
  if new.organization_id is distinct from old.organization_id or new.project_id is distinct from old.project_id then
    raise exception 'Signature records cannot be moved';
  end if;
  if tg_table_name = 'signature_requests' then
    if new.document_id is distinct from old.document_id or new.source_version_id is distinct from old.source_version_id then
      raise exception 'The source document of a signature request cannot change';
    end if;
    if old.signed_storage_path is not null and new.signed_storage_path is distinct from old.signed_storage_path then
      raise exception 'A stored signed PDF cannot be replaced';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists signature_requests_guard on public.signature_requests;
create trigger signature_requests_guard before update or delete on public.signature_requests
  for each row execute function public.signature_records_guard();
drop trigger if exists signature_request_signers_guard on public.signature_request_signers;
create trigger signature_request_signers_guard before update or delete on public.signature_request_signers
  for each row execute function public.signature_records_guard();
drop trigger if exists signature_events_guard on public.signature_events;
create trigger signature_events_guard before update or delete on public.signature_events
  for each row execute function public.signature_records_guard();

-- Homeowner may read a request only when addressed to them and still linked to the project.
create or replace function public.is_signature_signer(p_request uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.signature_request_signers s
    join public.signature_requests r on r.id = s.request_id
    where s.request_id = p_request and s.user_id = auth.uid()
      and (s.signer_kind = 'staff' or public.is_project_homeowner(r.project_id))
  );
$$;
grant execute on function public.is_signature_signer(uuid) to authenticated;

alter table public.signature_requests enable row level security;
alter table public.signature_request_signers enable row level security;
alter table public.signature_events enable row level security;

-- History stays readable when the e-signature module is off; only the Documents module gates it.
drop policy if exists signature_requests_select on public.signature_requests;
create policy signature_requests_select on public.signature_requests for select using (
  public.is_feature_enabled(organization_id, 'documents')
  and (public.can_view_project_internal(project_id) or public.is_signature_signer(id))
);

drop policy if exists signature_request_signers_select on public.signature_request_signers;
create policy signature_request_signers_select on public.signature_request_signers for select using (
  public.is_feature_enabled(organization_id, 'documents')
  and (public.can_view_project_internal(project_id) or user_id = auth.uid())
);

drop policy if exists signature_events_select on public.signature_events;
create policy signature_events_select on public.signature_events for select using (
  public.is_feature_enabled(organization_id, 'documents')
  and exists (select 1 from public.signature_requests r where r.id = request_id and public.can_view_project_internal(r.project_id))
);

revoke insert, update, delete on public.signature_requests, public.signature_request_signers, public.signature_events from anon, authenticated;
grant select on public.signature_requests, public.signature_request_signers, public.signature_events to authenticated;
