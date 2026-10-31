-- Internal subcontractor performance ratings.
--
-- One evaluation per company-on-project assignment period (subcontractor_project_assignments row). Revising an
-- evaluation updates it in place and snapshots every version into the revisions table, so history is never lost.
-- The overall score is a generated column: clients can never submit or override it.
-- Ratings are independent of qualification/vetting and never change compliance status.

create table public.subcontractor_performance_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  project_assignment_id uuid not null references public.subcontractor_project_assignments(id) on delete restrict,
  submission_id uuid references public.subcontractor_work_submissions(id) on delete restrict,
  quality smallint not null check (quality between 1 and 5),
  timeliness smallint not null check (timeliness between 1 and 5),
  communication smallint not null check (communication between 1 and 5),
  professionalism smallint not null check (professionalism between 1 and 5),
  -- Null means "not applicable" (no corrections were needed on this assignment).
  issue_resolution smallint check (issue_resolution is null or issue_resolution between 1 and 5),
  overall_rating numeric(3, 2) generated always as (
    round(
      (quality + timeliness + communication + professionalism + coalesce(issue_resolution, 0))::numeric
        / (case when issue_resolution is null then 4 else 5 end),
      2
    )
  ) stored,
  comments text check (comments is null or char_length(comments) <= 2000),
  revision integer not null default 1 check (revision >= 1),
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontractor_performance_reviews_cycle_key unique (project_assignment_id)
);
create index subcontractor_performance_reviews_company_idx
  on public.subcontractor_performance_reviews (organization_id, subcontractor_company_id);
create index subcontractor_performance_reviews_project_idx
  on public.subcontractor_performance_reviews (project_id);

create table public.subcontractor_performance_review_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  review_id uuid not null references public.subcontractor_performance_reviews(id) on delete restrict,
  revision integer not null,
  submission_id uuid,
  quality smallint not null,
  timeliness smallint not null,
  communication smallint not null,
  professionalism smallint not null,
  issue_resolution smallint,
  overall_rating numeric(3, 2) not null,
  comments text,
  reviewed_by uuid not null references auth.users(id) on delete restrict,
  recorded_at timestamptz not null default now(),
  constraint subcontractor_performance_review_revisions_key unique (review_id, revision)
);
create index subcontractor_performance_review_revisions_review_idx
  on public.subcontractor_performance_review_revisions (review_id, revision desc);

create trigger subcontractor_performance_reviews_updated_at
  before update on public.subcontractor_performance_reviews
  for each row execute function public.set_updated_at();

create or replace function public.subcontractor_performance_reviews_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subcontractor_performance_review_revisions (
    organization_id, review_id, revision, submission_id, quality, timeliness, communication, professionalism,
    issue_resolution, overall_rating, comments, reviewed_by)
  values (
    new.organization_id, new.id, new.revision, new.submission_id, new.quality, new.timeliness, new.communication,
    new.professionalism, new.issue_resolution, new.overall_rating, new.comments, new.reviewed_by)
  on conflict (review_id, revision) do nothing;
  return new;
end;
$$;

create trigger subcontractor_performance_reviews_snapshot
  after insert or update on public.subcontractor_performance_reviews
  for each row execute function public.subcontractor_performance_reviews_snapshot();

create or replace function public.subcontractor_performance_block_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Performance ratings are kept as history; revise the rating instead';
end;
$$;

create trigger subcontractor_performance_reviews_no_delete
  before delete on public.subcontractor_performance_reviews
  for each row execute function public.subcontractor_performance_block_delete();
create trigger subcontractor_performance_review_revisions_no_delete
  before delete on public.subcontractor_performance_review_revisions
  for each row execute function public.subcontractor_performance_block_delete();

create trigger subcontractor_performance_reviews_audit
  after insert or update on public.subcontractor_performance_reviews
  for each row execute function public.write_audit_event();

-- Read access: builder administrators and project managers only. Subcontractors and homeowners have no access.
-- There are no insert/update policies: all writes go through save_sub_performance_review below.
alter table public.subcontractor_performance_reviews enable row level security;
alter table public.subcontractor_performance_review_revisions enable row level security;

create policy subcontractor_performance_reviews_select on public.subcontractor_performance_reviews
  for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));

create policy subcontractor_performance_review_revisions_select on public.subcontractor_performance_review_revisions
  for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));

