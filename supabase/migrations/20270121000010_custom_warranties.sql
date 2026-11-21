-- Builder-defined warranties: Settings → Warranty edits the company's warranty templates (coverages, lengths, what each
-- covers, reminders, homeowner note), and a project can use a non-default template before it completes.
-- Homes already under warranty keep their saved terms (project_warranties.terms_snapshot) and are never changed.

alter table public.projects
  add column if not exists warranty_template_id uuid references public.warranty_templates(id) on delete set null;

create or replace function public.validate_warranty_payload(p jsonb)
 returns void
 language plpgsql
 immutable
 set search_path to ''
as $function$
declare c jsonb; v_keys text[] := '{}'; v_names text[] := '{}'; v_key text; v_name text; v_months int; v_cat text;
begin
  if jsonb_typeof(p) <> 'object' then raise exception 'Invalid warranty' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p ->> 'name', ''))) not between 2 and 160 then
    raise exception 'Give the warranty a name (2–160 characters).' using errcode = '22023';
  end if;
  if char_length(coalesce(p ->> 'description', '')) > 2000 then raise exception 'The summary is too long.' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p ->> 'disclaimer', ''))) not between 10 and 4000 then
    raise exception 'Add the note homeowners see with their warranty.' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'reminder_days') <> 'array' or jsonb_array_length(p -> 'reminder_days') not between 1 and 10
     or exists (select 1 from jsonb_array_elements(p -> 'reminder_days') d
                where jsonb_typeof(d) <> 'number' or (d #>> '{}')::numeric <> trunc((d #>> '{}')::numeric)
                   or (d #>> '{}')::numeric not between 0 and 365) then
    raise exception 'Reminder days must be 1–10 whole numbers from 0 to 365.' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'coverages') <> 'array' or jsonb_array_length(p -> 'coverages') not between 1 and 12 then
    raise exception 'A warranty needs 1–12 coverages.' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(p -> 'coverages') loop
    v_key := c ->> 'coverage_key';
    v_name := btrim(coalesce(c ->> 'name', ''));
    if v_key is null or v_key !~ '^[a-z0-9_]{2,40}$' or v_key = any(v_keys) then
      raise exception 'Invalid coverage key' using errcode = '22023';
    end if;
    if char_length(v_name) not between 2 and 80 or lower(v_name) = any(v_names) then
      raise exception 'Each coverage needs its own name (2–80 characters).' using errcode = '22023';
    end if;
    begin
      v_months := (c ->> 'duration_months')::int;
    exception when others then
      raise exception 'Coverage length must be a whole number of months.' using errcode = '22023';
    end;
    if v_months is null or v_months not between 1 and 600 then
      raise exception 'Coverage length must be between 1 month and 50 years.' using errcode = '22023';
    end if;
    if jsonb_typeof(c -> 'categories') <> 'array' or jsonb_array_length(c -> 'categories') not between 1 and 30 then
      raise exception '%: list 1–30 things it covers.', v_name using errcode = '22023';
    end if;
    for v_cat in select jsonb_array_elements_text(c -> 'categories') loop
      if char_length(btrim(v_cat)) not between 1 and 80 then
        raise exception '%: each covered item must be 1–80 characters.', v_name using errcode = '22023';
      end if;
    end loop;
    if char_length(coalesce(c ->> 'description', '')) > 2000 or char_length(coalesce(c ->> 'exclusions', '')) > 2000 then
      raise exception '%: the description or exclusions are too long.', v_name using errcode = '22023';
    end if;
    v_keys := v_keys || v_key;
    v_names := v_names || lower(v_name);
  end loop;
end;
$function$;

-- Create (p_template null) or replace a template and its coverages in one step.
create or replace function public.save_warranty_template(p_org uuid, p_template uuid, p_payload jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid;
begin
  if not public.is_org_admin(p_org) then raise exception 'Only administrators can edit warranties' using errcode = '42501'; end if;
  if not public.is_feature_enabled(p_org, 'warranty') then raise exception 'Warranty Management is turned off' using errcode = '42501'; end if;
  perform public.validate_warranty_payload(p_payload);

  if p_template is null then
    insert into public.warranty_templates (organization_id, name, description, disclaimer, reminder_days, is_default)
      values (p_org, btrim(p_payload ->> 'name'), nullif(btrim(p_payload ->> 'description'), ''), btrim(p_payload ->> 'disclaimer'),
              array(select (d #>> '{}')::int from jsonb_array_elements(p_payload -> 'reminder_days') d order by 1 desc),
              not exists (select 1 from public.warranty_templates where organization_id = p_org and is_default))
      returning id into v_id;
  else
    update public.warranty_templates
       set name = btrim(p_payload ->> 'name'),
           description = nullif(btrim(p_payload ->> 'description'), ''),
           disclaimer = btrim(p_payload ->> 'disclaimer'),
           reminder_days = array(select (d #>> '{}')::int from jsonb_array_elements(p_payload -> 'reminder_days') d order by 1 desc),
           updated_at = now()
     where id = p_template and organization_id = p_org
     returning id into v_id;
    if v_id is null then raise exception 'Warranty not found' using errcode = 'P0002'; end if;
    delete from public.warranty_coverage_rules where template_id = v_id;
  end if;

  insert into public.warranty_coverage_rules (organization_id, template_id, coverage_key, name, duration_months, stage_label,
                                              categories, description, exclusions, sort_order)
  select p_org, v_id, c ->> 'coverage_key', btrim(c ->> 'name'), (c ->> 'duration_months')::int, btrim(c ->> 'name'),
         array(select btrim(x) from jsonb_array_elements_text(c -> 'categories') x),
         nullif(btrim(c ->> 'description'), ''), nullif(btrim(c ->> 'exclusions'), ''), ord::int
    from jsonb_array_elements(p_payload -> 'coverages') with ordinality as t(c, ord);
  return v_id;
end;
$function$;

create or replace function public.set_default_warranty_template(p_template uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_org uuid;
begin
  select organization_id into v_org from public.warranty_templates where id = p_template;
  if v_org is null or not public.is_org_admin(v_org) then raise exception 'Warranty not found' using errcode = 'P0002'; end if;
  update public.warranty_templates set is_default = false, updated_at = now() where organization_id = v_org and is_default and id <> p_template;
  update public.warranty_templates set is_default = true, updated_at = now() where id = p_template;
end;
$function$;

create or replace function public.delete_warranty_template(p_template uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare t public.warranty_templates;
begin
  select * into t from public.warranty_templates where id = p_template;
  if t.id is null or not public.is_org_admin(t.organization_id) then raise exception 'Warranty not found' using errcode = 'P0002'; end if;
  if t.is_default then raise exception 'Choose another default warranty before deleting this one.' using errcode = '22023'; end if;
  -- Projects that picked it fall back to the default; homes already under warranty keep their saved terms.
  delete from public.warranty_templates where id = p_template;
end;
$function$;

-- Which warranty a project will get when it completes (null = the company default). Locked once the warranty starts.
create or replace function public.set_project_warranty_template(p_project uuid, p_template uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare p public.projects;
begin
  select * into p from public.projects where id = p_project;
  if p.id is null or not public.is_org_manager(p.organization_id) then raise exception 'Project not found' using errcode = 'P0002'; end if;
  if exists (select 1 from public.project_warranties where project_id = p_project) then
    raise exception 'This home''s warranty has already started; its terms can''t change.' using errcode = '22023';
  end if;
  if p_template is not null and not exists (
    select 1 from public.warranty_templates where id = p_template and organization_id = p.organization_id) then
    raise exception 'Warranty not found' using errcode = 'P0002';
  end if;
  update public.projects set warranty_template_id = p_template where id = p_project;
end;
$function$;

-- Warranty start: use the project's chosen template, else the company default.
create or replace function public.activate_project_warranty(p_project uuid, p_method text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare p public.projects; v_template uuid; v_id uuid; v_snapshot jsonb; v_reminders int[];
begin
  select * into p from public.projects where id = p_project;
  if p.id is null then raise exception 'Project not found'; end if;
  if p.status <> 'completed' or p.completion_date is null then
    raise exception 'Warranties start only after the project is officially Completed';
  end if;
  select id into v_id from public.project_warranties where project_id = p_project;
  if v_id is not null then return v_id; end if;

  select t.id into v_template from public.warranty_templates t
   where t.id = p.warranty_template_id and t.organization_id = p.organization_id
     and exists (select 1 from public.warranty_coverage_rules r where r.template_id = t.id);
  v_template := coalesce(v_template, public.ensure_default_warranty_template(p.organization_id));
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
$function$;

revoke all on function public.validate_warranty_payload(jsonb) from public, anon;
revoke all on function public.save_warranty_template(uuid, uuid, jsonb) from public, anon;
revoke all on function public.set_default_warranty_template(uuid) from public, anon;
revoke all on function public.delete_warranty_template(uuid) from public, anon;
revoke all on function public.set_project_warranty_template(uuid, uuid) from public, anon;
grant execute on function public.save_warranty_template(uuid, uuid, jsonb) to authenticated;
grant execute on function public.set_default_warranty_template(uuid) to authenticated;
grant execute on function public.delete_warranty_template(uuid) to authenticated;
grant execute on function public.set_project_warranty_template(uuid, uuid) to authenticated;
