-- Per-project schedule phases with stable IDs, saved order, and template-removal tombstones.
-- schedule_activities.phase (text) is kept and always mirrors the phase name, so every existing reader
-- (portal, Gantt, dashboard stage logic, baselines, history) keeps working unchanged.

create table if not exists public.schedule_phases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  -- The template phase label this phase was created from. Survives renames so template sync still finds it.
  template_phase text,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists schedule_phases_project_name_key on public.schedule_phases (project_id, lower(btrim(name)));
create unique index if not exists schedule_phases_project_template_key
  on public.schedule_phases (project_id, lower(template_phase)) where template_phase is not null;
create index if not exists schedule_phases_project_order_idx on public.schedule_phases (project_id, sort_order);

-- Template items (or whole template phases) a builder deliberately removed from one project.
create table if not exists public.schedule_template_exclusions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  item_type text not null check (item_type in ('activity', 'phase')),
  item_key text not null,
  item_name text not null,
  removed_by uuid references auth.users(id) on delete set null default auth.uid(),
  removed_at timestamptz not null default now(),
  unique (project_id, item_type, item_key)
);

drop trigger if exists schedule_phases_updated_at on public.schedule_phases;
create trigger schedule_phases_updated_at before update on public.schedule_phases
  for each row execute function public.set_updated_at();

create or replace function public.validate_schedule_phase()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.organization_id <> old.organization_id) then
    raise exception 'Phases cannot be moved between projects';
  end if;
  new.name := btrim(regexp_replace(new.name, '\s+', ' ', 'g'));
  if new.name = '' then raise exception 'Enter a phase name'; end if;
  return new;
end;
$$;
drop trigger if exists schedule_phases_validate on public.schedule_phases;
create trigger schedule_phases_validate before insert or update on public.schedule_phases
  for each row execute function public.validate_schedule_phase();

alter table public.schedule_phases enable row level security;
alter table public.schedule_template_exclusions enable row level security;

