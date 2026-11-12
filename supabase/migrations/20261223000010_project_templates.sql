-- Project templates: reusable, versioned schedule structures that seed a project's existing
-- schedule_phases / schedule_activities / schedule_dependencies. Additive only: no existing rows are
-- changed and no template is applied to an existing project.

create table if not exists public.project_templates (
  id uuid primary key default gen_random_uuid(),
  -- null = platform starter catalog, readable by every builder company, editable by none.
  organization_id uuid references public.organizations(id) on delete restrict,
  starter_key text unique check (starter_key is null or starter_key ~ '^[a-z0-9_]{1,60}$'),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text check (description is null or char_length(description) <= 1000),
  project_type text check (project_type is null or char_length(project_type) <= 40),
  status text not null default 'draft' check (status in ('draft', 'published')),
  draft jsonb not null default '{"phases": []}'::jsonb check (jsonb_typeof(draft -> 'phases') = 'array'),
  current_version_id uuid,
  source_project_id uuid references public.projects(id) on delete set null,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((organization_id is null) = (starter_key is not null))
);

create index if not exists project_templates_org_idx on public.project_templates (organization_id, archived_at);

-- Published snapshots. Immutable, so later edits never change projects already created from them.
create table if not exists public.project_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.project_templates(id) on delete restrict,
  organization_id uuid references public.organizations(id) on delete restrict,
  version integer not null check (version >= 1),
  name text not null,
  content jsonb not null check (jsonb_typeof(content -> 'phases') = 'array'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'project_templates_current_version_fkey') then
    alter table public.project_templates
      add constraint project_templates_current_version_fkey
      foreign key (current_version_id) references public.project_template_versions(id) on delete restrict;
  end if;
end $$;

alter table public.projects add column if not exists template_id uuid references public.project_templates(id) on delete restrict;
alter table public.projects add column if not exists template_version_id uuid references public.project_template_versions(id) on delete restrict;

drop trigger if exists project_templates_updated_at on public.project_templates;
create trigger project_templates_updated_at before update on public.project_templates
  for each row execute function public.set_updated_at();

drop trigger if exists project_template_versions_immutable on public.project_template_versions;
create trigger project_template_versions_immutable before update or delete on public.project_template_versions
  for each row execute function public.block_change();

create or replace function public.guard_project_template_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id or new.starter_key is distinct from old.starter_key then
    raise exception 'A template cannot be moved to another company';
  end if;
  return new;
end;
$$;

drop trigger if exists project_templates_owner_guard on public.project_templates;
create trigger project_templates_owner_guard before update on public.project_templates
  for each row execute function public.guard_project_template_owner();

alter table public.project_templates enable row level security;
alter table public.project_template_versions enable row level security;

-- Read: starter catalog for any signed-in user; company templates for that company's admins and PMs.
drop policy if exists project_templates_select on public.project_templates;
create policy project_templates_select on public.project_templates for select to authenticated
  using ((organization_id is null) or public.is_org_manager(organization_id));
drop policy if exists project_templates_insert on public.project_templates;
create policy project_templates_insert on public.project_templates for insert to authenticated
  with check (organization_id is not null and public.is_org_admin(organization_id));
drop policy if exists project_templates_update on public.project_templates;
create policy project_templates_update on public.project_templates for update to authenticated
  using (organization_id is not null and public.is_org_admin(organization_id))
  with check (organization_id is not null and public.is_org_admin(organization_id));
drop policy if exists project_templates_feature_gate on public.project_templates;
create policy project_templates_feature_gate on public.project_templates as restrictive for all to authenticated
  using (organization_id is null or public.is_feature_enabled(organization_id, 'schedule'))
  with check (organization_id is not null and public.is_feature_enabled(organization_id, 'schedule'));

drop policy if exists project_template_versions_select on public.project_template_versions;
create policy project_template_versions_select on public.project_template_versions for select to authenticated
  using ((organization_id is null) or public.is_org_manager(organization_id));
drop policy if exists project_template_versions_insert on public.project_template_versions;
create policy project_template_versions_insert on public.project_template_versions for insert to authenticated
  with check (
    organization_id is not null and public.is_org_admin(organization_id)
    and exists (select 1 from public.project_templates t
                where t.id = project_template_versions.template_id and t.organization_id = project_template_versions.organization_id)
  );
