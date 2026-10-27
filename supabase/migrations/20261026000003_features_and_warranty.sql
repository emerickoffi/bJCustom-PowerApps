-- Feature management, warranty lifecycle, in-app notifications, scheduled processing.
-- Disabling a feature never deletes data; it only gates access and processing.

create extension if not exists pg_cron;

alter table public.organization_settings
  add column if not exists timezone text not null default 'America/Chicago';

-- ───────────────────────── Feature registry ─────────────────────────
create or replace function public.feature_registry()
returns table (feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation', true,  array[]::text[]),
    ('schedule',     true,  array[]::text[]),
    ('estimates',    true,  array[]::text[]),
    ('walkthroughs', true,  array[]::text[]),
    ('issues',       true,  array[]::text[]),
    ('warranty',     true,  array['issues']),
    ('portal',       true,  array[]::text[]),
    ('documents',    true,  array[]::text[]),
    ('reports',      true,  array['walkthroughs']),
    ('payments',     false, array['estimates']),
    ('quickbooks',   false, array['estimates'])
$$;

create table public.organization_features (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_key)
);

create or replace function public.feature_flag_raw(p_org uuid, p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select f.enabled from public.organization_features f where f.organization_id = p_org and f.feature_key = p_key),
    (select r.default_enabled from public.feature_registry() r where r.feature_key = p_key),
    false)
$$;

create or replace function public.is_feature_enabled(p_org uuid, p_key text)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.feature_flag_raw(p_org, p_key)
     and not exists (
       select 1 from public.feature_registry() r, unnest(r.requires) req
       where r.feature_key = p_key and not public.feature_flag_raw(p_org, req))
$$;

create or replace function public.organization_features_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_blocker text;
begin
  if tg_op = 'DELETE' then raise exception 'Feature settings cannot be deleted; turn the feature off instead'; end if;
  if not exists (select 1 from public.feature_registry() r where r.feature_key = new.feature_key) then
    raise exception 'Unknown or core feature: %', new.feature_key;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.enabled then
    select req into v_blocker from public.feature_registry() r, unnest(r.requires) req
      where r.feature_key = new.feature_key and not public.feature_flag_raw(new.organization_id, req) limit 1;
    if v_blocker is not null then
      raise exception 'Turn on % before enabling %', v_blocker, new.feature_key;
    end if;
  else
    select r.feature_key into v_blocker from public.feature_registry() r
      where new.feature_key = any(r.requires) and public.feature_flag_raw(new.organization_id, r.feature_key) limit 1;
    if v_blocker is not null then
      raise exception 'Turn off % first; it depends on %', v_blocker, new.feature_key;
    end if;
  end if;
  return new;
end;
$$;
create trigger organization_features_guard before insert or update or delete on public.organization_features
  for each row execute function public.organization_features_guard();
create trigger audit_organization_features after insert or update on public.organization_features
  for each row execute function public.write_audit_event();

alter table public.organization_features enable row level security;
create policy organization_features_select on public.organization_features for select to authenticated
  using (public.is_org_member(organization_id));
create policy organization_features_insert on public.organization_features for insert to authenticated
  with check (public.is_org_admin(organization_id));
create policy organization_features_update on public.organization_features for update to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- ───────────────────────── Project completion ─────────────────────────
alter table public.projects
  add column if not exists completion_date date,
  add column if not exists completed_at timestamptz,
  add column if not exists completed_by uuid references auth.users(id) on delete set null;

create table public.project_completion_corrections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  previous_date date,
  new_date date not null,
  reason text not null check (char_length(btrim(reason)) between 10 and 2000),
  corrected_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.project_completion_corrections enable row level security;
create policy project_completion_corrections_select on public.project_completion_corrections for select to authenticated
  using (public.can_view_project_internal(project_id));

create or replace function public.org_today(p_org uuid)
returns date language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select s.timezone from public.organization_settings s where s.organization_id = p_org), 'America/Chicago'))::date
$$;

