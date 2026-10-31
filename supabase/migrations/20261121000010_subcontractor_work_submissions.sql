-- Subcontractor work submission and builder verification. Additive only.
--
-- * Portal access is an explicit grant (subcontractor_portal_accounts) made by an organization administrator.
--   A subcontractor contact record, company record, or assignment never grants access on its own.
-- * Subcontractor users get NO organization membership, so every existing staff/homeowner policy keeps excluding them.
--   They reach data only through the security-definer functions below and the new tables' RLS.
-- * Access requires: an active portal account, an active company, the 'subcontractors' feature, and an active
--   schedule assignment (original work) or a punch list issue assigned to the company (corrective work).
-- * Submission is never acceptance. Only an administrator/project manager who can view the project internally,
--   and who is not a portal user of the submitting company, records the verification decision.
-- * Builder acceptance never changes schedule_activities, invoices, contracts or payments. Accepting a correction moves
--   the canonical issue to 'resolved' through the existing issue guard; the existing "Approve repair" step and
--   homeowner validation are unchanged, and subcontractor photos are never copied to homeowner-visible tables.
-- * Every submission cycle, photo, and decision is kept; rows cannot be deleted or rewritten after submission.

-- ───────────────────────── Portal accounts ─────────────────────────
create table public.subcontractor_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(btrim(full_name)) between 2 and 120),
  email text not null check (char_length(email) between 3 and 254),
  status text not null default 'active' check (status in ('active', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  constraint subcontractor_portal_accounts_revoked_state check ((status = 'revoked') = (revoked_at is not null))
);
create index subcontractor_portal_accounts_company_idx on public.subcontractor_portal_accounts (subcontractor_company_id, status);
create index subcontractor_portal_accounts_user_idx on public.subcontractor_portal_accounts (user_id) where status = 'active';

create trigger subcontractor_portal_accounts_updated_at before update on public.subcontractor_portal_accounts
  for each row execute function public.set_updated_at();

create or replace function public.subcontractor_portal_accounts_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Subcontractor portal accounts are kept as history; revoke access instead';
  end if;
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from public.subcontractor_companies c
      where c.id = new.subcontractor_company_id and c.organization_id = new.organization_id and c.status = 'active'
    ) then
      raise exception 'Subcontractor must be an active company in this organization';
    end if;
    if exists (
      select 1 from public.organization_memberships m
      where m.organization_id = new.organization_id and m.user_id = new.user_id and m.status = 'active'
    ) then
      raise exception 'This person already has a staff or homeowner account in this organization';
    end if;
    new.invited_by := coalesce(auth.uid(), new.invited_by);
    new.status := 'active';
    new.revoked_at := null;
    new.revoked_by := null;
    return new;
  end if;
  if new.organization_id <> old.organization_id or new.user_id <> old.user_id
     or new.subcontractor_company_id <> old.subcontractor_company_id or new.created_at <> old.created_at
     or new.invited_by is distinct from old.invited_by then
    raise exception 'Portal account identity cannot be changed';
  end if;
  if new.status = 'revoked' and old.status = 'active' then
    new.revoked_at := now();
    new.revoked_by := auth.uid();
  elsif new.status = 'active' and old.status = 'revoked' then
    new.revoked_at := null;
    new.revoked_by := null;
  end if;
  return new;
end;
$$;
create trigger subcontractor_portal_accounts_guard before insert or update or delete on public.subcontractor_portal_accounts
  for each row execute function public.subcontractor_portal_accounts_guard();

alter table public.subcontractor_portal_accounts enable row level security;
create policy subcontractor_portal_accounts_select on public.subcontractor_portal_accounts for select to authenticated
  using (user_id = auth.uid() or public.is_org_manager(organization_id));
create policy subcontractor_portal_accounts_insert on public.subcontractor_portal_accounts for insert to authenticated
  with check (public.is_org_admin(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));