drop policy if exists project_template_versions_feature_gate on public.project_template_versions;
create policy project_template_versions_feature_gate on public.project_template_versions as restrictive for all to authenticated
  using (organization_id is null or public.is_feature_enabled(organization_id, 'schedule'))
  with check (organization_id is not null and public.is_feature_enabled(organization_id, 'schedule'));

-- Mirrors lib/business-days.ts addBusinessDays: Monday–Friday only, no holidays. A weekday start is day 1.
create or replace function public.template_add_business_days(p_start date, p_days integer)
returns date language plpgsql immutable set search_path = '' as $$
declare
  d date := p_start;
  remaining integer;
begin
  if p_start is null or p_days is null or p_days < 1 or p_days > 10000 then return null; end if;
  if extract(isodow from d) = 6 then d := d + 2;
  elsif extract(isodow from d) = 7 then d := d + 1;
  end if;
  d := d + ((p_days - 1) / 5) * 7;
  remaining := (p_days - 1) % 5;
  while remaining > 0 loop
    d := d + 1;
    if extract(isodow from d) < 6 then remaining := remaining - 1; end if;
  end loop;
  return d;
end;
$$;

-- Snapshot the current draft as the next immutable version and mark the template published.
create or replace function public.publish_project_template(p_template uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  t record;
  v_id uuid;
  v_next integer;
begin
  select * into t from public.project_templates where id = p_template for update;
  if not found or t.organization_id is null or not public.is_org_admin(t.organization_id) then
    raise exception 'Template not found or access denied';
  end if;
  if t.archived_at is not null then raise exception 'Restore this template before publishing it'; end if;
  if jsonb_array_length(t.draft -> 'phases') = 0 then raise exception 'Add at least one phase before publishing'; end if;
  select coalesce(max(version), 0) + 1 into v_next from public.project_template_versions where template_id = p_template;
  insert into public.project_template_versions (template_id, organization_id, version, name, content, created_by)
  values (p_template, t.organization_id, v_next, t.name, t.draft, auth.uid())
  returning id into v_id;
  update public.project_templates set current_version_id = v_id, status = 'published', updated_by = auth.uid()
  where id = p_template;
  return v_id;
end;
$$;

-- Copy a published template version into an empty project schedule in one transaction.
-- Security invoker: the existing schedule RLS (manager + project access + schedule feature) applies to
-- every insert. Retrying with the same version is a no-op; a different template is refused.
create or replace function public.apply_project_template(p_project uuid, p_version uuid)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_start date;
  v_applied uuid;
  v_ver record;
  v_tpl record;
  ph jsonb;
  act jsonb;
  v_pred text;
  v_phase_id uuid;
  v_act_id uuid;
  v_ids jsonb := '{}'::jsonb;
  v_ends jsonb := '{}'::jsonb;
  v_phase_order integer := 0;
  v_order integer := 0;
  v_count integer := 0;
  v_deps integer := 0;
  v_undated integer := 0;
  v_dur integer;
  v_s date;
  v_e date;
  v_blocked boolean;
begin
  select p.organization_id, p.proposed_start_date, p.template_version_id
    into v_org, v_start, v_applied
  from public.projects p where p.id = p_project for update;
  if v_org is null then raise exception 'Project not found or access denied'; end if;
  if not public.is_org_manager(v_org) then
    raise exception 'Only an administrator or project manager can apply a template';
  end if;
  if v_applied is not null then
    if v_applied = p_version then
      return jsonb_build_object('activities', 0, 'dependencies', 0, 'undated', 0, 'already_applied', true);
    end if;
    raise exception 'This project already has a template applied';
  end if;
  if exists (select 1 from public.schedule_activities a where a.project_id = p_project)
     or exists (select 1 from public.schedule_phases s where s.project_id = p_project) then
    raise exception 'A template can only be applied to a project with an empty schedule';
  end if;

  select * into v_ver from public.project_template_versions where id = p_version;
  if not found then raise exception 'Template not found'; end if;
  select * into v_tpl from public.project_templates where id = v_ver.template_id;
  if not found or (v_tpl.organization_id is not null and v_tpl.organization_id <> v_org)
     or (v_ver.organization_id is not null and v_ver.organization_id <> v_org) then
    raise exception 'Template not found';
  end if;
  if v_tpl.archived_at is not null then raise exception 'This template is archived'; end if;

  for ph in select value from jsonb_array_elements(v_ver.content -> 'phases') loop
    insert into public.schedule_phases (organization_id, project_id, name, sort_order, created_by)
    values (v_org, p_project, btrim(ph ->> 'name'), v_phase_order, auth.uid())
    returning id into v_phase_id;
    v_phase_order := v_phase_order + 1;

    for act in select value from jsonb_array_elements(coalesce(ph -> 'activities', '[]'::jsonb)) loop
      v_dur := nullif(act ->> 'duration_days', '')::integer;
      v_s := null;
      v_e := null;
      if v_start is not null and v_dur is not null and v_dur >= 0 then
        v_s := v_start;
        v_blocked := false;
        for v_pred in select jsonb_array_elements_text(coalesce(act -> 'predecessors', '[]'::jsonb)) loop
          if not (v_ends ? v_pred) then v_blocked := true; exit; end if;
          v_s := greatest(v_s, (v_ends ->> v_pred)::date + 1);
        end loop;
        if v_blocked then
          v_s := null;
        else
          v_s := public.template_add_business_days(v_s, 1);
          v_e := case when v_dur = 0 then v_s else public.template_add_business_days(v_s, v_dur) end;
        end if;
      end if;
      if v_e is null then v_undated := v_undated + 1; end if;

      insert into public.schedule_activities
        (organization_id, project_id, name, phase, phase_id, activity_type, sort_order, weight, planned_start, planned_end, created_by)
      values
        (v_org, p_project, btrim(act ->> 'name'), btrim(ph ->> 'name'), v_phase_id,
         coalesce(act ->> 'type', 'task'), v_order, coalesce((act ->> 'weight')::numeric, 1), v_s, v_e, auth.uid())
      returning id into v_act_id;
      v_ids := v_ids || jsonb_build_object(act ->> 'key', v_act_id);
      if v_e is not null then v_ends := v_ends || jsonb_build_object(act ->> 'key', v_e); end if;
      v_order := v_order + 1;
      v_count := v_count + 1;
    end loop;
  end loop;

  -- Remap template keys to the new activity ids. Unknown keys are skipped, never invented.
  for ph in select value from jsonb_array_elements(v_ver.content -> 'phases') loop
    for act in select value from jsonb_array_elements(coalesce(ph -> 'activities', '[]'::jsonb)) loop
      for v_pred in select jsonb_array_elements_text(coalesce(act -> 'predecessors', '[]'::jsonb)) loop
        if v_ids ? v_pred and (v_ids ->> v_pred) <> (v_ids ->> (act ->> 'key')) then
          insert into public.schedule_dependencies (organization_id, project_id, predecessor_id, successor_id, created_by)
          values (v_org, p_project, (v_ids ->> v_pred)::uuid, (v_ids ->> (act ->> 'key'))::uuid, auth.uid());
          v_deps := v_deps + 1;
        end if;
      end loop;
    end loop;
  end loop;

  update public.projects set template_id = v_tpl.id, template_version_id = p_version where id = p_project;
  return jsonb_build_object('activities', v_count, 'dependencies', v_deps, 'undated', v_undated, 'already_applied', false);
end;
$$;

revoke all on function public.apply_project_template(uuid, uuid) from public, anon;
revoke all on function public.publish_project_template(uuid) from public, anon;
grant execute on function public.apply_project_template(uuid, uuid) to authenticated;
grant execute on function public.publish_project_template(uuid) to authenticated;

-- Starter catalog. Idempotent: existing starter rows (and all company templates) are never overwritten.
with starters (starter_key, name, description, project_type, content) as (values
  ('custom_home', 'Custom Home Construction', 'New single-family custom home from preconstruction through handover.', 'new_custom_home', '{"phases":[{"name":"Preconstruction","activities":[{"key":"a1","name":"Design review & selections kickoff","type":"task","duration_days":5,"weight":5,"predecessors":[]},{"key":"a2","name":"Permit submission","type":"task","duration_days":10,"weight":10,"predecessors":["a1"]},{"key":"a3","name":"Permit approved","type":"milestone","duration_days":0,"weight":0,"predecessors":["a2"]}]},{"name":"Site Preparation","activities":[{"key":"a4","name":"Survey & staking","type":"task","duration_days":2,"weight":2,"predecessors":["a3"]},{"key":"a5","name":"Clearing & grading","type":"task","duration_days":5,"weight":5,"predecessors":["a4"]},{"key":"a6","name":"Temporary utilities","type":"task","duration_days":2,"weight":2,"predecessors":["a5"]}]},{"name":"Foundation","activities":[{"key":"a7","name":"Footings","type":"task","duration_days":4,"weight":4,"predecessors":["a6"]},{"key":"a8","name":"Footing inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a7"]},{"key":"a9","name":"Foundation walls / slab","type":"task","duration_days":6,"weight":6,"predecessors":["a8"]},{"key":"a10","name":"Foundation complete","type":"milestone","duration_days":0,"weight":0,"predecessors":["a9"]}]},{"name":"Framing","activities":[{"key":"a11","name":"Floor & wall framing","type":"task","duration_days":12,"weight":12,"predecessors":["a10"]},{"key":"a12","name":"Roof framing & sheathing","type":"task","duration_days":6,"weight":6,"predecessors":["a11"]},{"key":"a13","name":"Windows & exterior doors","type":"task","duration_days":3,"weight":3,"predecessors":["a12"]},{"key":"a14","name":"Framing inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a13"]}]},{"name":"Mechanical, Electrical & Plumbing","activities":[{"key":"a15","name":"Plumbing rough-in","type":"task","duration_days":5,"weight":5,"predecessors":["a14"]},{"key":"a16","name":"HVAC rough-in","type":"task","duration_days":5,"weight":5,"predecessors":["a15"]},{"key":"a17","name":"Electrical rough-in","type":"task","duration_days":5,"weight":5,"predecessors":["a16"]},{"key":"a18","name":"MEP rough-in inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a17"]}]},{"name":"Insulation & Drywall","activities":[{"key":"a19","name":"Insulation","type":"task","duration_days":3,"weight":3,"predecessors":["a18"]},{"key":"a20","name":"Insulation inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a19"]},{"key":"a21","name":"Drywall hang & finish","type":"task","duration_days":10,"weight":10,"predecessors":["a20"]}]},{"name":"Interior & Exterior Finishes","activities":[{"key":"a22","name":"Exterior siding & trim","type":"task","duration_days":10,"weight":10,"predecessors":["a21"]},{"key":"a23","name":"Cabinets & countertops","type":"task","duration_days":8,"weight":8,"predecessors":["a22"]},{"key":"a24","name":"Flooring","type":"task","duration_days":6,"weight":6,"predecessors":["a23"]},{"key":"a25","name":"Interior trim & paint","type":"task","duration_days":10,"weight":10,"predecessors":["a24"]},{"key":"a26","name":"Fixtures & appliances","type":"task","duration_days":4,"weight":4,"predecessors":["a25"]}]},{"name":"Final Inspections","activities":[{"key":"a27","name":"Final inspections","type":"inspection","duration_days":2,"weight":2,"predecessors":["a26"]},{"key":"a28","name":"Certificate of occupancy","type":"milestone","duration_days":0,"weight":0,"predecessors":["a27"]}]},{"name":"Handover","activities":[{"key":"a29","name":"Punch list walkthrough","type":"meeting","duration_days":1,"weight":1,"predecessors":["a28"]},{"key":"a30","name":"Punch list completion","type":"task","duration_days":5,"weight":5,"predecessors":["a29"]},{"key":"a31","name":"Homeowner handover","type":"milestone","duration_days":0,"weight":0,"predecessors":["a30"]}]}]}'::jsonb),
  ('renovation', 'Home Renovation', 'Interior renovation of an existing home.', 'renovation', '{"phases":[{"name":"Planning & Permits","activities":[{"key":"a1","name":"Scope & selections review","type":"task","duration_days":5,"weight":5,"predecessors":[]},{"key":"a2","name":"Permit submission","type":"task","duration_days":5,"weight":5,"predecessors":["a1"]},{"key":"a3","name":"Permit approved","type":"milestone","duration_days":0,"weight":0,"predecessors":["a2"]}]},{"name":"Site Preparation","activities":[{"key":"a4","name":"Protection & dust control","type":"task","duration_days":1,"weight":1,"predecessors":["a3"]},{"key":"a5","name":"Utility shutoffs","type":"task","duration_days":1,"weight":1,"predecessors":["a4"]}]},{"name":"Demolition","activities":[{"key":"a6","name":"Selective demolition","type":"task","duration_days":4,"weight":4,"predecessors":["a5"]},{"key":"a7","name":"Debris removal","type":"task","duration_days":1,"weight":1,"predecessors":["a6"]},{"key":"a8","name":"Demolition complete","type":"milestone","duration_days":0,"weight":0,"predecessors":["a7"]}]},{"name":"Rough-In Work","activities":[{"key":"a9","name":"Framing changes","type":"task","duration_days":4,"weight":4,"predecessors":["a8"]},{"key":"a10","name":"Plumbing & electrical rough-in","type":"task","duration_days":5,"weight":5,"predecessors":["a9"]},{"key":"a11","name":"Rough-in inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a10"]}]},{"name":"Finishes","activities":[{"key":"a12","name":"Drywall & paint","type":"task","duration_days":8,"weight":8,"predecessors":["a11"]},{"key":"a13","name":"Cabinets, tile & flooring","type":"task","duration_days":10,"weight":10,"predecessors":["a12"]},{"key":"a14","name":"Fixtures & trim","type":"task","duration_days":4,"weight":4,"predecessors":["a13"]}]},{"name":"Inspections","activities":[{"key":"a15","name":"Final inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a14"]}]},{"name":"Handover","activities":[{"key":"a16","name":"Punch list completion","type":"task","duration_days":3,"weight":3,"predecessors":["a15"]},{"key":"a17","name":"Homeowner handover","type":"milestone","duration_days":0,"weight":0,"predecessors":["a16"]}]}]}'::jsonb),
  ('addition', 'Home Addition', 'Addition tied into an existing home.', 'addition', '{"phases":[{"name":"Planning & Permits","activities":[{"key":"a1","name":"Design & engineering review","type":"task","duration_days":5,"weight":5,"predecessors":[]},{"key":"a2","name":"Permit submission","type":"task","duration_days":10,"weight":10,"predecessors":["a1"]},{"key":"a3","name":"Permit approved","type":"milestone","duration_days":0,"weight":0,"predecessors":["a2"]}]},{"name":"Site Preparation","activities":[{"key":"a4","name":"Layout & excavation","type":"task","duration_days":3,"weight":3,"predecessors":["a3"]},{"key":"a5","name":"Utility locates & protection","type":"task","duration_days":1,"weight":1,"predecessors":["a4"]}]},{"name":"Foundation","activities":[{"key":"a6","name":"Footings & foundation","type":"task","duration_days":6,"weight":6,"predecessors":["a5"]},{"key":"a7","name":"Foundation inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a6"]}]},{"name":"Structural Work","activities":[{"key":"a8","name":"Framing & tie-in","type":"task","duration_days":10,"weight":10,"predecessors":["a7"]},{"key":"a9","name":"Roofing & dry-in","type":"task","duration_days":5,"weight":5,"predecessors":["a8"]},{"key":"a10","name":"Framing inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a9"]},{"key":"a11","name":"Dried in","type":"milestone","duration_days":0,"weight":0,"predecessors":["a10"]}]},{"name":"MEP Integration","activities":[{"key":"a12","name":"MEP rough-in & tie-in","type":"task","duration_days":7,"weight":7,"predecessors":["a11"]},{"key":"a13","name":"MEP inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a12"]}]},{"name":"Finishes","activities":[{"key":"a14","name":"Insulation & drywall","type":"task","duration_days":8,"weight":8,"predecessors":["a13"]},{"key":"a15","name":"Interior finishes","type":"task","duration_days":10,"weight":10,"predecessors":["a14"]},{"key":"a16","name":"Exterior finishes","type":"task","duration_days":6,"weight":6,"predecessors":["a15"]}]},{"name":"Inspections","activities":[{"key":"a17","name":"Final inspection","type":"inspection","duration_days":1,"weight":1,"predecessors":["a16"]}]},{"name":"Handover","activities":[{"key":"a18","name":"Punch list completion","type":"task","duration_days":3,"weight":3,"predecessors":["a17"]},{"key":"a19","name":"Homeowner handover","type":"milestone","duration_days":0,"weight":0,"predecessors":["a18"]}]}]}'::jsonb)

)
insert into public.project_templates (starter_key, name, description, project_type, status, draft)
select s.starter_key, s.name, s.description, s.project_type, 'published', s.content from starters s
on conflict (starter_key) do nothing;

insert into public.project_template_versions (template_id, organization_id, version, name, content)
select t.id, null, 1, t.name, t.draft from public.project_templates t
where t.starter_key is not null and t.current_version_id is null
  and not exists (select 1 from public.project_template_versions v where v.template_id = t.id);

update public.project_templates t set current_version_id = v.id
from public.project_template_versions v
where v.template_id = t.id and v.version = 1 and t.starter_key is not null and t.current_version_id is null;
