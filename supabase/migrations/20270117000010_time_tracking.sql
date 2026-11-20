-- Time tracking (Pro and Business).
-- Crew members clock in and out against a project and cost code (or enter time by hand). Managers approve the hours;
-- approval snapshots the worker's labor cost rate, and approved labor cost counts as actual cost in job costing.
-- All writes go through the functions below so the clock-in / approve rules can't be bypassed.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql
immutable
set search_path to ''
as $function$
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
    ('ai_essentials',  false, array[]::text[]),
    ('daily_logs',     false, array[]::text[]),
    ('subcontractors', false, array[]::text[]),
    ('client_updates', false, array['portal']),
    ('change_orders',  false, array[]::text[]),
    ('rfis',           false, array[]::text[]),
    ('project_photos', false, array[]::text[]),
    ('time_tracking',  false, array[]::text[])
$function$;

update public.subscription_plans
set features = array_append(features, 'time_tracking'), updated_at = now()
where key in ('pro', 'business') and not ('time_tracking' = any (features));

create or replace function public.after_organization_insert_default_modules()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare k text;
begin
  foreach k in array array['daily_logs', 'change_orders', 'invoices', 'ai_essentials', 'ai_assistant', 'time_tracking'] loop
    if public.plan_includes_feature(new.id, k) then
      begin
        insert into public.organization_features (organization_id, feature_key, enabled)
        values (new.id, k, true)
        on conflict (organization_id, feature_key) do nothing;
      exception when others then
        raise warning 'default module % skipped for organization %: %', k, new.id, sqlerrm;
      end;
    end if;
  end loop;
  return new;
end;
$$;

-- ============ Labor cost rates (what an hour of this person costs the company) ============
create table public.labor_rates (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  hourly_cost_cents bigint not null check (hourly_cost_cents between 0 and 100000),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

alter table public.labor_rates enable row level security;

create policy labor_rates_admin_all on public.labor_rates
  for all to authenticated
  using (public.is_org_admin(organization_id))
  with check (public.is_org_admin(organization_id));

-- Managers approve time, so they read rates to see labor cost; only admins change them.
create policy labor_rates_manager_read on public.labor_rates
  for select to authenticated
  using (public.is_org_manager(organization_id));

revoke all on public.labor_rates from anon;
grant select, insert, update, delete on public.labor_rates to authenticated;

create or replace function public.labor_rates_before_write()
returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if not exists (select 1 from public.organization_memberships m
                 where m.organization_id = new.organization_id and m.user_id = new.user_id and m.role <> 'client') then
    raise exception 'Labor rates can only be set for team members';
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end;
$$;

create trigger labor_rates_before_write before insert or update on public.labor_rates
  for each row execute function public.labor_rates_before_write();

-- ============ Time entries ============
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  cost_category text not null default 'Other' check (public.is_cost_category(cost_category) and cost_category <> 'Contingency'),
  started_at timestamptz not null,
  ended_at timestamptz,
  break_minutes integer not null default 0 check (break_minutes between 0 and 720),
  worked_minutes integer generated always as (
    case when ended_at is null then null
         else greatest(0, (extract(epoch from (ended_at - started_at)) / 60)::integer - break_minutes) end
  ) stored,
  notes text check (notes is null or char_length(notes) <= 1000),
  source text not null default 'clock' check (source in ('clock', 'manual')),
  status text not null default 'open' check (status in ('open', 'pending', 'approved', 'rejected')),
  review_note text check (review_note is null or char_length(review_note) <= 500),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  hourly_cost_cents bigint,
  cost_cents bigint,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint time_entries_open_has_no_end check ((status = 'open') = (ended_at is null)),
  constraint time_entries_end_after_start check (ended_at is null or ended_at > started_at),
  constraint time_entries_max_shift check (ended_at is null or ended_at - started_at <= interval '24 hours'),
  constraint time_entries_cost_when_approved check ((status = 'approved') = (cost_cents is not null))
);

-- One running clock per person.
create unique index time_entries_one_open_per_user on public.time_entries (user_id) where status = 'open';
create index time_entries_org_status on public.time_entries (organization_id, status, started_at desc);
create index time_entries_user_started on public.time_entries (user_id, started_at desc);
create index time_entries_project on public.time_entries (project_id, status);

alter table public.time_entries enable row level security;

