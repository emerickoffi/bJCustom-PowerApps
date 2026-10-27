insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-documents', 'project-documents', false, 52428800, array['application/pdf'])
on conflict (id) do nothing;

create table public.walkthrough_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  walkthrough_id uuid not null references public.walkthroughs(id) on delete restrict,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  size_bytes bigint not null check (size_bytes > 0),
  outstanding_issue_count integer not null default 0,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now(),
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  acknowledgment_requested_at timestamptz,
  acknowledgment_requested_by uuid references auth.users(id) on delete set null,
  signoff_requested_at timestamptz,
  signoff_requested_by uuid references auth.users(id) on delete set null,
  unique (walkthrough_id, version)
);
create index walkthrough_reports_project_idx on public.walkthrough_reports (project_id, generated_at desc);

create or replace function public.walkthrough_reports_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_w record;
begin
  if tg_op = 'DELETE' then
    raise exception 'Issued reports cannot be deleted';
  end if;
  if tg_op = 'INSERT' then
    select w.organization_id, w.project_id, w.status into v_w from public.walkthroughs w where w.id = new.walkthrough_id;
    if v_w.organization_id is null or v_w.organization_id <> new.organization_id or v_w.project_id <> new.project_id then
      raise exception 'Walkthrough does not belong to this project';
    end if;
    if v_w.status <> 'submitted' then
      raise exception 'Reports can only be generated after the homeowner submits the walkthrough';
    end if;
    new.generated_by := auth.uid();
    new.generated_at := now();
    new.published_at := null; new.published_by := null;
    new.acknowledgment_requested_at := null; new.acknowledgment_requested_by := null;
    new.signoff_requested_at := null; new.signoff_requested_by := null;
    return new;
  end if;

  if new.organization_id <> old.organization_id or new.project_id <> old.project_id
     or new.walkthrough_id <> old.walkthrough_id or new.version <> old.version
     or new.snapshot <> old.snapshot or new.storage_path <> old.storage_path
     or new.sha256 <> old.sha256 or new.size_bytes <> old.size_bytes
     or new.outstanding_issue_count <> old.outstanding_issue_count
     or new.generated_at <> old.generated_at or new.generated_by is distinct from old.generated_by then
    raise exception 'Issued report versions are immutable. Generate a new version instead.';
  end if;

  if old.published_at is not null and (new.published_at is distinct from old.published_at or new.published_by is distinct from old.published_by) then
    raise exception 'Publication cannot be changed once recorded';
  end if;
  if old.published_at is null and new.published_at is not null then
    new.published_at := now(); new.published_by := auth.uid();
  end if;

  if new.acknowledgment_requested_at is distinct from old.acknowledgment_requested_at then
    if old.acknowledgment_requested_at is not null then raise exception 'Acknowledgment was already requested'; end if;
    if new.published_at is null then raise exception 'Publish the report before requesting acknowledgment'; end if;
    new.acknowledgment_requested_at := now(); new.acknowledgment_requested_by := auth.uid();
  elsif new.acknowledgment_requested_by is distinct from old.acknowledgment_requested_by then
    raise exception 'Acknowledgment request cannot be changed';
  end if;

  if new.signoff_requested_at is distinct from old.signoff_requested_at then
    if old.signoff_requested_at is not null then raise exception 'Final sign-off was already requested'; end if;
    if new.published_at is null then raise exception 'Publish the report before requesting sign-off'; end if;
    new.signoff_requested_at := now(); new.signoff_requested_by := auth.uid();
  elsif new.signoff_requested_by is distinct from old.signoff_requested_by then
    raise exception 'Sign-off request cannot be changed';
  end if;
  return new;
end;
$$;
create trigger walkthrough_reports_guard before insert or update or delete on public.walkthrough_reports
  for each row execute function public.walkthrough_reports_guard();
create trigger audit_walkthrough_reports after insert or update on public.walkthrough_reports
  for each row execute function public.write_audit_event();

alter table public.walkthrough_reports enable row level security;
create policy walkthrough_reports_select on public.walkthrough_reports for select to authenticated
  using (public.can_view_project_internal(project_id)
         or (published_at is not null and public.is_project_homeowner(project_id)));
create policy walkthrough_reports_insert on public.walkthrough_reports for insert to authenticated
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
create policy walkthrough_reports_update on public.walkthrough_reports for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));

create table public.report_acknowledgments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  report_id uuid not null references public.walkthrough_reports(id) on delete restrict,
  report_version integer not null,
  report_sha256 text not null,
  user_id uuid not null references auth.users(id) on delete restrict,
  signer_name text not null check (char_length(btrim(signer_name)) between 2 and 160),
  decision text not null check (decision in ('acknowledged', 'accepted', 'changes_requested')),
  comment text check (comment is null or char_length(comment) <= 2000),
  acknowledgment_text text not null check (char_length(acknowledgment_text) between 20 and 2000),
  created_at timestamptz not null default now()
);
create index report_acknowledgments_report_idx on public.report_acknowledgments (report_id, created_at desc);