create policy subcontractor_portal_accounts_update on public.subcontractor_portal_accounts for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- Companies the caller may act for right now. Revoked accounts, inactive companies, and a disabled feature all yield nothing.
create or replace function public.sub_company_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select a.subcontractor_company_id
  from public.subcontractor_portal_accounts a
  join public.subcontractor_companies c on c.id = a.subcontractor_company_id and c.status = 'active'
  where a.user_id = auth.uid() and a.status = 'active'
    and public.is_feature_enabled(a.organization_id, 'subcontractors');
$$;

-- ───────────────────────── Corrective work on canonical issues ─────────────────────────
alter table public.project_issues
  add column if not exists responsible_subcontractor_company_id uuid references public.subcontractor_companies(id) on delete restrict;
create index if not exists project_issues_sub_company_idx
  on public.project_issues (responsible_subcontractor_company_id) where responsible_subcontractor_company_id is not null;

create or replace function public.project_issues_sub_assignment_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  if new.responsible_subcontractor_company_id is not distinct from old.responsible_subcontractor_company_id then
    return new;
  end if;
  if not public.is_org_manager(new.organization_id) then
    raise exception 'Only an administrator or project manager can assign a subcontractor to an issue';
  end if;
  if new.responsible_subcontractor_company_id is not null then
    select c.company_name into v_name from public.subcontractor_companies c
      where c.id = new.responsible_subcontractor_company_id and c.organization_id = new.organization_id and c.status = 'active';
    if v_name is null then raise exception 'Subcontractor must be an active company in this organization'; end if;
  end if;
  insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value, details)
  values (new.organization_id, new.id, 'assigned', auth.uid(),
          (select c.company_name from public.subcontractor_companies c where c.id = old.responsible_subcontractor_company_id),
          v_name, 'Responsible subcontractor');
  return new;
end;
$$;
create trigger project_issues_sub_assignment_guard before update of responsible_subcontractor_company_id on public.project_issues
  for each row execute function public.project_issues_sub_assignment_guard();

create or replace function public.sub_can_access_assignment(p_assignment uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.schedule_activity_assignments a
    where a.id = p_assignment and a.status = 'active'
      and a.subcontractor_company_id in (select public.sub_company_ids())
  );
$$;

create or replace function public.sub_can_access_issue(p_issue uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.project_issues i
    where i.id = p_issue
      and i.responsible_subcontractor_company_id in (select public.sub_company_ids())
  );
$$;

-- ───────────────────────── Submissions (one row per cycle) ─────────────────────────
create table public.subcontractor_work_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  submission_kind text not null check (submission_kind in ('work', 'correction')),
  assignment_id uuid references public.schedule_activity_assignments(id) on delete restrict,
  issue_id uuid references public.project_issues(id) on delete restrict,
  cycle integer not null check (cycle >= 1),
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'accepted', 'correction_required', 'returned')),
  completion_notes text check (completion_notes is null or char_length(completion_notes) <= 5000),
  completed_on date,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  submitted_by uuid references auth.users(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_notes text check (review_notes is null or char_length(review_notes) <= 5000),
  updated_at timestamptz not null default now(),
  constraint sws_target check (
    (submission_kind = 'work' and assignment_id is not null and issue_id is null)
    or (submission_kind = 'correction' and issue_id is not null and assignment_id is null)),
  constraint sws_submitted_state check (status = 'draft' or (submitted_at is not null and submitted_by is not null)),
  constraint sws_reviewed_state check ((status in ('accepted', 'correction_required', 'returned')) = (reviewed_at is not null)),
  constraint sws_rejection_reason check (
    status not in ('correction_required', 'returned') or char_length(btrim(coalesce(review_notes, ''))) > 0),
  constraint sws_work_date check (submission_kind <> 'work' or status = 'draft' or completed_on is not null)
);
create unique index sws_assignment_cycle_key on public.subcontractor_work_submissions (assignment_id, cycle) where assignment_id is not null;
create unique index sws_issue_cycle_key on public.subcontractor_work_submissions (issue_id, cycle) where issue_id is not null;
-- At most one open (draft or awaiting verification) cycle per assignment / issue.
create unique index sws_assignment_open_key on public.subcontractor_work_submissions (assignment_id)
  where assignment_id is not null and status in ('draft', 'submitted');