create policy time_entries_read on public.time_entries
  for select to authenticated
  using (
    public.is_feature_enabled(organization_id, 'time_tracking')
    and (
      (user_id = auth.uid() and public.is_org_staff(organization_id))
      or (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
    )
  );

revoke all on public.time_entries from anon, authenticated;
grant select on public.time_entries to authenticated;
grant select, insert, update, delete on public.time_entries, public.labor_rates to service_role;

-- ---------- helpers ----------
create or replace function public.time_assert_enabled(p_org uuid)
returns void language plpgsql stable security definer set search_path to '' as $$
begin
  if p_org is null or not public.is_org_staff(p_org) then
    raise exception 'You are not a member of this company';
  end if;
  if not public.is_feature_enabled(p_org, 'time_tracking') then
    raise exception 'Time tracking is turned off for your company';
  end if;
end;
$$;

create or replace function public.time_entry_project_org(p_project uuid)
returns uuid language plpgsql stable security definer set search_path to '' as $$
declare v_org uuid; v_archived timestamptz;
begin
  select p.organization_id, p.archived_at into v_org, v_archived from public.projects p where p.id = p_project;
  if v_org is null or not public.can_view_project_internal(p_project) then
    raise exception 'You are not assigned to this project';
  end if;
  if v_archived is not null then
    raise exception 'This project is archived';
  end if;
  return v_org;
end;
$$;

-- ---------- clock in / out ----------
create or replace function public.time_clock_in(p_project uuid, p_category text default 'Other', p_notes text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v_org uuid := public.time_entry_project_org(p_project); v_id uuid;
begin
  perform public.time_assert_enabled(v_org);
  if exists (select 1 from public.time_entries where user_id = auth.uid() and status = 'open') then
    raise exception 'You are already clocked in. Clock out first.';
  end if;
  insert into public.time_entries (organization_id, project_id, user_id, cost_category, started_at, notes, source, status, created_by, updated_by)
  values (v_org, p_project, auth.uid(), coalesce(nullif(btrim(p_category), ''), 'Other'), now(), nullif(btrim(p_notes), ''), 'clock', 'open', auth.uid(), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.time_clock_out(p_ended_at timestamptz default null, p_break_minutes integer default 0, p_notes text default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare v public.time_entries; v_end timestamptz := coalesce(p_ended_at, now());
begin
  select * into v from public.time_entries where user_id = auth.uid() and status = 'open' for update;
  if v.id is null then raise exception 'You are not clocked in'; end if;
  perform public.time_assert_enabled(v.organization_id);
  if v_end > now() + interval '5 minutes' then raise exception 'The end time can''t be in the future'; end if;
  if v_end <= v.started_at then raise exception 'The end time must be after you clocked in'; end if;
  if v_end - v.started_at > interval '24 hours' then
    raise exception 'You clocked in more than 24 hours ago. Enter the time you actually stopped.';
  end if;
  update public.time_entries
     set ended_at = v_end, status = 'pending', break_minutes = coalesce(p_break_minutes, 0),
         notes = coalesce(nullif(btrim(p_notes), ''), notes), updated_by = auth.uid(), updated_at = now()
   where id = v.id;
  return v.id;
end;
$$;

-- ---------- manual entries and edits ----------
-- Workers add or fix their own unapproved time; managers can fix anyone's (an approved entry goes back to pending).
create or replace function public.time_entry_save(
  p_id uuid, p_project uuid, p_category text, p_started_at timestamptz, p_ended_at timestamptz,
  p_break_minutes integer default 0, p_notes text default null, p_user uuid default null)
returns uuid language plpgsql security definer set search_path to '' as $$
declare
  v_org uuid := public.time_entry_project_org(p_project);
  v public.time_entries;
  v_user uuid := coalesce(p_user, auth.uid());
  v_manager boolean := public.is_org_manager(v_org);
  v_id uuid;
begin
  perform public.time_assert_enabled(v_org);
  if v_user <> auth.uid() and not v_manager then raise exception 'Only managers can enter time for someone else'; end if;
  if v_user <> auth.uid() and not exists (select 1 from public.organization_memberships m
      where m.organization_id = v_org and m.user_id = v_user and m.role <> 'client') then
    raise exception 'That person is not on your team';
  end if;
  if p_started_at is null or p_ended_at is null then raise exception 'Enter a start and end time'; end if;
  if p_ended_at > now() + interval '5 minutes' then raise exception 'Time can''t be entered for the future'; end if;
  if p_ended_at <= p_started_at then raise exception 'The end time must be after the start time'; end if;
  if p_ended_at - p_started_at > interval '24 hours' then raise exception 'One entry can''t be longer than 24 hours. Split it into separate days.'; end if;
  if p_started_at < now() - interval '120 days' then raise exception 'Entries older than 120 days can''t be added'; end if;

  if p_id is null then
    insert into public.time_entries (organization_id, project_id, user_id, cost_category, started_at, ended_at, break_minutes, notes,
      source, status, created_by, updated_by)
    values (v_org, p_project, v_user, coalesce(nullif(btrim(p_category), ''), 'Other'), p_started_at, p_ended_at,
      coalesce(p_break_minutes, 0), nullif(btrim(p_notes), ''), 'manual', 'pending', auth.uid(), auth.uid())
    returning id into v_id;
    return v_id;
  end if;

  select * into v from public.time_entries where id = p_id for update;
  if v.id is null or v.organization_id <> v_org then raise exception 'Time entry not found'; end if;
  if v.status = 'open' then raise exception 'Clock out before editing this entry'; end if;
  if not v_manager and (v.user_id <> auth.uid() or v.status = 'approved') then
    raise exception 'Approved time can only be changed by a manager';
  end if;
  update public.time_entries set
    project_id = p_project, user_id = case when v_manager then v_user else v.user_id end,
    cost_category = coalesce(nullif(btrim(p_category), ''), 'Other'),
    started_at = p_started_at, ended_at = p_ended_at, break_minutes = coalesce(p_break_minutes, 0), notes = nullif(btrim(p_notes), ''),
    status = 'pending', review_note = null, reviewed_by = null, reviewed_at = null, hourly_cost_cents = null, cost_cents = null,
    updated_by = auth.uid(), updated_at = now()
  where id = p_id;
  return p_id;
end;
$$;

create or replace function public.time_entry_delete(p_id uuid)
returns void language plpgsql security definer set search_path to '' as $$
declare v public.time_entries;
begin
  select * into v from public.time_entries where id = p_id for update;
  if v.id is null then raise exception 'Time entry not found'; end if;
  perform public.time_assert_enabled(v.organization_id);
  if public.is_org_manager(v.organization_id) and public.can_view_project_internal(v.project_id) then
    null;
  elsif v.user_id = auth.uid() and v.status in ('open', 'pending', 'rejected') then
    null;
  else
    raise exception 'You can''t delete this entry';
  end if;
  delete from public.time_entries where id = p_id;
end;
$$;

-- ---------- approval ----------
create or replace function public.time_entries_review(p_ids uuid[], p_decision text, p_note text default null)
returns integer language plpgsql security definer set search_path to '' as $$
declare v public.time_entries; v_rate bigint; v_count integer := 0;
begin
  if p_decision not in ('approve', 'reject', 'reopen') then raise exception 'Unknown decision'; end if;
  if p_decision = 'reject' and nullif(btrim(p_note), '') is null then raise exception 'Say why the time was rejected'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;
  if array_length(p_ids, 1) > 500 then raise exception 'Review at most 500 entries at a time'; end if;

  for v in select * from public.time_entries where id = any (p_ids) order by started_at for update loop
    perform public.time_assert_enabled(v.organization_id);
    if not (public.is_org_manager(v.organization_id) and public.can_view_project_internal(v.project_id)) then
      raise exception 'Only managers can review time';
    end if;
    if p_decision = 'approve' then
      if v.status not in ('pending', 'rejected') then continue; end if;
      select r.hourly_cost_cents into v_rate from public.labor_rates r where r.organization_id = v.organization_id and r.user_id = v.user_id;
      v_rate := coalesce(v_rate, 0);
      update public.time_entries set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), ''),
        hourly_cost_cents = v_rate, cost_cents = round(v.worked_minutes::numeric * v_rate / 60)::bigint,
        updated_by = auth.uid(), updated_at = now()
      where id = v.id;
    elsif p_decision = 'reject' then
      if v.status not in ('pending', 'approved') then continue; end if;
      update public.time_entries set status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now(), review_note = btrim(p_note),
        hourly_cost_cents = null, cost_cents = null, updated_by = auth.uid(), updated_at = now()
      where id = v.id;
    else
      if v.status <> 'approved' then continue; end if;
      update public.time_entries set status = 'pending', reviewed_by = null, reviewed_at = null, review_note = null,
        hourly_cost_cents = null, cost_cents = null, updated_by = auth.uid(), updated_at = now()
      where id = v.id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.time_assert_enabled(uuid) from public, anon, authenticated;
revoke all on function public.time_entry_project_org(uuid) from public, anon, authenticated;
revoke all on function public.time_clock_in(uuid, text, text) from public, anon;
revoke all on function public.time_clock_out(timestamptz, integer, text) from public, anon;
revoke all on function public.time_entry_save(uuid, uuid, text, timestamptz, timestamptz, integer, text, uuid) from public, anon;
revoke all on function public.time_entry_delete(uuid) from public, anon;
revoke all on function public.time_entries_review(uuid[], text, text) from public, anon;
grant execute on function public.time_clock_in(uuid, text, text) to authenticated;
grant execute on function public.time_clock_out(timestamptz, integer, text) to authenticated;
grant execute on function public.time_entry_save(uuid, uuid, text, timestamptz, timestamptz, integer, text, uuid) to authenticated;
grant execute on function public.time_entry_delete(uuid) to authenticated;
grant execute on function public.time_entries_review(uuid[], text, text) to authenticated;

-- Existing companies whose plan includes it start with time tracking on, like new ones.
insert into public.organization_features (organization_id, feature_key, enabled)
select o.id, 'time_tracking', true from public.organizations o
where public.plan_includes_feature(o.id, 'time_tracking')
on conflict (organization_id, feature_key) do nothing;