drop policy if exists schedule_phases_select on public.schedule_phases;
create policy schedule_phases_select on public.schedule_phases for select using (public.can_view_project_internal(project_id));
drop policy if exists schedule_phases_insert on public.schedule_phases;
create policy schedule_phases_insert on public.schedule_phases for insert
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists schedule_phases_update on public.schedule_phases;
create policy schedule_phases_update on public.schedule_phases for update
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id))
  with check (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists schedule_phases_delete on public.schedule_phases;
create policy schedule_phases_delete on public.schedule_phases for delete
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists schedule_phases_feature_gate on public.schedule_phases;
create policy schedule_phases_feature_gate on public.schedule_phases as restrictive for all
  using (public.is_feature_enabled(organization_id, 'schedule')) with check (public.is_feature_enabled(organization_id, 'schedule'));

drop policy if exists schedule_template_exclusions_select on public.schedule_template_exclusions;
create policy schedule_template_exclusions_select on public.schedule_template_exclusions for select
  using (public.can_view_project_internal(project_id));
drop policy if exists schedule_template_exclusions_delete on public.schedule_template_exclusions;
create policy schedule_template_exclusions_delete on public.schedule_template_exclusions for delete
  using (public.is_org_manager(organization_id) and public.can_view_project_internal(project_id));
drop policy if exists schedule_template_exclusions_feature_gate on public.schedule_template_exclusions;
create policy schedule_template_exclusions_feature_gate on public.schedule_template_exclusions as restrictive for all
  using (public.is_feature_enabled(organization_id, 'schedule')) with check (public.is_feature_enabled(organization_id, 'schedule'));

alter table public.schedule_activities add column if not exists phase_id uuid references public.schedule_phases(id) on delete restrict;
create index if not exists schedule_activities_phase_idx on public.schedule_activities (phase_id, sort_order);

-- Backfill: one phase per distinct (case-insensitive) phase label, ordered by where it first appears.
alter table public.schedule_activities disable trigger schedule_activities_validate;
alter table public.schedule_activities disable trigger schedule_activities_history;
alter table public.schedule_activities disable trigger schedule_activities_updated_at;

insert into public.schedule_phases (organization_id, project_id, name, template_phase, sort_order, created_by)
select g.organization_id, g.project_id, g.name,
       case when exists (
         select 1 from public.schedule_template_items i
         where i.organization_id = g.organization_id and lower(btrim(i.phase)) = lower(g.name)
       ) then g.name end,
       (row_number() over (partition by g.project_id order by g.first_order, g.first_created)) * 10,
       null
from (
  select a.organization_id, a.project_id, min(btrim(a.phase)) as name, min(a.sort_order) as first_order, min(a.created_at) as first_created
  from public.schedule_activities a
  where a.phase_id is null
  group by a.organization_id, a.project_id, lower(btrim(a.phase))
) g
on conflict do nothing;

update public.schedule_activities a
set phase_id = ph.id, phase = ph.name
from public.schedule_phases ph
where a.phase_id is null and ph.project_id = a.project_id and lower(btrim(ph.name)) = lower(btrim(a.phase));

-- Renumber so activities are contiguous by phase. Display order only; dates, dependencies, assignments untouched.
with ordered as (
  select a.id, row_number() over (partition by a.project_id order by ph.sort_order, a.sort_order, a.created_at, a.id) * 10 as rn
  from public.schedule_activities a join public.schedule_phases ph on ph.id = a.phase_id
)
update public.schedule_activities a set sort_order = o.rn from ordered o where a.id = o.id and a.sort_order <> o.rn;

-- Template activities that were previously deleted from a project (recorded in history) are treated as deliberate removals.
insert into public.schedule_template_exclusions (organization_id, project_id, item_type, item_key, item_name, removed_by, removed_at)
select distinct on (e.project_id, i.template_key)
  e.organization_id, e.project_id, 'activity', i.template_key, i.name, e.actor_id, e.created_at
from public.schedule_activity_events e
join public.projects p on p.id = e.project_id
join public.schedule_template_items i on i.organization_id = p.organization_id and i.name = e.activity_name
where e.event_type = 'deleted'
  and not exists (select 1 from public.schedule_activities a where a.project_id = e.project_id and a.template_key = i.template_key)
order by e.project_id, i.template_key, e.created_at desc
on conflict do nothing;

alter table public.schedule_activities enable trigger schedule_activities_validate;
alter table public.schedule_activities enable trigger schedule_activities_history;
alter table public.schedule_activities enable trigger schedule_activities_updated_at;

alter table public.schedule_activities alter column phase_id set not null;

-- Keeps phase_id and the phase label in sync. Legacy callers that only send a phase label get (or create) the matching phase.
create or replace function public.resolve_schedule_activity_phase()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_name text;
begin
  if tg_op = 'UPDATE' and new.phase_id is not distinct from old.phase_id and new.phase is distinct from old.phase then
    new.phase_id := null;
  end if;

  if new.phase_id is not null then
    select ph.name into v_name from public.schedule_phases ph where ph.id = new.phase_id and ph.project_id = new.project_id;
    if v_name is null then raise exception 'Choose a phase from this project'; end if;
    new.phase := v_name;
    return new;
  end if;

  new.phase := btrim(coalesce(new.phase, ''));
  if new.phase = '' then raise exception 'Choose a phase'; end if;
  if new.template_key is not null then
    select ph.id, ph.name into v_id, v_name from public.schedule_phases ph
    where ph.project_id = new.project_id and lower(ph.template_phase) = lower(new.phase);
  end if;
  if v_id is null then
    select ph.id, ph.name into v_id, v_name from public.schedule_phases ph
    where ph.project_id = new.project_id and lower(btrim(ph.name)) = lower(new.phase);
  end if;
  if v_id is null then
    insert into public.schedule_phases (organization_id, project_id, name, template_phase, sort_order)
    values (
      new.organization_id, new.project_id, new.phase,
      case when new.template_key is not null then new.phase end,
      coalesce((select max(ph.sort_order) from public.schedule_phases ph where ph.project_id = new.project_id), 0) + 10
    )
    returning id, name into v_id, v_name;
  end if;
  new.phase_id := v_id;
  new.phase := v_name;
  return new;
end;
$$;
drop trigger if exists schedule_activities_resolve_phase on public.schedule_activities;
create trigger schedule_activities_resolve_phase before insert or update of phase, phase_id on public.schedule_activities
  for each row execute function public.resolve_schedule_activity_phase();

-- Renaming a phase relabels its activities (recorded in activity history as a phase change).
create or replace function public.cascade_schedule_phase_rename()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.schedule_activities a set phase = new.name where a.phase_id = new.id and a.phase is distinct from new.name;
  return null;
end;
$$;
drop trigger if exists schedule_phases_rename on public.schedule_phases;
create trigger schedule_phases_rename after update of name on public.schedule_phases
  for each row when (old.name is distinct from new.name) execute function public.cascade_schedule_phase_rename();

-- Tombstones so template sync never silently re-adds what a builder removed.
create or replace function public.record_schedule_template_removal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = old.project_id) then return null; end if;
  if tg_table_name = 'schedule_activities' then
    if old.template_key is not null and exists (
      select 1 from public.schedule_template_items i where i.organization_id = old.organization_id and i.template_key = old.template_key
    ) then
      insert into public.schedule_template_exclusions (organization_id, project_id, item_type, item_key, item_name)
      values (old.organization_id, old.project_id, 'activity', old.template_key, old.name)
      on conflict (project_id, item_type, item_key) do update set item_name = excluded.item_name, removed_at = now(), removed_by = auth.uid();
    end if;
  elsif old.template_phase is not null then
    insert into public.schedule_template_exclusions (organization_id, project_id, item_type, item_key, item_name)
    values (old.organization_id, old.project_id, 'phase', lower(old.template_phase), old.name)
    on conflict (project_id, item_type, item_key) do update set item_name = excluded.item_name, removed_at = now(), removed_by = auth.uid();
  end if;
  return null;