create unique index sws_issue_open_key on public.subcontractor_work_submissions (issue_id)
  where issue_id is not null and status in ('draft', 'submitted');
create index sws_project_status_idx on public.subcontractor_work_submissions (project_id, status);
create index sws_company_idx on public.subcontractor_work_submissions (subcontractor_company_id, status);

create trigger subcontractor_work_submissions_updated_at before update on public.subcontractor_work_submissions
  for each row execute function public.set_updated_at();
create trigger subcontractor_work_submissions_no_delete before delete on public.subcontractor_work_submissions
  for each row execute function public.block_delete();
create trigger audit_subcontractor_work_submissions after insert or update on public.subcontractor_work_submissions
  for each row execute function public.write_audit_event();

-- Reviewed cycles are immutable; submitted cycles can only move to a decision.
create or replace function public.subcontractor_work_submissions_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status in ('accepted', 'correction_required', 'returned') then
    raise exception 'A verified submission cannot be changed';
  end if;
  if new.id <> old.id or new.organization_id <> old.organization_id or new.project_id <> old.project_id
     or new.subcontractor_company_id <> old.subcontractor_company_id or new.submission_kind <> old.submission_kind
     or new.assignment_id is distinct from old.assignment_id or new.issue_id is distinct from old.issue_id
     or new.cycle <> old.cycle or new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'Submission identity cannot be changed';
  end if;
  if old.status = 'submitted' and (new.completion_notes is distinct from old.completion_notes
       or new.completed_on is distinct from old.completed_on or new.submitted_at is distinct from old.submitted_at
       or new.submitted_by is distinct from old.submitted_by) then
    raise exception 'A submitted report cannot be edited';
  end if;
  return new;
end;
$$;
create trigger subcontractor_work_submissions_guard before update on public.subcontractor_work_submissions
  for each row execute function public.subcontractor_work_submissions_guard();

-- Builder-side visibility mirrors the subcontractor directory: managers who can view the project internally.
create or replace function public.can_review_sub_project(p_org uuid, p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_org_manager(p_org)
     and public.can_view_project_internal(p_project)
     and public.is_feature_enabled(p_org, 'subcontractors');
$$;

create or replace function public.can_view_sub_submission(p_submission uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subcontractor_work_submissions s
    where s.id = p_submission
      and (
        public.can_review_sub_project(s.organization_id, s.project_id)
        or (
          s.subcontractor_company_id in (select public.sub_company_ids())
          and case s.submission_kind
                when 'work' then public.sub_can_access_assignment(s.assignment_id)
                else public.sub_can_access_issue(s.issue_id)
              end
        )
      )
  );
$$;

alter table public.subcontractor_work_submissions enable row level security;
create policy subcontractor_work_submissions_select on public.subcontractor_work_submissions for select to authenticated
  using (public.can_view_sub_submission(id));
-- No insert/update/delete policies: every write goes through the functions below.

-- Links between a failed original-work inspection and canonical punch list issues (no duplicates).
create table public.subcontractor_submission_issue_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  submission_id uuid not null references public.subcontractor_work_submissions(id) on delete restrict,
  issue_id uuid not null references public.project_issues(id) on delete restrict,
  linked_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (submission_id, issue_id)
);
create trigger subcontractor_submission_issue_links_no_delete before delete on public.subcontractor_submission_issue_links
  for each row execute function public.block_delete();
alter table public.subcontractor_submission_issue_links enable row level security;
create policy subcontractor_submission_issue_links_select on public.subcontractor_submission_issue_links for select to authenticated
  using (public.can_view_sub_submission(submission_id));

-- ───────────────────────── Evidence ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subcontractor-work', 'subcontractor-work', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do nothing;

create table public.subcontractor_submission_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  submission_id uuid not null references public.subcontractor_work_submissions(id) on delete restrict,
  evidence_role text not null check (evidence_role in ('completion', 'inspection')),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type ~ '^(image|video)/'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  media_kind text not null check (media_kind in ('photo', 'video')),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index subcontractor_submission_attachments_submission_idx on public.subcontractor_submission_attachments (submission_id);

