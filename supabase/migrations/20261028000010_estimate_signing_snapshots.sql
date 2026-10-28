-- Links an estimate revision to the immutable PDF snapshot stored in the project document library
-- for electronic signing. One snapshot per estimate revision (estimate rows are per-revision).
-- The row is claimed first (document_id null) so concurrent "Request signatures" clicks cannot
-- create duplicate documents; the server fills in document/version after the upload succeeds.

create table if not exists public.estimate_signing_snapshots (
  estimate_id uuid primary key references public.estimates(id),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.projects(id),
  revision integer not null,
  document_id uuid references public.project_documents(id),
  version_id uuid references public.project_document_versions(id),
  created_by uuid not null references auth.users(id),
  claimed_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  constraint estimate_signing_snapshots_complete check ((document_id is null) = (version_id is null))
);

create unique index if not exists estimate_signing_snapshots_document_idx
  on public.estimate_signing_snapshots(document_id) where document_id is not null;

create or replace function public.estimate_signing_snapshots_guard()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.document_id is not null then raise exception 'Estimate signing snapshots cannot be deleted'; end if;
    return old;
  end if;
  if old.document_id is not null and (new.document_id is distinct from old.document_id or new.version_id is distinct from old.version_id) then
    raise exception 'An estimate signing snapshot is immutable once stored';
  end if;
  if new.estimate_id is distinct from old.estimate_id or new.organization_id is distinct from old.organization_id
     or new.project_id is distinct from old.project_id or new.revision is distinct from old.revision then
    raise exception 'An estimate signing snapshot cannot be moved';
  end if;
  return new;
end $$;

drop trigger if exists estimate_signing_snapshots_guard on public.estimate_signing_snapshots;
create trigger estimate_signing_snapshots_guard
  before update or delete on public.estimate_signing_snapshots
  for each row execute function public.estimate_signing_snapshots_guard();

alter table public.estimate_signing_snapshots enable row level security;

drop policy if exists estimate_signing_snapshots_select on public.estimate_signing_snapshots;
create policy estimate_signing_snapshots_select on public.estimate_signing_snapshots for select using (
  public.is_feature_enabled(organization_id, 'documents')
  and public.can_view_project_internal(project_id)
);

revoke insert, update, delete on public.estimate_signing_snapshots from anon, authenticated;
grant select on public.estimate_signing_snapshots to authenticated;