end;
$$;
drop trigger if exists schedule_activities_template_removal on public.schedule_activities;
create trigger schedule_activities_template_removal after delete on public.schedule_activities
  for each row execute function public.record_schedule_template_removal();
drop trigger if exists schedule_phases_template_removal on public.schedule_phases;
create trigger schedule_phases_template_removal after delete on public.schedule_phases
  for each row execute function public.record_schedule_template_removal();

-- Contiguous display order: phases by saved order, activities by phase then position. Never touches dates or links.
create or replace function public.renumber_project_schedule(p_project uuid)
returns void language plpgsql set search_path = '' as $$
begin
  with ordered as (
    select ph.id, row_number() over (order by ph.sort_order, ph.created_at, ph.id) * 10 as rn
    from public.schedule_phases ph where ph.project_id = p_project
  )
  update public.schedule_phases ph set sort_order = o.rn from ordered o where ph.id = o.id and ph.sort_order <> o.rn;

  with ordered as (
    select a.id, row_number() over (order by ph.sort_order, a.sort_order, a.created_at, a.id) * 10 as rn
    from public.schedule_activities a join public.schedule_phases ph on ph.id = a.phase_id
    where a.project_id = p_project
  )
  update public.schedule_activities a set sort_order = o.rn from ordered o where a.id = o.id and a.sort_order <> o.rn;
end;
$$;

create or replace function public.move_schedule_phase(p_phase uuid, p_direction integer)
returns void language plpgsql set search_path = '' as $$
declare
  v public.schedule_phases;
  v_other public.schedule_phases;
begin
  select * into v from public.schedule_phases where id = p_phase;
  if v.id is null or not public.is_org_manager(v.organization_id) then raise exception 'Phase not found or you do not have permission to change it'; end if;
  if p_direction < 0 then
    select * into v_other from public.schedule_phases where project_id = v.project_id and (sort_order, id) < (v.sort_order, v.id) order by sort_order desc, id desc limit 1;
  else
    select * into v_other from public.schedule_phases where project_id = v.project_id and (sort_order, id) > (v.sort_order, v.id) order by sort_order, id limit 1;
  end if;
  if v_other.id is null then return; end if;
  update public.schedule_phases set sort_order = v_other.sort_order where id = v.id;
  update public.schedule_phases set sort_order = v.sort_order where id = v_other.id;
  perform public.renumber_project_schedule(v.project_id);