-- Completion photos may only be removed while the cycle is still a draft; everything else is permanent.
create or replace function public.subcontractor_submission_attachments_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Evidence records cannot be changed';
  end if;
  if not exists (
    select 1 from public.subcontractor_work_submissions s where s.id = old.submission_id and s.status = 'draft'
  ) then
    raise exception 'Submitted evidence cannot be removed';
  end if;
  return old;
end;
$$;
create trigger subcontractor_submission_attachments_guard before update or delete on public.subcontractor_submission_attachments
  for each row execute function public.subcontractor_submission_attachments_guard();

alter table public.subcontractor_submission_attachments enable row level security;
create policy subcontractor_submission_attachments_select on public.subcontractor_submission_attachments for select to authenticated
  using (public.can_view_sub_submission(submission_id));

-- Paths are <organization_id>/<submission_id>/<uuid>-<file>.
create or replace function public.sub_submission_from_path(p_name text)
returns uuid language sql immutable set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
              then split_part(p_name, '/', 2)::uuid end;
$$;

-- Who may add evidence to a cycle: the submitting company while drafting, a reviewer while it awaits verification.
create or replace function public.can_add_sub_evidence(p_submission uuid, p_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.subcontractor_work_submissions s
    where s.id = p_submission
      and (
        (p_role = 'completion' and s.status = 'draft'
          and s.subcontractor_company_id in (select public.sub_company_ids())
          and case s.submission_kind when 'work' then public.sub_can_access_assignment(s.assignment_id)
                                     else public.sub_can_access_issue(s.issue_id) end)
        or (p_role = 'inspection' and s.status = 'submitted'
          and public.can_review_sub_project(s.organization_id, s.project_id))
      )
  );
$$;

create policy subcontractor_work_select on storage.objects for select to authenticated
  using (bucket_id = 'subcontractor-work' and public.can_view_sub_submission(public.sub_submission_from_path(name)));
create policy subcontractor_work_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'subcontractor-work'
    and split_part(name, '/', 1) = (select s.organization_id::text from public.subcontractor_work_submissions s
                                    where s.id = public.sub_submission_from_path(name))
    and (public.can_add_sub_evidence(public.sub_submission_from_path(name), 'completion')
         or public.can_add_sub_evidence(public.sub_submission_from_path(name), 'inspection')));
-- Only files that were never registered (failed uploads) or were removed from a draft can be deleted.
create policy subcontractor_work_delete_unregistered on storage.objects for delete to authenticated
  using (
    bucket_id = 'subcontractor-work'
    and not exists (select 1 from public.subcontractor_submission_attachments a where a.storage_path = name)
    and (public.can_add_sub_evidence(public.sub_submission_from_path(name), 'completion')
         or public.can_add_sub_evidence(public.sub_submission_from_path(name), 'inspection')));

-- ───────────────────────── Notifications ─────────────────────────
create or replace function public.notify_sub_company(
  p_org uuid, p_company uuid, p_project uuid, p_title text, p_body text, p_link text, p_dedupe text,
  p_action_required boolean default true)
returns void language sql security definer set search_path = '' as $$
  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, dedupe_key, action_required)
  select p_org, a.user_id, p_title, p_body, p_link, 'subcontractor_work', p_project, p_dedupe, p_action_required
  from public.subcontractor_portal_accounts a
  where a.subcontractor_company_id = p_company and a.status = 'active' and a.organization_id = p_org
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
$$;

create or replace function public.notify_sub_reviewers(
  p_org uuid, p_project uuid, p_extra uuid, p_title text, p_body text, p_link text, p_dedupe text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_pm uuid;
begin
  select p.project_manager_id into v_pm from public.projects p where p.id = p_project;
  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, dedupe_key, action_required)
  select p_org, m.user_id, p_title, p_body, p_link, 'subcontractor_work', p_project, p_dedupe, true
  from public.organization_memberships m
  where m.organization_id = p_org and m.status = 'active' and not m.activation_required
    and m.role in ('org_admin', 'project_manager')
    and (
      m.user_id in (v_pm, p_extra)
      -- Fall back to administrators when the project has no eligible manager.
      or (m.role = 'org_admin' and not exists (
        select 1 from public.organization_memberships x
        where x.organization_id = p_org and x.status = 'active' and x.user_id in (v_pm, p_extra)
          and x.role in ('org_admin', 'project_manager')))
    )
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;