create or replace function public.guard_project_completion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if auth.uid() is not null and not public.is_org_manager(new.organization_id) then
      raise exception 'Only an administrator or project manager can mark a project Completed';
    end if;
    if new.completion_date is null then
      new.completion_date := public.org_today(new.organization_id);
      new.completed_at := now();
      new.completed_by := auth.uid();
    end if;
  end if;
  if new.completion_date is distinct from old.completion_date
     and old.completion_date is not null
     and coalesce(current_setting('app.completion_correction', true), '') <> 'on' then
    raise exception 'Use the completion-date correction workflow to change an official completion date';
  end if;
  return new;
end;
$$;
create trigger guard_project_completion before update on public.projects
  for each row execute function public.guard_project_completion();

-- ───────────────────────── Warranty templates ─────────────────────────
create table public.warranty_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 160),
  description text,
  disclaimer text not null default 'Coverage categories are administrative guides. Actual warranty eligibility is governed by the builder''s written warranty agreement.',
  reminder_days integer[] not null default array[30, 7, 0]
    check (array_length(reminder_days, 1) between 1 and 10 and 0 <= all(reminder_days) and 365 >= all(reminder_days)),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index warranty_templates_one_default on public.warranty_templates (organization_id) where is_default;

create table public.warranty_coverage_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_id uuid not null references public.warranty_templates(id) on delete cascade,
  coverage_key text not null check (coverage_key ~ '^[a-z0-9_]{2,40}$'),
  name text not null,
  duration_months integer not null check (duration_months between 1 and 600),
  stage_label text not null,
  categories text[] not null default '{}',
  description text,
  exclusions text,
  sort_order integer not null default 0,
  unique (template_id, coverage_key)
);

alter table public.warranty_templates enable row level security;
alter table public.warranty_coverage_rules enable row level security;
create policy warranty_templates_select on public.warranty_templates for select to authenticated
  using (public.is_org_staff(organization_id));
create policy warranty_templates_write on public.warranty_templates for all to authenticated
  using (public.is_org_admin(organization_id) and public.is_feature_enabled(organization_id, 'warranty'))
  with check (public.is_org_admin(organization_id) and public.is_feature_enabled(organization_id, 'warranty'));
create policy warranty_coverage_rules_select on public.warranty_coverage_rules for select to authenticated
  using (public.is_org_staff(organization_id));
create policy warranty_coverage_rules_write on public.warranty_coverage_rules for all to authenticated
  using (public.is_org_admin(organization_id) and public.is_feature_enabled(organization_id, 'warranty'))
  with check (public.is_org_admin(organization_id) and public.is_feature_enabled(organization_id, 'warranty'));
create trigger audit_warranty_templates after insert or update or delete on public.warranty_templates
  for each row execute function public.write_audit_event();
create trigger audit_warranty_coverage_rules after insert or update or delete on public.warranty_coverage_rules
  for each row execute function public.write_audit_event();