end;
$$;

create or replace function public.move_schedule_activity(p_activity uuid, p_direction integer)
returns void language plpgsql set search_path = '' as $$
declare
  v public.schedule_activities;
  v_other public.schedule_activities;
begin
  select * into v from public.schedule_activities where id = p_activity;
  if v.id is null or not public.is_org_manager(v.organization_id) then raise exception 'Activity not found or you do not have permission to change it'; end if;
  if p_direction < 0 then
    select * into v_other from public.schedule_activities where phase_id = v.phase_id and (sort_order, id) < (v.sort_order, v.id) order by sort_order desc, id desc limit 1;
  else
    select * into v_other from public.schedule_activities where phase_id = v.phase_id and (sort_order, id) > (v.sort_order, v.id) order by sort_order, id limit 1;
  end if;
  if v_other.id is null then return; end if;
  update public.schedule_activities set sort_order = v_other.sort_order where id = v.id;
  update public.schedule_activities set sort_order = v.sort_order where id = v_other.id;
  perform public.renumber_project_schedule(v.project_id);
end;
$$;

-- p_mode: 'empty' (phase must have no activities), 'move' (to p_target, appended in order), 'delete' (with its activities).
create or replace function public.remove_schedule_phase(p_phase uuid, p_mode text, p_target uuid default null)
returns integer language plpgsql set search_path = '' as $$
declare
  v public.schedule_phases;
  v_count integer;
  v_blocked integer;
begin
  select * into v from public.schedule_phases where id = p_phase;
  if v.id is null or not public.is_org_manager(v.organization_id) then raise exception 'Phase not found or you do not have permission to change it'; end if;
  select count(*) into v_count from public.schedule_activities where phase_id = v.id;

  if v_count > 0 and p_mode = 'move' then
    if p_target is null or p_target = v.id or not exists (select 1 from public.schedule_phases where id = p_target and project_id = v.project_id) then
      raise exception 'Choose another phase in this project to move the activities to';
    end if;
    update public.schedule_activities set phase_id = p_target, sort_order = sort_order + 1000000 where phase_id = v.id;
  elsif v_count > 0 and p_mode = 'delete' then
    select count(*) into v_blocked from public.schedule_activities a
    where a.phase_id = v.id and exists (select 1 from public.daily_log_activities d where d.schedule_activity_id = a.id);
    if v_blocked > 0 then
      raise exception '% in this phase % referenced by daily logs. Move the activities to another phase instead.',
        case when v_blocked = 1 then '1 activity' else v_blocked || ' activities' end, case when v_blocked = 1 then 'is' else 'are' end;
    end if;
    select count(*) into v_blocked from public.schedule_activities a
    where a.phase_id = v.id and exists (select 1 from public.schedule_activity_assignments s where s.schedule_activity_id = a.id and s.status <> 'revoked');
    if v_blocked > 0 then
      raise exception '% in this phase % active subcontractor assignments. Revoke them or move the activities to another phase instead.',
        case when v_blocked = 1 then '1 activity' else v_blocked || ' activities' end, case when v_blocked = 1 then 'has' else 'have' end;
    end if;
    select count(*) into v_blocked from public.schedule_activities a
    where a.phase_id = v.id and (a.status <> 'not_started' or a.percent_complete > 0 or a.actual_start is not null or a.actual_end is not null);
    if v_blocked > 0 then
      raise exception '% in this phase % recorded progress. Move the activities to another phase, or mark them Not applicable, instead of deleting.',
        case when v_blocked = 1 then '1 activity' else v_blocked || ' activities' end, case when v_blocked = 1 then 'has' else 'have' end;
    end if;
    delete from public.schedule_activities where phase_id = v.id;
  elsif v_count > 0 then
    raise exception 'This phase still has activities. Move or delete them first.';
  end if;

  delete from public.schedule_phases where id = v.id;
  perform public.renumber_project_schedule(v.project_id);
  return v_count;