/**
 * Creates or revises the evaluation for one assignment period. Safe to retry:
 *  - resubmitting identical values is a no-op that returns the existing id;
 *  - p_expected_revision guards against overwriting a newer revision (null = expect no rating yet).
 */
create or replace function public.save_sub_performance_review(
  p_company uuid,
  p_project_assignment uuid,
  p_submission uuid,
  p_quality smallint,
  p_timeliness smallint,
  p_communication smallint,
  p_professionalism smallint,
  p_issue_resolution smallint,
  p_comments text,
  p_expected_revision integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_a public.subcontractor_project_assignments;
  v_r public.subcontractor_performance_reviews;
  v_comments text := nullif(btrim(coalesce(p_comments, '')), '');
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to rate subcontractors'; end if;

  select * into v_a from public.subcontractor_project_assignments a
    where a.id = p_project_assignment and a.subcontractor_company_id = p_company;
  if v_a.id is null then raise exception 'This subcontractor was not assigned to that project'; end if;

  if not public.can_review_sub_project(v_a.organization_id, v_a.project_id) then
    raise exception 'Only an administrator or project manager on this project can rate subcontractors';
  end if;
  if exists (select 1 from public.subcontractor_portal_accounts pa
             where pa.user_id = auth.uid() and pa.subcontractor_company_id = p_company) then
    raise exception 'Subcontractors cannot rate their own company';
  end if;

  if p_quality is null or p_timeliness is null or p_communication is null or p_professionalism is null
     or p_quality not between 1 and 5 or p_timeliness not between 1 and 5
     or p_communication not between 1 and 5 or p_professionalism not between 1 and 5
     or (p_issue_resolution is not null and p_issue_resolution not between 1 and 5) then
    raise exception 'Rate each category from 1 to 5 stars';
  end if;
  if char_length(coalesce(v_comments, '')) > 2000 then raise exception 'Comments are too long'; end if;

  if p_submission is not null and not exists (
    select 1 from public.subcontractor_work_submissions s
    where s.id = p_submission and s.status = 'accepted'
      and s.subcontractor_company_id = p_company and s.project_id = v_a.project_id) then
    raise exception 'Linked work must be verified work from this subcontractor on this project';
  end if;

  select * into v_r from public.subcontractor_performance_reviews r
    where r.project_assignment_id = p_project_assignment for update;

  if v_r.id is null then
    insert into public.subcontractor_performance_reviews (
      organization_id, subcontractor_company_id, project_id, project_assignment_id, submission_id,
      quality, timeliness, communication, professionalism, issue_resolution, comments, reviewed_by, created_by)
    values (
      v_a.organization_id, p_company, v_a.project_id, p_project_assignment, p_submission,
      p_quality, p_timeliness, p_communication, p_professionalism, p_issue_resolution, v_comments, auth.uid(), auth.uid())
    on conflict (project_assignment_id) do nothing
    returning id into v_id;
    if v_id is not null then return v_id; end if;
    -- Lost a race with a concurrent insert; fall through and treat it like an existing rating.
    select * into v_r from public.subcontractor_performance_reviews r
      where r.project_assignment_id = p_project_assignment for update;
  end if;

  if v_r.submission_id is not distinct from p_submission and v_r.quality = p_quality and v_r.timeliness = p_timeliness
     and v_r.communication = p_communication and v_r.professionalism = p_professionalism
     and v_r.issue_resolution is not distinct from p_issue_resolution and v_r.comments is not distinct from v_comments then
    return v_r.id;
  end if;

  if p_expected_revision is distinct from v_r.revision then
    raise exception 'This rating was updated by someone else. Refresh to see the latest version before revising it';
  end if;

  update public.subcontractor_performance_reviews set
    submission_id = p_submission, quality = p_quality, timeliness = p_timeliness, communication = p_communication,
    professionalism = p_professionalism, issue_resolution = p_issue_resolution, comments = v_comments,
    reviewed_by = auth.uid(), revision = v_r.revision + 1
  where id = v_r.id;
  return v_r.id;
end;
$$;

revoke all on function public.save_sub_performance_review(uuid, uuid, uuid, smallint, smallint, smallint, smallint, smallint, text, integer) from public, anon;
grant execute on function public.save_sub_performance_review(uuid, uuid, uuid, smallint, smallint, smallint, smallint, smallint, text, integer) to authenticated;