create or replace function public.ensure_default_warranty_template(p_org uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  select id into v_id from public.warranty_templates where organization_id = p_org and is_default;
  if v_id is not null then return v_id; end if;
  insert into public.warranty_templates (organization_id, name, description, is_default)
    values (p_org, 'B & J Standard Warranty', 'Default 1-2-10 builder warranty. Coverage periods run concurrently from the official completion date.', true)
    returning id into v_id;
  insert into public.warranty_coverage_rules (organization_id, template_id, coverage_key, name, duration_months, stage_label, categories, description, sort_order) values
    (p_org, v_id, 'workmanship', 'Year 1 — Workmanship', 12, 'Year 1 Monitoring',
      array['Painting','Workmanship','Interior and exterior finishes','Fixtures','Appliance installation or workmanship'],
      'Workmanship and finish items identified during the first year.', 1),
    (p_org, v_id, 'systems', 'Year 2 — Systems', 24, 'Year 2 Monitoring',
      array['HVAC','Plumbing','Electrical'],
      'Mechanical, plumbing, and electrical distribution systems.', 2),
    (p_org, v_id, 'structural', 'Year 10 — Structural', 120, 'Year 10 Monitoring',
      array['Major structural components','Foundation structural components','Load-bearing systems','Other structural components in the written warranty'],
      'Major structural components as defined in the builder''s written warranty.', 3);
  return v_id;
end;
$$;
revoke execute on function public.ensure_default_warranty_template(uuid) from public, anon, authenticated;
select public.ensure_default_warranty_template(id) from public.organizations;

create or replace function public.after_organization_insert_warranty()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ensure_default_warranty_template(new.id);
  return new;
end;
$$;
create trigger after_organization_insert_warranty after insert on public.organizations
  for each row execute function public.after_organization_insert_warranty();

-- ───────────────────────── Project warranties ─────────────────────────
create table public.project_warranties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null unique references public.projects(id) on delete restrict,
  template_id uuid references public.warranty_templates(id) on delete set null,
  terms_snapshot jsonb not null,
  reminder_days integer[] not null,
  start_date date not null,
  stage text not null default 'monitoring'
    check (stage in ('monitoring', 'completed', 'ready_to_archive', 'archived')),
  current_milestone_id uuid,
  enrollment_method text not null check (enrollment_method in ('automatic', 'backfill')),
  activated_by uuid references auth.users(id) on delete set null,
  activated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index project_warranties_org_idx on public.project_warranties (organization_id, stage);

create table public.warranty_milestones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  warranty_id uuid not null references public.project_warranties(id) on delete restrict,
  coverage_key text not null,
  coverage_name text not null,
  stage_label text not null,
  categories text[] not null default '{}',
  sort_order integer not null,
  due_on date not null,
  reached_at timestamptz,
  unique (warranty_id, coverage_key)
);
create index warranty_milestones_due_idx on public.warranty_milestones (due_on) where reached_at is null;
alter table public.project_warranties
  add constraint project_warranties_current_milestone_fk
  foreign key (current_milestone_id) references public.warranty_milestones(id) on delete set null;

create table public.warranty_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  warranty_id uuid not null references public.project_warranties(id) on delete restrict,
  milestone_id uuid references public.warranty_milestones(id) on delete restrict,
  event_type text not null,
  summary text not null,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index warranty_events_warranty_idx on public.warranty_events (warranty_id, created_at desc);

create table public.warranty_followup_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  warranty_id uuid not null references public.project_warranties(id) on delete restrict,
  milestone_id uuid not null references public.warranty_milestones(id) on delete restrict,
  kind text not null default 'anniversary_card' check (kind in ('anniversary_card')),
  status text not null default 'todo' check (status in ('todo', 'prepared', 'sent')),
  assigned_to uuid references auth.users(id) on delete set null,
  sent_on date,
  delivery_method text check (delivery_method is null or delivery_method in ('mail', 'hand_delivered', 'email', 'other')),
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  unique (milestone_id, kind),
  check (status <> 'sent' or (sent_on is not null and delivery_method is not null))
);

create or replace function public.warranty_followup_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'Follow-up history cannot be deleted'; end if;
  if new.organization_id <> old.organization_id or new.project_id <> old.project_id
     or new.warranty_id <> old.warranty_id or new.milestone_id <> old.milestone_id or new.kind <> old.kind then
    raise exception 'Follow-up task links cannot be changed';
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null
     and not exists (select 1 from public.organization_memberships m where m.organization_id = new.organization_id
                     and m.user_id = new.assigned_to and m.status = 'active' and m.role <> 'client') then
    raise exception 'Follow-ups can only be assigned to active staff';
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status is distinct from old.status then
    insert into public.warranty_events (organization_id, project_id, warranty_id, milestone_id, event_type, summary, actor_id)
      values (new.organization_id, new.project_id, new.warranty_id, new.milestone_id, 'followup_' || new.status,
              'Anniversary card marked ' || replace(new.status, '_', ' '), auth.uid());
  end if;
  return new;