create or replace function public.resolve_notifications(p_dedupe text)
returns void language sql security definer set search_path = '' as $$
  update public.notifications set acknowledged_at = now()
  where dedupe_key = p_dedupe and acknowledged_at is null;
$$;

create or replace function public.notify_sub_new_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_activity text;
begin
  select a.name into v_activity from public.schedule_activities a where a.id = new.schedule_activity_id;
  perform public.notify_sub_company(new.organization_id, new.subcontractor_company_id, new.project_id,
    'New work assigned', v_activity, '/sub/work/' || new.id, 'sub-assign:' || new.id);
  return new;
end;
$$;
create trigger schedule_activity_assignments_notify_sub after insert on public.schedule_activity_assignments
  for each row execute function public.notify_sub_new_assignment();

create or replace function public.notify_sub_issue_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.responsible_subcontractor_company_id is not null
     and new.responsible_subcontractor_company_id is distinct from old.responsible_subcontractor_company_id then
    perform public.notify_sub_company(new.organization_id, new.responsible_subcontractor_company_id, new.project_id,
      'New correction request', new.item_label, '/sub/corrections/' || new.id,
      'sub-issue:' || new.id || ':' || new.responsible_subcontractor_company_id);
  end if;
  return new;
end;
$$;
create trigger project_issues_notify_sub after update of responsible_subcontractor_company_id on public.project_issues
  for each row execute function public.notify_sub_issue_assignment();

