-- Internal subcontractor performance ratings (1-5 stars).
--
-- Supersedes the design in 20261122000010_subcontractor_performance_reviews.sql, which computed Overall from the
-- categories, required most categories, and allowed one review per assignment. This schema is self-contained
-- (it does not depend on subcontractor work submissions) and does not touch the older tables: environments that
-- already applied 20261122 keep those rows untouched as history; the app reads only the tables below.
--
-- Rules enforced here:
--  - One current review per reviewer, subcontractor, and project. Edits update it in place; every version is
--    snapshotted into subcontractor_rating_revisions and audited through write_audit_event.
--  - Overall is entered by the reviewer (1-5). Categories are optional; null means "Not assessed".
--  - The reviewer must explicitly confirm they assessed the company's work; a project association alone never
--    creates a review.
--  - Reviews are kept when the project association ends or is removed. Ratings never change qualification,
--    compliance, insurance, payment, status, or project records.
--  - Readable only by builder administrators and project managers in the same organization. Homeowners and
--    subcontractor portal users have no access. All writes go through save_subcontractor_rating.

create table if not exists public.subcontractor_ratings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  subcontractor_company_id uuid not null references public.subcontractor_companies(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  -- The association period this review was written against. Kept nullable so removing an association never
  -- erases performance history.
  project_assignment_id uuid references public.subcontractor_project_assignments(id) on delete set null,
  reviewer_id uuid not null references auth.users(id) on delete restrict,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  quality smallint check (quality is null or quality between 1 and 5),
  schedule_reliability smallint check (schedule_reliability is null or schedule_reliability between 1 and 5),
  communication smallint check (communication is null or communication between 1 and 5),
  cleanliness smallint check (cleanliness is null or cleanliness between 1 and 5),
  safety smallint check (safety is null or safety between 1 and 5),
  comments text check (comments is null or char_length(comments) <= 2000),
  work_confirmed_at timestamptz not null,
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subcontractor_ratings_reviewer_key unique (organization_id, subcontractor_company_id, project_id, reviewer_id)
);
create index if not exists subcontractor_ratings_company_idx
  on public.subcontractor_ratings (organization_id, subcontractor_company_id);
create index if not exists subcontractor_ratings_project_idx on public.subcontractor_ratings (project_id);

create table if not exists public.subcontractor_rating_revisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  rating_id uuid not null references public.subcontractor_ratings(id) on delete restrict,
  revision integer not null,
  overall_rating smallint not null,
  quality smallint,
  schedule_reliability smallint,
  communication smallint,
  cleanliness smallint,
  safety smallint,
  comments text,
  reviewer_id uuid not null,
  recorded_by uuid,
  recorded_at timestamptz not null default now(),
  constraint subcontractor_rating_revisions_key unique (rating_id, revision)
);

drop trigger if exists subcontractor_ratings_updated_at on public.subcontractor_ratings;
create trigger subcontractor_ratings_updated_at
  before update on public.subcontractor_ratings
  for each row execute function public.set_updated_at();

create or replace function public.subcontractor_ratings_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.subcontractor_rating_revisions (
    organization_id, rating_id, revision, overall_rating, quality, schedule_reliability, communication,
    cleanliness, safety, comments, reviewer_id, recorded_by)
  values (
    new.organization_id, new.id, new.revision, new.overall_rating, new.quality, new.schedule_reliability,
    new.communication, new.cleanliness, new.safety, new.comments, new.reviewer_id, auth.uid())
  on conflict (rating_id, revision) do nothing;
  return new;
end;
$$;

drop trigger if exists subcontractor_ratings_snapshot on public.subcontractor_ratings;
create trigger subcontractor_ratings_snapshot
  after insert or update on public.subcontractor_ratings
  for each row execute function public.subcontractor_ratings_snapshot();

create or replace function public.subcontractor_ratings_block_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Performance reviews are kept as history; edit the review instead';
end;
$$;

drop trigger if exists subcontractor_ratings_no_delete on public.subcontractor_ratings;
create trigger subcontractor_ratings_no_delete
  before delete on public.subcontractor_ratings
  for each row execute function public.subcontractor_ratings_block_delete();
drop trigger if exists subcontractor_rating_revisions_no_delete on public.subcontractor_rating_revisions;
create trigger subcontractor_rating_revisions_no_delete
  before delete on public.subcontractor_rating_revisions
  for each row execute function public.subcontractor_ratings_block_delete();

drop trigger if exists subcontractor_ratings_audit on public.subcontractor_ratings;
create trigger subcontractor_ratings_audit
  after insert or update on public.subcontractor_ratings
  for each row execute function public.write_audit_event();

alter table public.subcontractor_ratings enable row level security;
alter table public.subcontractor_rating_revisions enable row level security;

drop policy if exists subcontractor_ratings_select on public.subcontractor_ratings;
create policy subcontractor_ratings_select on public.subcontractor_ratings
  for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));

drop policy if exists subcontractor_rating_revisions_select on public.subcontractor_rating_revisions;
create policy subcontractor_rating_revisions_select on public.subcontractor_rating_revisions
  for select to authenticated
  using (public.is_org_manager(organization_id) and public.is_feature_enabled(organization_id, 'subcontractors'));

revoke all on public.subcontractor_ratings, public.subcontractor_rating_revisions from anon;
revoke insert, update, delete on public.subcontractor_ratings, public.subcontractor_rating_revisions from authenticated;

/**
 * Creates or edits the caller's review of a subcontractor on one project. Safe to retry:
 *  - resubmitting identical values is a no-op that returns the existing id;
 *  - p_expected_revision guards against overwriting a newer version (null = expect no review yet).
 * Reviewer identity and timestamps come from the session and the server clock, never from the client.
 */
create or replace function public.save_subcontractor_rating(
  p_company uuid,
  p_project uuid,
  p_overall smallint,
  p_quality smallint,
  p_schedule_reliability smallint,
  p_communication smallint,
  p_cleanliness smallint,
  p_safety smallint,
  p_comments text,
  p_work_confirmed boolean,
  p_expected_revision integer
)
returns uuid language plpgsql security definer set search_path = '' as $$
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
    -- Lost a race with a concurrent submission (for example a double click); treat it as the existing review.
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
$$;

revoke all on function public.save_subcontractor_rating(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, boolean, integer) from public, anon;
grant execute on function public.save_subcontractor_rating(uuid, uuid, smallint, smallint, smallint, smallint, smallint, smallint, text, boolean, integer) to authenticated;