end;
$$;
create trigger warranty_followup_guard before update or delete on public.warranty_followup_tasks
  for each row execute function public.warranty_followup_guard();

create or replace function public.warranty_readonly_guard()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Warranty history cannot be deleted'; end if;
  if tg_op = 'UPDATE' and tg_table_name = 'warranty_events' then raise exception 'Warranty events are immutable'; end if;
  return coalesce(new, old);
end;
$$;
create trigger project_warranties_readonly before delete on public.project_warranties
  for each row execute function public.warranty_readonly_guard();
create trigger warranty_milestones_readonly before delete on public.warranty_milestones
  for each row execute function public.warranty_readonly_guard();
create trigger warranty_events_readonly before update or delete on public.warranty_events
  for each row execute function public.warranty_readonly_guard();

create trigger audit_project_warranties after insert or update on public.project_warranties
  for each row execute function public.write_audit_event();
create trigger audit_warranty_followup_tasks after insert or update on public.warranty_followup_tasks
  for each row execute function public.write_audit_event();

alter table public.project_warranties enable row level security;
alter table public.warranty_milestones enable row level security;
alter table public.warranty_events enable row level security;
alter table public.warranty_followup_tasks enable row level security;

create policy project_warranties_select on public.project_warranties for select to authenticated
  using (public.is_feature_enabled(organization_id, 'warranty') and (
    public.can_view_project_internal(project_id)
    or (public.is_feature_enabled(organization_id, 'portal') and public.is_project_homeowner(project_id))));
create policy warranty_milestones_select on public.warranty_milestones for select to authenticated
  using (public.is_feature_enabled(organization_id, 'warranty') and (
    public.can_view_project_internal(project_id)
    or (public.is_feature_enabled(organization_id, 'portal') and public.is_project_homeowner(project_id))));
create policy warranty_events_select on public.warranty_events for select to authenticated
  using (public.is_feature_enabled(organization_id, 'warranty') and public.can_view_project_internal(project_id));
create policy warranty_followup_tasks_select on public.warranty_followup_tasks for select to authenticated
  using (public.is_feature_enabled(organization_id, 'warranty') and public.can_view_project_internal(project_id));
