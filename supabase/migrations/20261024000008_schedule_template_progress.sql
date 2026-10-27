-- Construction progress is derived only from weighted schedule activities.
-- A project with no weighted activities has unknown progress (null), never an invented 0%.
alter table public.projects alter column progress_percent drop not null;
alter table public.projects alter column progress_percent drop default;

update public.projects p
   set progress_percent = null
 where not exists (
   select 1 from public.schedule_activities a
   where a.project_id = p.id and a.status <> 'skipped' and a.weight > 0
 );

create or replace function public.recalculate_project_progress(p_project uuid)
returns void language sql security definer set search_path = '' as $$
  update public.projects p
     set progress_percent = (
       select round(sum(a.weight * a.percent_complete) / nullif(sum(a.weight), 0), 2)
       from public.schedule_activities a
       where a.project_id = p_project and a.status <> 'skipped' and a.weight > 0
     )
   where p.id = p_project;
$$;
revoke execute on function public.recalculate_project_progress(uuid) from public, anon, authenticated;

-- Per-organization, editable default milestones used by "Initialize construction schedule".
create table public.schedule_template_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  template_key text not null check (template_key ~ '^[a-z0-9_]{1,60}$'),
  name text not null check (char_length(btrim(name)) between 2 and 160),
  phase text not null default 'General' check (char_length(btrim(phase)) between 1 and 80),
  activity_type text not null default 'task' check (activity_type in ('task', 'milestone', 'inspection', 'meeting')),
  weight numeric(6,2) not null default 1 check (weight >= 0 and weight <= 1000),
  sort_order integer not null default 0,
  predecessor_keys text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, template_key)
);
create index schedule_template_items_org_idx on public.schedule_template_items (organization_id, sort_order);
create trigger schedule_template_items_updated_at before update on public.schedule_template_items
  for each row execute function public.set_updated_at();

alter table public.schedule_template_items enable row level security;
create policy schedule_template_items_select on public.schedule_template_items for select to authenticated
  using (public.is_org_staff(organization_id));
create policy schedule_template_items_insert on public.schedule_template_items for insert to authenticated
  with check (public.is_org_manager(organization_id));
create policy schedule_template_items_update on public.schedule_template_items for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));
create policy schedule_template_items_delete on public.schedule_template_items for delete to authenticated
  using (public.is_org_manager(organization_id));

