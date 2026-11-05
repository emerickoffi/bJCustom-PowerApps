-- Saves a builder's manual List view order (phases, activity positions and phase membership) for ONE project
-- in a single transaction. Runs as the caller so RLS still decides who may edit the schedule.
-- Only sort_order and phase_id change: dates, durations, dependencies, assignments and progress are untouched.
create or replace function public.reorder_project_schedule(
  p_project uuid,
  p_phases uuid[],
  p_activities uuid[],
  p_activity_phases uuid[]
)
returns void language plpgsql set search_path = '' as $$
declare
  v_phase_count integer;
  v_activity_count integer;
  v_expected integer;
  v_changed integer;
  v_stale constant text := 'The schedule changed since it was loaded. Refresh the page and try again.';
begin
  if p_project is null then raise exception 'Invalid project'; end if;
  p_phases := coalesce(p_phases, '{}');
  p_activities := coalesce(p_activities, '{}');
  p_activity_phases := coalesce(p_activity_phases, '{}');
  if cardinality(p_activities) <> cardinality(p_activity_phases) then raise exception 'Invalid schedule order'; end if;

  -- Serialize concurrent reorders of the same project.
  perform 1 from public.schedule_phases where project_id = p_project order by id for update;
  perform 1 from public.schedule_activities where project_id = p_project order by id for update;

  select count(*) into v_phase_count from public.schedule_phases where project_id = p_project;
  select count(*) into v_activity_count from public.schedule_activities where project_id = p_project;

  -- The submitted order must describe exactly this project's current phases and activities, each once.
  if cardinality(p_phases) <> v_phase_count
     or (select count(distinct x) from unnest(p_phases) x) <> v_phase_count
     or exists (select 1 from unnest(p_phases) x where not exists (
       select 1 from public.schedule_phases ph where ph.id = x and ph.project_id = p_project))
  then raise exception '%', v_stale; end if;

  if cardinality(p_activities) <> v_activity_count
     or (select count(distinct x) from unnest(p_activities) x) <> v_activity_count
     or exists (select 1 from unnest(p_activities) x where not exists (
       select 1 from public.schedule_activities a where a.id = x and a.project_id = p_project))
     or exists (select 1 from unnest(p_activity_phases) x where x is null or not (x = any (p_phases)))
  then raise exception '%', v_stale; end if;

  select count(*) into v_expected
  from unnest(p_phases) with ordinality o(id, ord)
  join public.schedule_phases ph on ph.id = o.id
  where ph.sort_order <> o.ord * 10;

  update public.schedule_phases ph set sort_order = o.ord * 10
  from unnest(p_phases) with ordinality o(id, ord)
  where ph.id = o.id and ph.project_id = p_project and ph.sort_order <> o.ord * 10;
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then raise exception 'You do not have permission to reorder this schedule.'; end if;

  select count(*) into v_expected
  from unnest(p_activities, p_activity_phases) with ordinality o(id, phase_id, ord)
  join public.schedule_activities a on a.id = o.id
  where a.sort_order <> o.ord * 10 or a.phase_id is distinct from o.phase_id;

  update public.schedule_activities a set sort_order = o.ord * 10, phase_id = o.phase_id
  from unnest(p_activities, p_activity_phases) with ordinality o(id, phase_id, ord)
  where a.id = o.id and a.project_id = p_project
    and (a.sort_order <> o.ord * 10 or a.phase_id is distinct from o.phase_id);
  get diagnostics v_changed = row_count;
  if v_changed <> v_expected then raise exception 'You do not have permission to reorder this schedule.'; end if;
end;
$$;

revoke all on function public.reorder_project_schedule(uuid, uuid[], uuid[], uuid[]) from public;
grant execute on function public.reorder_project_schedule(uuid, uuid[], uuid[], uuid[]) to authenticated;
