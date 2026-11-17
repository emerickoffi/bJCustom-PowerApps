-- New organizations get a neutral "Trefort Standard Warranty" default template (was "B & J Standard Warranty").
create or replace function public.ensure_default_warranty_template(p_org uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_id uuid;
begin
  select id into v_id from public.warranty_templates where organization_id = p_org and is_default;
  if v_id is not null then return v_id; end if;
  insert into public.warranty_templates (organization_id, name, description, is_default)
    values (p_org, 'Trefort Standard Warranty', 'Default 1-2-10 builder warranty. Coverage periods run concurrently from the official completion date.', true)
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
$function$;