create or replace function public.seed_default_schedule_template(p_org uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare v_count integer;
begin
  if not public.is_org_manager(p_org) then
    raise exception 'Only an administrator or project manager can manage the schedule template';
  end if;
  insert into public.schedule_template_items (organization_id, template_key, name, phase, activity_type, weight, sort_order, predecessor_keys)
  select p_org, x.key, x.name, x.phase, x.kind, x.weight, x.ord * 10, x.preds
  from (values
    (1,  'preconstruction',     'Preconstruction',        'Preconstruction', 'milestone',  2::numeric, '{}'::text[]),
    (2,  'site_preparation',    'Site Preparation',       'Site work',       'task',       3, '{preconstruction}'),
    (3,  'excavation',          'Excavation',             'Site work',       'task',       3, '{site_preparation}'),
    (4,  'foundation',          'Foundation',             'Foundation',      'milestone',  8, '{excavation}'),
    (5,  'framing',             'Framing',                'Structure',       'milestone', 12, '{foundation}'),
    (6,  'roofing',             'Roofing',                'Structure',       'task',       5, '{framing}'),
    (7,  'plumbing_rough_in',   'Plumbing Rough',         'Rough-ins',       'task',       4, '{roofing}'),
    (8,  'electrical_rough_in', 'Electrical Rough',       'Rough-ins',       'task',       4, '{roofing}'),
    (9,  'hvac_rough_in',       'HVAC Rough',             'Rough-ins',       'task',       4, '{roofing}'),
    (10, 'insulation',          'Insulation',             'Interior',        'task',       2, '{plumbing_rough_in,electrical_rough_in,hvac_rough_in}'),
    (11, 'drywall',             'Drywall',                'Interior',        'milestone',  5, '{insulation}'),
    (12, 'cabinets',            'Cabinets',               'Interior',        'task',       4, '{drywall}'),
    (13, 'interior_finishes',   'Interior Finishes',      'Interior',        'task',       8, '{cabinets}'),
    (14, 'flooring',            'Flooring',               'Interior',        'task',       4, '{drywall}'),
    (15, 'appliances',          'Appliances',             'Finishes',        'task',       1, '{interior_finishes,flooring}'),
    (16, 'landscaping',         'Landscaping',            'Exterior',        'task',       3, '{roofing}'),
    (17, 'final_inspection',    'Final Inspection',       'Closeout',        'inspection', 1, '{appliances,landscaping}'),
    (18, 'client_walkthrough',  'Homeowner Walkthrough',  'Closeout',        'meeting',    1, '{final_inspection}'),
    (19, 'punch_list',          'Punch List Resolution',  'Closeout',        'task',       2, '{client_walkthrough}'),
    (20, 'project_handover',    'Project Completion',     'Closeout',        'milestone',  1, '{punch_list}')
  ) as x(ord, key, name, phase, kind, weight, preds)
  on conflict (organization_id, template_key) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.seed_default_schedule_template(uuid) from public, anon;
grant execute on function public.seed_default_schedule_template(uuid) to authenticated;

create or replace function public.initialize_project_schedule(p_project uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
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

  -- First pass creates any missing activities; existing template activities are left untouched.
  for t in
    select i.* from public.schedule_template_items i
    where i.organization_id = v_org and i.is_active
    order by i.sort_order, i.created_at
  loop
    insert into public.schedule_activities (
      organization_id, project_id, template_key, name, phase, activity_type, weight, sort_order, created_by, updated_by
    ) values (v_org, p_project, t.template_key, t.name, t.phase, t.activity_type, t.weight, t.sort_order, auth.uid(), auth.uid())
    on conflict (project_id, template_key) do nothing
    returning id into v_new;
    if v_new is not null then v_count := v_count + 1; end if;
    v_new := null;
  end loop;

  -- Second pass links dependencies between template activities, skipping any that already exist.
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
          null; -- a manual edit made this link circular; keep the builder's schedule as-is
        end;
      end if;
    end loop;
  end loop;
  return v_count;
end;
$$;
revoke execute on function public.initialize_project_schedule(uuid) from public, anon;
grant execute on function public.initialize_project_schedule(uuid) to authenticated;

-- Seed the default template for organizations that already exist.
insert into public.schedule_template_items (organization_id, template_key, name, phase, activity_type, weight, sort_order, predecessor_keys)
select o.id, x.key, x.name, x.phase, x.kind, x.weight, x.ord * 10, x.preds
from public.organizations o
cross join (values
  (1,  'preconstruction',     'Preconstruction',        'Preconstruction', 'milestone',  2::numeric, '{}'::text[]),
  (2,  'site_preparation',    'Site Preparation',       'Site work',       'task',       3, '{preconstruction}'),
  (3,  'excavation',          'Excavation',             'Site work',       'task',       3, '{site_preparation}'),
  (4,  'foundation',          'Foundation',             'Foundation',      'milestone',  8, '{excavation}'),
  (5,  'framing',             'Framing',                'Structure',       'milestone', 12, '{foundation}'),
  (6,  'roofing',             'Roofing',                'Structure',       'task',       5, '{framing}'),
  (7,  'plumbing_rough_in',   'Plumbing Rough',         'Rough-ins',       'task',       4, '{roofing}'),
  (8,  'electrical_rough_in', 'Electrical Rough',       'Rough-ins',       'task',       4, '{roofing}'),
  (9,  'hvac_rough_in',       'HVAC Rough',             'Rough-ins',       'task',       4, '{roofing}'),
  (10, 'insulation',          'Insulation',             'Interior',        'task',       2, '{plumbing_rough_in,electrical_rough_in,hvac_rough_in}'),
  (11, 'drywall',             'Drywall',                'Interior',        'milestone',  5, '{insulation}'),
  (12, 'cabinets',            'Cabinets',               'Interior',        'task',       4, '{drywall}'),
  (13, 'interior_finishes',   'Interior Finishes',      'Interior',        'task',       8, '{cabinets}'),
  (14, 'flooring',            'Flooring',               'Interior',        'task',       4, '{drywall}'),
  (15, 'appliances',          'Appliances',             'Finishes',        'task',       1, '{interior_finishes,flooring}'),
  (16, 'landscaping',         'Landscaping',            'Exterior',        'task',       3, '{roofing}'),
  (17, 'final_inspection',    'Final Inspection',       'Closeout',        'inspection', 1, '{appliances,landscaping}'),
  (18, 'client_walkthrough',  'Homeowner Walkthrough',  'Closeout',        'meeting',    1, '{final_inspection}'),
  (19, 'punch_list',          'Punch List Resolution',  'Closeout',        'task',       2, '{client_walkthrough}'),
  (20, 'project_handover',    'Project Completion',     'Closeout',        'milestone',  1, '{punch_list}')
) as x(ord, key, name, phase, kind, weight, preds)
on conflict (organization_id, template_key) do nothing;