create or replace function public.report_acknowledgments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.walkthrough_reports;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Acknowledgment records cannot be changed or removed';
  end if;
  select * into r from public.walkthrough_reports wr where wr.id = new.report_id;
  if r.id is null or r.published_at is null then
    raise exception 'This report has not been published';
  end if;
  new.organization_id := r.organization_id;
  new.project_id := r.project_id;
  new.report_version := r.version;
  new.report_sha256 := r.sha256;
  new.user_id := auth.uid();
  new.created_at := now();
  new.signer_name := btrim(new.signer_name);
  if new.decision in ('accepted', 'changes_requested') and r.acknowledgment_requested_at is null and r.signoff_requested_at is null then
    raise exception 'Your builder has not requested approval of this report';
  end if;
  if new.decision = 'changes_requested' and coalesce(btrim(new.comment), '') = '' then
    raise exception 'Describe the changes you are requesting';
  end if;
  return new;
end;
$$;
create trigger report_acknowledgments_guard before insert or update or delete on public.report_acknowledgments
  for each row execute function public.report_acknowledgments_guard();
create trigger audit_report_acknowledgments after insert on public.report_acknowledgments
  for each row execute function public.write_audit_event();

alter table public.report_acknowledgments enable row level security;
create policy report_acknowledgments_select on public.report_acknowledgments for select to authenticated
  using (user_id = auth.uid() or public.can_view_project_internal(project_id));
create policy report_acknowledgments_insert on public.report_acknowledgments for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_project_homeowner(project_id)
    and exists (select 1 from public.walkthrough_reports wr where wr.id = report_id and wr.published_at is not null)
  );

create table public.report_builder_signoffs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  report_id uuid not null references public.walkthrough_reports(id) on delete restrict,
  report_version integer not null,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  decision text not null check (decision in ('verified', 'rejected')),
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now()
);
create index report_builder_signoffs_report_idx on public.report_builder_signoffs (report_id, created_at desc);

create or replace function public.report_builder_signoffs_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare r public.walkthrough_reports;
begin
  if tg_op <> 'INSERT' then
    raise exception 'Sign-off records cannot be changed or removed';
  end if;
  select * into r from public.walkthrough_reports wr where wr.id = new.report_id;
  if r.id is null then raise exception 'Report not found'; end if;
  new.organization_id := r.organization_id;
  new.project_id := r.project_id;
  new.report_version := r.version;
  new.reviewer_id := auth.uid();
  new.created_at := now();
  if new.decision = 'rejected' and coalesce(btrim(new.comment), '') = '' then
    raise exception 'Explain why the report is not verified';
  end if;
  return new;
end;
$$;
create trigger report_builder_signoffs_guard before insert or update or delete on public.report_builder_signoffs
  for each row execute function public.report_builder_signoffs_guard();
create trigger audit_report_builder_signoffs after insert on public.report_builder_signoffs
  for each row execute function public.write_audit_event();

alter table public.report_builder_signoffs enable row level security;
create policy report_builder_signoffs_select on public.report_builder_signoffs for select to authenticated
  using (public.can_view_project_internal(project_id)
         or exists (select 1 from public.walkthrough_reports wr where wr.id = report_id and wr.published_at is not null and public.is_project_homeowner(wr.project_id)));
create policy report_builder_signoffs_insert on public.report_builder_signoffs for insert to authenticated
  with check (reviewer_id = auth.uid() and public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));

create table public.report_signature_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  report_id uuid not null references public.walkthrough_reports(id) on delete restrict,
  signer_user_id uuid not null references auth.users(id) on delete restrict,
  signer_role text not null check (signer_role in ('homeowner', 'builder')),
  signer_name text not null,
  status text not null default 'integration_not_configured'
    check (status in ('integration_not_configured', 'awaiting_signature', 'signed', 'declined', 'expired')),
  provider text,
  provider_envelope_id text,
  signed_storage_path text,
  certificate_storage_path text,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (report_id, signer_user_id)
);
create index report_signature_requests_report_idx on public.report_signature_requests (report_id);

alter table public.report_signature_requests enable row level security;
create policy report_signature_requests_select on public.report_signature_requests for select to authenticated
  using (signer_user_id = auth.uid() or public.can_view_project_internal(project_id));
-- Rows are written only by the server after authorization; status changes come only from a verified provider callback.
create trigger audit_report_signature_requests after insert or update on public.report_signature_requests
  for each row execute function public.write_audit_event();