create policy warranty_followup_tasks_update on public.warranty_followup_tasks for update to authenticated
  using (public.is_feature_enabled(organization_id, 'warranty') and public.is_org_staff(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_feature_enabled(organization_id, 'warranty') and public.is_org_staff(organization_id) and public.can_view_project_internal(project_id));

-- ───────────────────────── Notifications ─────────────────────────
alter table public.notifications
  add column if not exists kind text not null default 'general',
  add column if not exists project_id uuid references public.projects(id) on delete set null,
  add column if not exists client_id uuid references public.clients(id) on delete set null,
  add column if not exists warranty_id uuid references public.project_warranties(id) on delete set null,
  add column if not exists milestone_id uuid references public.warranty_milestones(id) on delete set null,
  add column if not exists dedupe_key text,
  add column if not exists action_required boolean not null default false,
  add column if not exists acknowledged_at timestamptz;
create unique index if not exists notifications_dedupe_idx on public.notifications (user_id, dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create or replace function public.notifications_update_guard()
returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - 'read_at' - 'acknowledged_at') <> (to_jsonb(old) - 'read_at' - 'acknowledged_at') then
    raise exception 'Only read and acknowledged state can be changed';
  end if;
  if new.acknowledged_at is not null and old.acknowledged_at is null then
    new.acknowledged_at := now();
    new.read_at := coalesce(new.read_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists notifications_update_guard on public.notifications;
create trigger notifications_update_guard before update on public.notifications
  for each row execute function public.notifications_update_guard();

create or replace function public.notify_warranty_recipients(
  p_warranty public.project_warranties, p_milestone_id uuid, p_kind text,
  p_title text, p_body text, p_dedupe text, p_action_required boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_pm uuid;
begin
  select primary_client_id, project_manager_id into v_client, v_pm from public.projects where id = p_warranty.project_id;
  insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, client_id,
                                    warranty_id, milestone_id, dedupe_key, action_required)
  select p_warranty.organization_id, u.user_id, p_title, p_body,
         '/projects/' || p_warranty.project_id || '/warranty', p_kind, p_warranty.project_id, v_client,
         p_warranty.id, p_milestone_id, p_dedupe, p_action_required
  from (
    select m.user_id from public.organization_memberships m
      where m.organization_id = p_warranty.organization_id and m.role = 'org_admin' and m.status = 'active'
    union
    select m.user_id from public.organization_memberships m
      where m.organization_id = p_warranty.organization_id and m.user_id = v_pm and m.status = 'active' and m.role <> 'client'
  ) u
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
end;
$$;
revoke execute on function public.notify_warranty_recipients(public.project_warranties, uuid, text, text, text, text, boolean) from public, anon, authenticated;

-- ───────────────────────── Lifecycle engine ─────────────────────────
create or replace function public.refresh_warranty_stage(p_warranty uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.project_warranties; v_next uuid; v_open int;
begin
  select * into w from public.project_warranties where id = p_warranty for update;
  if w.id is null or w.stage = 'archived' then return; end if;
  select id into v_next from public.warranty_milestones
    where warranty_id = w.id and reached_at is null order by due_on, sort_order limit 1;
  if v_next is not null then
    update public.project_warranties set stage = 'monitoring', current_milestone_id = v_next, updated_at = now()
      where id = w.id and (stage <> 'monitoring' or current_milestone_id is distinct from v_next);
    return;
  end if;
  select count(*) into v_open from public.project_issues
    where project_id = w.project_id and status not in ('resolved', 'closed');
  update public.project_warranties
    set stage = case when v_open = 0 then 'ready_to_archive' else 'completed' end,
        current_milestone_id = null, updated_at = now()
    where id = w.id and stage is distinct from case when v_open = 0 then 'ready_to_archive' else 'completed' end;
end;
$$;
revoke execute on function public.refresh_warranty_stage(uuid) from public, anon, authenticated;

create or replace function public.activate_project_warranty(p_project uuid, p_method text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.projects; v_template uuid; v_id uuid; v_snapshot jsonb; v_reminders int[];
begin
  select * into p from public.projects where id = p_project;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status <> 'completed' or p.completion_date is null then
    raise exception 'Warranties start only after the project is officially Completed';
  end if;
  select id into v_id from public.project_warranties where project_id = p_project;
  if v_id is not null then return v_id; end if;

  v_template := public.ensure_default_warranty_template(p.organization_id);
  select jsonb_build_object(
           'template_id', t.id, 'template_name', t.name, 'description', t.description, 'disclaimer', t.disclaimer,
           'captured_at', now(),
           'coverages', coalesce((select jsonb_agg(jsonb_build_object(
               'coverage_key', r.coverage_key, 'name', r.name, 'duration_months', r.duration_months,
               'stage_label', r.stage_label, 'categories', r.categories, 'description', r.description,
               'exclusions', r.exclusions) order by r.sort_order)
             from public.warranty_coverage_rules r where r.template_id = t.id), '[]'::jsonb)),
         t.reminder_days
    into v_snapshot, v_reminders
    from public.warranty_templates t where t.id = v_template;
  if jsonb_array_length(v_snapshot -> 'coverages') = 0 then
    raise exception 'The warranty template has no coverage periods';
  end if;

  insert into public.project_warranties (organization_id, project_id, template_id, terms_snapshot, reminder_days,
                                         start_date, enrollment_method, activated_by)
    values (p.organization_id, p.id, v_template, v_snapshot, v_reminders, p.completion_date, p_method, auth.uid())
    on conflict (project_id) do nothing
    returning id into v_id;
  if v_id is null then
    select id into v_id from public.project_warranties where project_id = p_project;
    return v_id;
  end if;

  insert into public.warranty_milestones (organization_id, project_id, warranty_id, coverage_key, coverage_name,
                                          stage_label, categories, sort_order, due_on)
  select p.organization_id, p.id, v_id, c ->> 'coverage_key', c ->> 'name', c ->> 'stage_label',
         array(select jsonb_array_elements_text(c -> 'categories')), ord::int,
         (p.completion_date + make_interval(months => (c ->> 'duration_months')::int))::date
  from jsonb_array_elements(v_snapshot -> 'coverages') with ordinality as x(c, ord);

  insert into public.warranty_events (organization_id, project_id, warranty_id, event_type, summary, actor_id)
    values (p.organization_id, p.id, v_id, 'warranty_started',
            'Warranty started ' || to_char(p.completion_date, 'Mon DD, YYYY') ||
            case when p_method = 'backfill' then ' (enrolled after completion)' else ' on project completion' end,
            auth.uid());
  perform public.refresh_warranty_stage(v_id);
  return v_id;
end;
$$;
revoke execute on function public.activate_project_warranty(uuid, text) from public, anon, authenticated;

create or replace function public.after_project_completed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and public.is_feature_enabled(new.organization_id, 'warranty') then
    perform public.activate_project_warranty(new.id, 'automatic');
  end if;
  return new;
end;
$$;
create trigger after_project_completed after update on public.projects
  for each row execute function public.after_project_completed();

-- Explicit enrollment for projects completed while the module was off (or before it existed).
create or replace function public.enroll_project_warranty(p_project uuid, p_completion_date date default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.projects;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or not public.is_org_admin(p.organization_id) then raise exception 'Only an administrator can enroll a warranty'; end if;
  if not public.is_feature_enabled(p.organization_id, 'warranty') then raise exception 'Warranty Management is turned off'; end if;
  if p.status <> 'completed' then raise exception 'Only Completed projects can be enrolled'; end if;
  if p.completion_date is null then
    if p_completion_date is null or coalesce(char_length(btrim(p_reason)), 0) < 10 then
      raise exception 'This project has no recorded completion date. Enter the official date and an explanation.';
    end if;
    if p_completion_date > public.org_today(p.organization_id) then raise exception 'Completion date cannot be in the future'; end if;
    perform set_config('app.completion_correction', 'on', true);
    update public.projects set completion_date = p_completion_date, completed_by = coalesce(completed_by, auth.uid()) where id = p.id;
    insert into public.project_completion_corrections (organization_id, project_id, previous_date, new_date, reason, corrected_by)
      values (p.organization_id, p.id, null, p_completion_date, btrim(p_reason), auth.uid());
  end if;
  return public.activate_project_warranty(p.id, 'backfill');
end;
$$;

create or replace function public.correct_project_completion_date(p_project uuid, p_new_date date, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.projects; w public.project_warranties;
begin
  select * into p from public.projects where id = p_project for update;
  if p.id is null or not public.is_org_admin(p.organization_id) then raise exception 'Only an administrator can correct a completion date'; end if;
  if p.completion_date is null then raise exception 'This project has no official completion date'; end if;
  if coalesce(char_length(btrim(p_reason)), 0) < 10 then raise exception 'Explain the correction (at least 10 characters)'; end if;
  if p_new_date > public.org_today(p.organization_id) then raise exception 'Completion date cannot be in the future'; end if;
  if p_new_date = p.completion_date then return; end if;

  perform set_config('app.completion_correction', 'on', true);
  update public.projects set completion_date = p_new_date where id = p.id;
  insert into public.project_completion_corrections (organization_id, project_id, previous_date, new_date, reason, corrected_by)
    values (p.organization_id, p.id, p.completion_date, p_new_date, btrim(p_reason), auth.uid());

  select * into w from public.project_warranties where project_id = p.id for update;
  if w.id is not null then
    update public.project_warranties set start_date = p_new_date, updated_at = now() where id = w.id;
    update public.warranty_milestones m
      set due_on = (p_new_date + make_interval(months => (c ->> 'duration_months')::int))::date
      from jsonb_array_elements(w.terms_snapshot -> 'coverages') c
      where m.warranty_id = w.id and m.coverage_key = c ->> 'coverage_key' and m.reached_at is null;
    insert into public.warranty_events (organization_id, project_id, warranty_id, event_type, summary, actor_id)
      values (p.organization_id, p.id, w.id, 'completion_date_corrected',
              'Completion date corrected from ' || to_char(p.completion_date, 'Mon DD, YYYY') || ' to ' ||
              to_char(p_new_date, 'Mon DD, YYYY') || ': ' || btrim(p_reason), auth.uid());
    perform public.refresh_warranty_stage(w.id);
  end if;
end;
$$;

create or replace function public.archive_project_warranty(p_warranty uuid, p_reopen boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.project_warranties; v_open int;
begin
  select * into w from public.project_warranties where id = p_warranty for update;
  if w.id is null or not public.is_org_admin(w.organization_id) then raise exception 'Only an administrator can archive warranties'; end if;
  if not public.is_feature_enabled(w.organization_id, 'warranty') then raise exception 'Warranty Management is turned off'; end if;
  if p_reopen then
    if w.stage <> 'archived' then return; end if;
    update public.project_warranties set stage = 'completed', archived_at = null, archived_by = null, updated_at = now() where id = w.id;
    update public.projects set archived_at = null where id = w.project_id;
    insert into public.warranty_events (organization_id, project_id, warranty_id, event_type, summary, actor_id)
      values (w.organization_id, w.project_id, w.id, 'reopened', 'Archived warranty reopened', auth.uid());
    perform public.refresh_warranty_stage(w.id);
    return;
  end if;
  if w.stage <> 'ready_to_archive' then
    perform public.refresh_warranty_stage(w.id);
    select * into w from public.project_warranties where id = p_warranty;
    if w.stage <> 'ready_to_archive' then
      raise exception 'This warranty cannot be archived until all milestones are reached and every claim is closed';
    end if;
  end if;
  select count(*) into v_open from public.walkthrough_reports r
    where r.project_id = w.project_id and r.signoff_requested_at is not null
      and not exists (select 1 from public.report_acknowledgments a where a.report_id = r.id and a.decision = 'accepted');
  if v_open > 0 then raise exception 'A requested final sign-off is still pending'; end if;
  update public.project_warranties set stage = 'archived', archived_at = now(), archived_by = auth.uid(), updated_at = now() where id = w.id;
  update public.projects set archived_at = coalesce(archived_at, now()) where id = w.project_id;
  insert into public.warranty_events (organization_id, project_id, warranty_id, event_type, summary, actor_id)
    values (w.organization_id, w.project_id, w.id, 'archived', 'Project archived after warranty completion', auth.uid());
end;
$$;

-- Daily processor. Idempotent: milestones are marked once, notifications dedupe on keys,
-- and reminders are only sent inside their window so re-enabling never replays old alerts.
create or replace function public.process_warranty_schedule(p_org uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w public.project_warranties; m public.warranty_milestones;
  v_today date; v_days int; v_first boolean;
  v_reached int := 0; v_reminders int := 0; v_warranties int := 0;
begin
  if auth.uid() is not null and (p_org is null or not public.is_org_admin(p_org)) then
    raise exception 'Only an administrator can run warranty processing';
  end if;

  for w in
    select pw.* from public.project_warranties pw
    where pw.stage <> 'archived'
      and (p_org is null or pw.organization_id = p_org)
      and public.is_feature_enabled(pw.organization_id, 'warranty')
  loop
    begin
      v_warranties := v_warranties + 1;
      v_today := public.org_today(w.organization_id);

      for m in select * from public.warranty_milestones
               where warranty_id = w.id and reached_at is null and due_on <= v_today order by due_on, sort_order
      loop
        update public.warranty_milestones set reached_at = now() where id = m.id and reached_at is null;
        if not found then continue; end if;
        v_reached := v_reached + 1;
        v_first := not exists (select 1 from public.warranty_milestones x
                               where x.warranty_id = w.id and x.sort_order < m.sort_order);
        insert into public.warranty_events (organization_id, project_id, warranty_id, milestone_id, event_type, summary)
          values (w.organization_id, w.project_id, w.id, m.id, 'milestone_reached', m.coverage_name || ' coverage period ended');
        perform public.notify_warranty_recipients(w, m.id, 'warranty_milestone',
          m.coverage_name || ' milestone reached',
          'The ' || m.coverage_name || ' period ended on ' || to_char(m.due_on, 'Mon DD, YYYY') || '. Review any open claims.',
          'milestone:' || m.id || ':reached', true);
        if v_first then
          insert into public.warranty_followup_tasks (organization_id, project_id, warranty_id, milestone_id, kind)
            values (w.organization_id, w.project_id, w.id, m.id, 'anniversary_card')
            on conflict (milestone_id, kind) do nothing;
          if found then
            perform public.notify_warranty_recipients(w, m.id, 'anniversary_card',
              'Anniversary card follow-up',
              'The one-year anniversary has arrived. Prepare and send the homeowner''s anniversary card.',
              'milestone:' || m.id || ':anniversary', true);
          end if;
        end if;
      end loop;

      for m in select * from public.warranty_milestones
               where warranty_id = w.id and reached_at is null and due_on >= v_today
      loop
        foreach v_days in array w.reminder_days loop
          if v_days > 0 and m.due_on - v_days <= v_today and m.due_on - v_today <= v_days
             and not exists (select 1 from unnest(w.reminder_days) d where d < v_days and d > 0 and m.due_on - d <= v_today) then
            perform public.notify_warranty_recipients(w, m.id, 'warranty_reminder',
              m.coverage_name || ' ends in ' || (m.due_on - v_today) || ' day' || case when m.due_on - v_today = 1 then '' else 's' end,
              'Coverage milestone on ' || to_char(m.due_on, 'Mon DD, YYYY') || '.',
              'milestone:' || m.id || ':remind:' || v_days, false);
            v_reminders := v_reminders + 1;
          end if;
        end loop;
      end loop;

      perform public.refresh_warranty_stage(w.id);
    exception when others then
      raise warning 'warranty processing failed for %: %', w.id, sqlerrm;
    end;
  end loop;

  return jsonb_build_object('warranties', v_warranties, 'milestones_reached', v_reached, 'reminder_checks', v_reminders, 'ran_at', now());
end;
$$;
revoke execute on function public.process_warranty_schedule(uuid) from public, anon;
grant execute on function public.process_warranty_schedule(uuid) to authenticated;

create table public.scheduled_job_runs (
  id bigint generated always as identity primary key,
  job_name text not null,
  started_at timestamptz not null default now(),
  result jsonb,
  error text
);
alter table public.scheduled_job_runs enable row level security;

create or replace function public.run_scheduled_warranty_job()
returns void language plpgsql security definer set search_path = '' as $$
declare v_result jsonb;
begin
  v_result := public.process_warranty_schedule(null);
  insert into public.scheduled_job_runs (job_name, result) values ('warranty_daily', v_result);
exception when others then
  insert into public.scheduled_job_runs (job_name, error) values ('warranty_daily', sqlerrm);
end;
$$;
revoke execute on function public.run_scheduled_warranty_job() from public, anon, authenticated;

select cron.schedule('warranty_daily', '15 11 * * *', 'select public.run_scheduled_warranty_job()');