end;
$$;

-- Template sync. Deliberately removed activities/phases are skipped unless listed in the restore arrays.
drop function if exists public.initialize_project_schedule(uuid);
create or replace function public.initialize_project_schedule(
  p_project uuid,
  p_restore_activities text[] default '{}',
  p_restore_phases text[] default '{}'
)
returns integer language plpgsql set search_path = '' as $$
declare
  v_org uuid;
  v_count integer := 0;
  v_new uuid;
  v_pred uuid;
  v_key text;
  t record;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null then raise exception 'Project not found or access denied'; end if;
  if not public.is_org_manager(v_org) then
    raise exception 'Only an administrator or project manager can initialize a schedule';
  end if;

  if not exists (select 1 from public.schedule_template_items i where i.organization_id = v_org) then
    perform public.seed_default_schedule_template(v_org);
  end if;

  -- Restoring a phase restores its template activities; restoring an activity restores its phase.
  delete from public.schedule_template_exclusions x
  where x.project_id = p_project and (
    (x.item_type = 'phase' and (
      x.item_key = any(select lower(k) from unnest(p_restore_phases) k)
      or x.item_key in (select lower(i.phase) from public.schedule_template_items i where i.organization_id = v_org and i.template_key = any(p_restore_activities))
    ))
    or (x.item_type = 'activity' and (
      x.item_key = any(p_restore_activities)
      or x.item_key in (select i.template_key from public.schedule_template_items i
                        where i.organization_id = v_org and lower(i.phase) = any(select lower(k) from unnest(p_restore_phases) k))
    ))
  );

  for t in
    select i.* from public.schedule_template_items i
    where i.organization_id = v_org and i.is_active
      and not exists (select 1 from public.schedule_template_exclusions x
                      where x.project_id = p_project and x.item_type = 'activity' and x.item_key = i.template_key)
      and not exists (select 1 from public.schedule_template_exclusions x
                      where x.project_id = p_project and x.item_type = 'phase' and x.item_key = lower(i.phase))
    order by i.sort_order, i.created_at
  loop
    insert into public.schedule_activities (
      organization_id, project_id, template_key, name, phase, activity_type, weight, sort_order, created_by, updated_by
    ) values (v_org, p_project, t.template_key, t.name, t.phase, t.activity_type, t.weight, 1000000 + t.sort_order, auth.uid(), auth.uid())
    on conflict (project_id, template_key) do nothing
    returning id into v_new;
    if v_new is not null then v_count := v_count + 1; end if;
    v_new := null;
  end loop;

  for t in
    select i.template_key, i.predecessor_keys from public.schedule_template_items i
    where i.organization_id = v_org and i.is_active and cardinality(i.predecessor_keys) > 0
  loop
    select a.id into v_new from public.schedule_activities a where a.project_id = p_project and a.template_key = t.template_key;
    continue when v_new is null;
    foreach v_key in array t.predecessor_keys loop
      v_pred := null;
      select a.id into v_pred from public.schedule_activities a where a.project_id = p_project and a.template_key = v_key;
      if v_pred is not null then
        begin
          insert into public.schedule_dependencies (organization_id, project_id, predecessor_id, successor_id, created_by)
            values (v_org, p_project, v_pred, v_new, auth.uid())
            on conflict (predecessor_id, successor_id) do nothing;
        exception when others then
          null;
        end;
      end if;
    end loop;
  end loop;

  if v_count > 0 then perform public.renumber_project_schedule(p_project); end if;
  return v_count;
end;
$$;

grant select, insert, update, delete on public.schedule_phases to authenticated;
grant select, delete on public.schedule_template_exclusions to authenticated;
grant execute on function public.renumber_project_schedule(uuid) to authenticated;
grant execute on function public.move_schedule_phase(uuid, integer) to authenticated;
grant execute on function public.move_schedule_activity(uuid, integer) to authenticated;
grant execute on function public.remove_schedule_phase(uuid, text, uuid) to authenticated;
grant execute on function public.initialize_project_schedule(uuid, text[], text[]) to authenticated;