-- ───────────────────────── Subcontractor read models ─────────────────────────
create or replace function public.sub_assigned_work()
returns table (
  assignment_id uuid, project_id uuid, project_name text, project_city text, company_name text,
  activity_id uuid, activity_name text, activity_phase text, activity_status text,
  planned_start date, planned_end date, scope_of_work text, assigned_at timestamptz,
  latest_submission_id uuid, latest_status text, latest_cycle integer, latest_reviewed_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select a.id, p.id, p.name, p.city, c.company_name,
         sa.id, sa.name, sa.phase, sa.status, sa.planned_start, sa.planned_end, a.scope_of_work, a.created_at,
         l.id, l.status, l.cycle, l.reviewed_at
  from public.schedule_activity_assignments a
  join public.projects p on p.id = a.project_id
  join public.schedule_activities sa on sa.id = a.schedule_activity_id
  join public.subcontractor_companies c on c.id = a.subcontractor_company_id
  left join lateral (
    select s.id, s.status, s.cycle, s.reviewed_at from public.subcontractor_work_submissions s
    where s.assignment_id = a.id order by s.cycle desc limit 1
  ) l on true
  where a.status = 'active' and a.subcontractor_company_id in (select public.sub_company_ids())
  order by sa.planned_start nulls last, sa.sort_order;
$$;

create or replace function public.sub_correction_requests()
returns table (
  issue_id uuid, project_id uuid, project_name text, project_city text, company_name text,
  category text, item_label text, description text, corrective_action text,
  issue_status text, priority text, due_date date, reported_at timestamptz,
  latest_submission_id uuid, latest_status text, latest_cycle integer, latest_reviewed_at timestamptz
) language sql stable security definer set search_path = '' as $$
  select i.id, p.id, p.name, p.city, c.company_name,
         i.category, i.item_label, i.homeowner_description, i.corrective_action,
         i.status::text, i.priority, i.due_date, i.reported_at,
         l.id, l.status, l.cycle, l.reviewed_at
  from public.project_issues i
  join public.projects p on p.id = i.project_id
  join public.subcontractor_companies c on c.id = i.responsible_subcontractor_company_id
  left join lateral (
    select s.id, s.status, s.cycle, s.reviewed_at from public.subcontractor_work_submissions s
    where s.issue_id = i.id order by s.cycle desc limit 1
  ) l on true
  where i.responsible_subcontractor_company_id in (select public.sub_company_ids())
  order by i.due_date nulls last, i.reported_at;
$$;

-- Original issue evidence the subcontractor may see (never homeowner identity or repair approvals).
create or replace function public.sub_issue_evidence(p_issue uuid)
returns table (id uuid, storage_path text, file_name text, media_kind text, attachment_kind text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.storage_path, a.file_name, a.media_kind, a.attachment_kind
  from public.issue_attachments a
  where a.issue_id = p_issue and a.attachment_kind in ('original', 'supplemental')
    and public.sub_can_access_issue(p_issue)
  order by a.created_at;
$$;

-- ───────────────────────── Subcontractor workflow ─────────────────────────
create or replace function public.sub_start_submission(p_kind text, p_target uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid; v_project uuid; v_company uuid; v_existing uuid; v_cycle integer; v_id uuid; v_issue_status text;
begin
  if auth.uid() is null then raise exception 'Sign in to continue'; end if;
  if p_kind = 'work' then
    if not public.sub_can_access_assignment(p_target) then raise exception 'This work is not assigned to your company'; end if;
    select a.organization_id, a.project_id, a.subcontractor_company_id into v_org, v_project, v_company
      from public.schedule_activity_assignments a where a.id = p_target;
    if exists (select 1 from public.subcontractor_work_submissions s where s.assignment_id = p_target and s.status = 'accepted') then
      raise exception 'The builder has already accepted this work';
    end if;
    select s.id into v_existing from public.subcontractor_work_submissions s
      where s.assignment_id = p_target and s.status in ('draft', 'submitted');
    select coalesce(max(s.cycle), 0) + 1 into v_cycle from public.subcontractor_work_submissions s where s.assignment_id = p_target;
  elsif p_kind = 'correction' then
    if not public.sub_can_access_issue(p_target) then raise exception 'This correction is not assigned to your company'; end if;
    select i.organization_id, i.project_id, i.responsible_subcontractor_company_id, i.status::text
      into v_org, v_project, v_company, v_issue_status from public.project_issues i where i.id = p_target;
    if v_issue_status in ('resolved', 'closed') then raise exception 'This issue is already resolved'; end if;
    select s.id into v_existing from public.subcontractor_work_submissions s
      where s.issue_id = p_target and s.status in ('draft', 'submitted');
    select coalesce(max(s.cycle), 0) + 1 into v_cycle from public.subcontractor_work_submissions s where s.issue_id = p_target;
  else
    raise exception 'Unknown submission type';
  end if;

  if v_existing is not null then return v_existing; end if;

  insert into public.subcontractor_work_submissions
    (organization_id, project_id, subcontractor_company_id, submission_kind, assignment_id, issue_id, cycle, created_by)
  values (v_org, v_project, v_company, p_kind,
          case when p_kind = 'work' then p_target end, case when p_kind = 'correction' then p_target end,
          v_cycle, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.add_sub_submission_attachment(
  p_submission uuid, p_role text, p_path text, p_file_name text, p_mime text, p_size bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid; v_id uuid; v_kind text;
begin
  if p_role not in ('completion', 'inspection') then raise exception 'Unknown evidence type'; end if;
  if not public.can_add_sub_evidence(p_submission, p_role) then raise exception 'You cannot add photos to this submission'; end if;
  select s.organization_id into v_org from public.subcontractor_work_submissions s where s.id = p_submission;
  if public.sub_submission_from_path(p_path) is distinct from p_submission or split_part(p_path, '/', 1) <> v_org::text then
    raise exception 'Invalid upload path';
  end if;
  v_kind := case when p_mime ~ '^image/' then 'photo' when p_mime ~ '^video/' then 'video' end;
  if v_kind is null then raise exception 'Only photos and videos can be attached'; end if;
  if p_size is null or p_size <= 0 or p_size > 52428800 then raise exception 'Files must be 50 MB or smaller'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'subcontractor-work' and o.name = p_path) then
    raise exception 'The uploaded file was not found';
  end if;
  insert into public.subcontractor_submission_attachments
    (organization_id, submission_id, evidence_role, storage_path, file_name, mime_type, size_bytes, media_kind, uploaded_by)
  values (v_org, p_submission, p_role, p_path, left(coalesce(nullif(btrim(p_file_name), ''), 'upload'), 200), p_mime, p_size, v_kind, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.remove_sub_submission_attachment(p_attachment uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_att public.subcontractor_submission_attachments;
begin
  select * into v_att from public.subcontractor_submission_attachments a where a.id = p_attachment;
  if v_att.id is null then raise exception 'Photo not found'; end if;
  if v_att.evidence_role <> 'completion' or not public.can_add_sub_evidence(v_att.submission_id, 'completion') then
    raise exception 'This photo can no longer be removed';
  end if;
  delete from public.subcontractor_submission_attachments where id = p_attachment;
  return v_att.storage_path;
end;
$$;

create or replace function public.sub_submit_work(p_submission uuid, p_notes text, p_completed_on date)
returns void language plpgsql security definer set search_path = '' as $$
declare v_s public.subcontractor_work_submissions; v_label text; v_extra uuid; v_company text;
begin
  select * into v_s from public.subcontractor_work_submissions s where s.id = p_submission for update;
  if v_s.id is null or not public.can_add_sub_evidence(p_submission, 'completion') then
    raise exception 'This submission cannot be sent';
  end if;
  if not exists (select 1 from public.subcontractor_submission_attachments a
                 where a.submission_id = p_submission and a.evidence_role = 'completion') then
    raise exception 'Add at least one photo before submitting';
  end if;
  if v_s.submission_kind = 'work' and p_completed_on is null then raise exception 'Enter the date the work was completed'; end if;
  if p_completed_on is not null and p_completed_on > (now() at time zone 'America/Chicago')::date + 1 then
    raise exception 'The completion date cannot be in the future';
  end if;
  if char_length(coalesce(p_notes, '')) > 5000 then raise exception 'Notes are too long'; end if;

  update public.subcontractor_work_submissions
    set status = 'submitted', completion_notes = nullif(btrim(p_notes), ''), completed_on = p_completed_on,
        submitted_by = auth.uid(), submitted_at = now()
    where id = p_submission;

  select c.company_name into v_company from public.subcontractor_companies c where c.id = v_s.subcontractor_company_id;
  if v_s.submission_kind = 'work' then
    select sa.name into v_label from public.schedule_activity_assignments a
      join public.schedule_activities sa on sa.id = a.schedule_activity_id where a.id = v_s.assignment_id;
  else
    select i.item_label, i.responsible_user_id into v_label, v_extra from public.project_issues i where i.id = v_s.issue_id;
  end if;

  perform public.notify_sub_reviewers(v_s.organization_id, v_s.project_id, v_extra,
    case when v_s.submission_kind = 'work' then 'Work submitted for inspection' else 'Correction submitted for verification' end,
    coalesce(v_company, 'Subcontractor') || ' · ' || coalesce(v_label, ''),
    '/projects/' || v_s.project_id || '/subcontractor-work/' || v_s.id,
    'sub-submission:' || v_s.id);

  -- The earlier rejection alert for this work is now handled by the resubmission.
  perform public.resolve_notifications('sub-review:' || s.id)
    from public.subcontractor_work_submissions s
    where s.id <> v_s.id and s.status in ('correction_required', 'returned')
      and (s.assignment_id = v_s.assignment_id or s.issue_id = v_s.issue_id);
  perform public.resolve_notifications('sub-assign:' || v_s.assignment_id) where v_s.assignment_id is not null;
  perform public.resolve_notifications('sub-issue:' || v_s.issue_id || ':' || v_s.subcontractor_company_id) where v_s.issue_id is not null;
end;
$$;

-- ───────────────────────── Builder verification ─────────────────────────
create or replace function public.review_sub_submission(
  p_submission uuid, p_decision text, p_notes text, p_issue_ids uuid[] default '{}')
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_s public.subcontractor_work_submissions; v_issue uuid; v_label text; v_title text; v_link text; v_status text;
begin
  select * into v_s from public.subcontractor_work_submissions s where s.id = p_submission for update;
  if v_s.id is null or not public.can_review_sub_project(v_s.organization_id, v_s.project_id) then
    raise exception 'Only an administrator or project manager on this project can verify work';
  end if;
  if v_s.status <> 'submitted' then raise exception 'This submission is not awaiting verification'; end if;
  if v_s.submitted_by = auth.uid() or v_s.created_by = auth.uid()
     or exists (select 1 from public.subcontractor_portal_accounts a
                where a.user_id = auth.uid() and a.subcontractor_company_id = v_s.subcontractor_company_id) then
    raise exception 'Subcontractors cannot verify their own work';
  end if;
  if p_decision not in ('accepted', 'correction_required', 'returned') then raise exception 'Choose a decision'; end if;
  if p_decision <> 'accepted' and char_length(btrim(coalesce(p_notes, ''))) = 0 then
    raise exception 'Describe what needs to be corrected';
  end if;
  if char_length(coalesce(p_notes, '')) > 5000 then raise exception 'Notes are too long'; end if;
  if coalesce(array_length(p_issue_ids, 1), 0) > 0 and not (v_s.submission_kind = 'work' and p_decision = 'correction_required') then
    raise exception 'Punch list items can only be linked when original work needs correction';
  end if;

  update public.subcontractor_work_submissions
    set status = p_decision, review_notes = nullif(btrim(p_notes), ''), reviewed_by = auth.uid(), reviewed_at = now()
    where id = p_submission;

  -- Link (never duplicate) canonical punch list items and route them to the same subcontractor.
  foreach v_issue in array coalesce(p_issue_ids, '{}') loop
    select i.status::text into v_status from public.project_issues i
      where i.id = v_issue and i.project_id = v_s.project_id;
    if v_status is null then raise exception 'Punch list item must belong to this project'; end if;
    if v_status = 'closed' then raise exception 'Closed punch list items cannot be linked'; end if;
    insert into public.subcontractor_submission_issue_links (organization_id, submission_id, issue_id, linked_by)
      values (v_s.organization_id, p_submission, v_issue, auth.uid())
      on conflict (submission_id, issue_id) do nothing;
    update public.project_issues set responsible_subcontractor_company_id = v_s.subcontractor_company_id
      where id = v_issue and responsible_subcontractor_company_id is distinct from v_s.subcontractor_company_id;
  end loop;

  -- Corrective work moves through the canonical issue states; history is written by the existing issue triggers.
  if v_s.submission_kind = 'correction' then
    select i.status::text into v_status from public.project_issues i where i.id = v_s.issue_id;
    if p_decision = 'accepted' and v_status in ('open', 'in_progress') then
      update public.project_issues set status = 'resolved' where id = v_s.issue_id;
    elsif p_decision <> 'accepted' and v_status = 'open' then
      update public.project_issues set status = 'in_progress' where id = v_s.issue_id;
    end if;
  end if;

  perform public.resolve_notifications('sub-submission:' || v_s.id);

  if v_s.submission_kind = 'work' then
    select sa.name into v_label from public.schedule_activity_assignments a
      join public.schedule_activities sa on sa.id = a.schedule_activity_id where a.id = v_s.assignment_id;
    v_link := '/sub/work/' || v_s.assignment_id;
  else
    select i.item_label into v_label from public.project_issues i where i.id = v_s.issue_id;
    v_link := '/sub/corrections/' || v_s.issue_id;
  end if;
  v_title := case p_decision when 'accepted' then 'Work accepted'
                             when 'correction_required' then 'Correction required'
                             else 'Submission returned' end;
  perform public.notify_sub_company(v_s.organization_id, v_s.subcontractor_company_id, v_s.project_id,
    v_title, v_label, v_link, 'sub-review:' || v_s.id,
    -- Acceptance is informational; a rejection needs the subcontractor to act.
    p_decision <> 'accepted');
end;
$$;
