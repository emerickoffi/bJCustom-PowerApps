-- Sample project for new companies and testers.
-- load_sample_project(org) builds one complete, realistic job in the caller's own company using the same
-- RPCs the app uses (schedule template, estimate draft, daily logs, change orders, invoices, payments),
-- so every rule and trigger applies. It runs as the signed-in administrator (security invoker, RLS on),
-- never reaches another company, sends nothing to a homeowner (the sample client has no email or portal
-- account and invoices are not published), and is idempotent: one live sample per company. Each module is
-- filled only when the company has it switched on; calling again later fills modules switched on since.
-- remove_sample_project(org) archives the sample job and client so it disappears from active lists.

alter table public.projects add column if not exists is_sample boolean not null default false;
alter table public.clients add column if not exists is_sample boolean not null default false;

create or replace function public.load_sample_project(p_org uuid)
returns uuid
language plpgsql
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_client uuid;
  v_project uuid;
  v_est uuid;
  v_inv uuid;
  v_co uuid;
  v_sel uuid;
  v_log uuid;
  v_ver integer;
  v_start date := current_date - 56;
  v_i integer := 0;
  v_d date;
  v_end date;
  v_current uuid;
  r record;
  v_log_day date;
  v_total bigint;
  v_num text;
  v_flag boolean;
  v_step integer;
begin
  if v_uid is null or p_org is null or not public.is_org_admin(p_org) then
    raise exception 'Only an administrator can add the sample project';
  end if;

  -- One live sample per company. Calling again reuses it and only adds sections for modules switched on since.
  select p.id, p.primary_client_id, p.proposed_start_date into v_project, v_client, v_start from public.projects p
  where p.organization_id = p_org and p.is_sample and p.archived_at is null
  order by p.created_at limit 1;
  v_start := coalesce(v_start, current_date - 56);

  if v_project is null then
  -- Client (no email and no portal account, so nothing is ever sent to them).
  insert into public.clients (organization_id, first_name, last_name, phone, address_line1, city, state, postal_code,
    preferred_communication, notes, status, is_sample, created_by, updated_by)
  values (p_org, 'Jordan', 'Harper (sample)', '(555) 010-0142', '1427 Cedar Ridge Lane', 'Austin', 'TX', '78738',
    'phone', 'Sample client created so you can explore Trefort. Archive it any time from Getting started.', 'active', true, v_uid, v_uid)
  returning id into v_client;

  -- Project.
  insert into public.projects (organization_id, project_number, name, primary_client_id, project_type, description,
    address_line1, city, state, postal_code, community, lot, estimated_budget_cents, proposed_start_date,
    target_completion_date, project_manager_id, status, internal_notes, is_sample, created_by, updated_by)
  values (p_org, 'pending', 'Harper Residence (sample)', v_client, 'new_custom_home',
    'Two-story, 3,400 sq ft custom home with a three-car garage, covered back patio and open kitchen.',
    '1427 Cedar Ridge Lane', 'Austin', 'TX', '78738', 'Cedar Ridge', '14', 65000000, v_start, v_start + 240,
    v_uid, 'planning', 'Sample project: every record here is example data you can edit, delete or archive.', true, v_uid, v_uid)
  returning id into v_project;
  end if;

  -- Approved estimate.
  select e.id into v_est from public.estimates e where e.project_id = v_project order by e.created_at limit 1;
  if v_est is null and public.is_feature_enabled(p_org, 'estimates') then
  select t.* into v_est, v_num, v_flag from public.create_estimate_draft_with_items(
    v_project, 'Harper Residence - base contract', 'Base construction contract for the Harper Residence.', 15,
    'Allowances are shown as separate lines. Final selections may change the contract price through change orders.',
    jsonb_build_array(
      jsonb_build_object('category', 'Site Preparation', 'description', 'Clearing, grading and erosion control', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 450000, 'labor_unit_cents', 1150000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Foundation', 'description', 'Post-tension slab foundation', 'quantity', 3400, 'unit', 'sf', 'material_unit_cents', 650, 'labor_unit_cents', 450, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Framing', 'description', 'Wall, floor and roof framing package', 'quantity', 3400, 'unit', 'sf', 'material_unit_cents', 1450, 'labor_unit_cents', 950, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Roofing', 'description', 'Standing seam metal roof', 'quantity', 42, 'unit', 'sq', 'material_unit_cents', 52000, 'labor_unit_cents', 31000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Exterior Work', 'description', 'Windows, exterior doors and garage doors', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 3850000, 'labor_unit_cents', 600000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Plumbing', 'description', 'Rough and finish plumbing, 3.5 baths', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 1800000, 'labor_unit_cents', 2100000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Electrical', 'description', 'Rough and finish electrical, 400A service', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 1650000, 'labor_unit_cents', 2250000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'HVAC', 'description', 'Two-zone heat pump system with ductwork', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 1900000, 'labor_unit_cents', 1300000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Insulation', 'description', 'Spray foam insulation, walls and roof deck', 'quantity', 3400, 'unit', 'sf', 'material_unit_cents', 290, 'labor_unit_cents', 160, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Drywall', 'description', 'Drywall hang, tape and level 4 finish', 'quantity', 3400, 'unit', 'sf', 'material_unit_cents', 230, 'labor_unit_cents', 320, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Cabinets', 'description', 'Kitchen, bath and laundry cabinets', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 3200000, 'labor_unit_cents', 450000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Painting', 'description', 'Interior trim, doors, paint and hardware', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 2600000, 'labor_unit_cents', 2900000, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Flooring', 'description', 'Flooring allowance', 'quantity', 2900, 'unit', 'sf', 'material_unit_cents', 900, 'labor_unit_cents', 0, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Countertops', 'description', 'Kitchen countertops allowance', 'quantity', 1, 'unit', 'ls', 'material_unit_cents', 1400000, 'labor_unit_cents', 0, 'other_unit_cents', 0),
      jsonb_build_object('category', 'Management Fees', 'description', 'Supervision, permits, dumpsters and temporary utilities', 'quantity', 8, 'unit', 'mo', 'material_unit_cents', 0, 'labor_unit_cents', 0, 'other_unit_cents', 650000)
    ),
    gen_random_uuid(), v_start - 35, v_start - 5) t;

  update public.estimates set status = 'submitted' where id = v_est;
  update public.estimates set status = 'approved', decision_by_name = 'Jordan Harper', decision_method = 'in_person',
    decision_note = 'Signed at the contract meeting.', decision_at = (v_start - 21)::timestamptz + interval '15 hours'
  where id = v_est;
  end if;

  -- Schedule from the company's template, with realistic dates and progress up to today.
  if public.is_feature_enabled(p_org, 'schedule')
     and not exists (select 1 from public.schedule_activities a where a.project_id = v_project) then
  perform public.initialize_project_schedule(v_project);
  -- Spread the template across the 8-month build so the job reads as about a quarter done.
  select greatest(3, 220 / greatest(count(*), 1))::integer into v_step from public.schedule_activities a where a.project_id = v_project;
  for r in
    select a.id, a.activity_type from public.schedule_activities a
    where a.project_id = v_project order by a.sort_order, a.created_at
  loop
    v_d := v_start + (v_i * v_step);
    v_end := case when r.activity_type = 'milestone' then v_d else v_d + v_step + 2 end;
    if v_end < current_date then
      update public.schedule_activities set planned_start = v_d, planned_end = v_end, actual_start = v_d, actual_end = v_end,
        status = 'completed', percent_complete = 100 where id = r.id;
    elsif v_d <= current_date then
      update public.schedule_activities set planned_start = v_d, planned_end = v_end, actual_start = v_d,
        status = 'in_progress', percent_complete = 40 where id = r.id;
      v_current := coalesce(v_current, r.id);
    else
      update public.schedule_activities set planned_start = v_d, planned_end = v_end where id = r.id;
    end if;
    v_i := v_i + 1;
  end loop;
  end if;

  if exists (select 1 from public.projects p where p.id = v_project and p.status = 'planning') then
    perform public.change_project_status(v_project, 'under_construction', 'Sample project under construction');
  end if;

  -- Daily logs for the last three working days, finalized like a real superintendent would.
  select a.id into v_current from public.schedule_activities a
  where a.project_id = v_project and a.status = 'in_progress' order by a.sort_order limit 1;
  if public.is_feature_enabled(p_org, 'daily_logs')
     and not exists (select 1 from public.daily_logs l where l.project_id = v_project) then
  for v_i in 1..3 loop
    v_log_day := current_date - v_i;
    while extract(isodow from v_log_day) > 5 loop v_log_day := v_log_day - 1; end loop;
    continue when exists (select 1 from public.daily_logs l where l.project_id = v_project and l.log_date = v_log_day);
    v_log := public.save_daily_log(v_project, null, null,
      jsonb_build_object(
        'log_date', v_log_day,
        'weather_conditions', (array['Sunny', 'Partly cloudy', 'Clear'])[v_i],
        'temperature_f', (array[78, 72, 81])[v_i],
        'site_conditions', 'Site dry and accessible. Silt fence intact.',
        'work_performed', (array[
          'Framing crew set second-floor walls on the east side and started roof trusses. Plumber completed top-out on the first floor.',
          'Framers sheathed exterior walls and installed second-floor subfloor. Window delivery checked against the order; two units back-ordered.',
          'Framing crew finished first-floor interior walls. Electrician walked the house with the homeowner to confirm outlet locations.'])[v_i],
        'work_planned_next', 'Finish roof trusses and start roof sheathing. Schedule framing inspection.',
        'materials_delivered', case when v_i = 2 then 'Windows (22 of 24), house wrap, exterior door slabs' else null end,
        'equipment_used', 'Telehandler, generator',
        'safety_observations', 'Toolbox talk on fall protection. All crew wearing harnesses above 6 ft.'
      ),
      jsonb_build_array(
        jsonb_build_object('trade', 'Framing', 'crew_size', 6, 'hours_worked', 8),
        jsonb_build_object('trade', case when v_i = 3 then 'Electrical' else 'Plumbing' end, 'crew_size', 2, 'hours_worked', 6)
      ),
      case when v_current is not null then array[v_current] else '{}'::uuid[] end);
    select l.version into v_ver from public.daily_logs l where l.id = v_log;
    perform public.finalize_daily_log(v_log, v_ver);
  end loop;
  end if;

  -- Approved change order.
  if public.is_feature_enabled(p_org, 'change_orders')
     and not exists (select 1 from public.change_orders c where c.project_id = v_project) then
  v_co := public.save_change_order(v_project, null,
    jsonb_build_object('title', 'Add covered outdoor kitchen', 'description', 'Extend the back patio roof 8 ft and rough in gas, water and power for an outdoor kitchen.',
      'reason', 'Homeowner request', 'requested_by', 'Jordan Harper', 'schedule_impact_days', 4),
    jsonb_build_array(
      jsonb_build_object('category', 'Framing', 'description', 'Extend patio roof framing 8 ft', 'quantity', 1, 'unit', 'ls', 'unit_cost_cents', 640000),
      jsonb_build_object('category', 'Plumbing', 'description', 'Gas and water stub-outs', 'quantity', 1, 'unit', 'ls', 'unit_cost_cents', 285000),
      jsonb_build_object('category', 'Electrical', 'description', 'Two 20A circuits and GFCI outlets', 'quantity', 1, 'unit', 'ls', 'unit_cost_cents', 210000)
    ));
  update public.change_orders set price_adjustment_cents = 1395000 where id = v_co;
  select c.version into v_ver from public.change_orders c where c.id = v_co;
  perform public.transition_change_order(v_co, 'internal_review', v_ver, null);
  select c.version into v_ver from public.change_orders c where c.id = v_co;
  perform public.transition_change_order(v_co, 'awaiting_homeowner', v_ver, null);
  select c.version into v_ver from public.change_orders c where c.id = v_co;
  perform public.decide_change_order(p_id => v_co, p_decision => 'approved', p_expected_version => v_ver,
    p_by_name => 'Jordan Harper', p_method => 'email', p_note => 'Approved by email.', p_decision_at => now(),
    p_signature_request => null);
  end if;

  -- Draws: deposit paid in full, foundation draw partly paid. Not published to the portal.
  if public.is_feature_enabled(p_org, 'invoices')
     and not exists (select 1 from public.invoices i where i.project_id = v_project) then
  insert into public.invoices (organization_id, project_id, client_id, estimate_id, invoice_type, draw_milestone, title,
    invoice_date, due_date, tax_percent, payment_terms, notes)
  values (p_org, v_project, v_client, v_est, 'draw', 'deposit', 'Draw 1 - Contract deposit', v_start - 20, v_start - 10, 0,
    'Due in 10 days', 'Thank you for choosing us to build your home.')
  returning id into v_inv;
  perform public.replace_invoice_lines(v_inv, jsonb_build_array(
    jsonb_build_object('description', 'Contract deposit', 'quantity', 1, 'unit_rate_cents', 7200000, 'taxable', false)));
  perform public.issue_invoice(v_inv, false);
  perform public.record_invoice_payment(v_inv, gen_random_uuid(), v_start - 12, 7200000, 'check', 'Check 1042', null);

  insert into public.invoices (organization_id, project_id, client_id, estimate_id, invoice_type, draw_milestone, title,
    invoice_date, due_date, tax_percent, payment_terms)
  values (p_org, v_project, v_client, v_est, 'draw', 'foundation', 'Draw 2 - Foundation complete', current_date - 18, current_date + 12, 0,
    'Due in 30 days')
  returning id into v_inv;
  perform public.replace_invoice_lines(v_inv, jsonb_build_array(
    jsonb_build_object('description', 'Site work - complete', 'quantity', 1, 'unit_rate_cents', 1600000, 'taxable', false),
    jsonb_build_object('description', 'Foundation - complete', 'quantity', 1, 'unit_rate_cents', 3740000, 'taxable', false),
    jsonb_build_object('description', 'Framing - 25% complete', 'quantity', 1, 'unit_rate_cents', 2040000, 'taxable', false)));
  perform public.issue_invoice(v_inv, false);
  select i.total_cents into v_total from public.invoices i where i.id = v_inv;
  perform public.record_invoice_payment(v_inv, gen_random_uuid(), current_date - 6, v_total / 2, 'ach', 'ACH 88213', 'First half received.');
  end if;

  -- A selection with three options, ready to send to the homeowner.
  if not exists (select 1 from public.selections s where s.project_id = v_project) then
  insert into public.selections (organization_id, project_id, name, category, description, location, allowance_cents, due_date, created_by)
  values (p_org, v_project, 'Kitchen countertops', 'Countertops', 'Choose the countertop for the kitchen and island.', 'Kitchen',
    1400000, current_date + 21, v_uid)
  returning id into v_sel;
  insert into public.selection_options (organization_id, selection_id, name, description, supplier, price_cents, sort_order) values
    (p_org, v_sel, 'Quartz - Calacatta look', '3 cm quartz, eased edge, undermount sink cutout', 'Hill Country Stone', 1350000, 1),
    (p_org, v_sel, 'Granite - Steel Grey', '3 cm granite, polished, eased edge', 'Hill Country Stone', 1180000, 2),
    (p_org, v_sel, 'Quartzite - Taj Mahal', '3 cm quartzite, mitered island edge', 'Hill Country Stone', 1890000, 3);
  end if;

  -- Two follow-ups for the person who loaded the sample.
  if not exists (select 1 from public.staff_tasks t where t.project_id = v_project) then
  insert into public.staff_tasks (organization_id, title, project_id, assigned_to, created_by, due_date) values
    (p_org, 'Schedule framing inspection', v_project, v_uid, v_uid, current_date + 2),
    (p_org, 'Send countertop selection to the homeowner', v_project, v_uid, v_uid, current_date + 5);
  end if;

  return v_project;
end;
$$;

create or replace function public.remove_sample_project(p_org uuid)
returns integer
language plpgsql
set search_path to ''
as $$
declare v_count integer;
begin
  if auth.uid() is null or p_org is null or not public.is_org_admin(p_org) then
    raise exception 'Only an administrator can remove the sample project';
  end if;
  update public.projects set archived_at = now(), updated_by = auth.uid()
  where organization_id = p_org and is_sample and archived_at is null;
  get diagnostics v_count = row_count;
  update public.clients set status = 'archived', archived_at = now(), updated_by = auth.uid()
  where organization_id = p_org and is_sample and archived_at is null;
  update public.staff_tasks set completed_at = now(), completed_by = auth.uid()
  where organization_id = p_org and completed_at is null
    and project_id in (select id from public.projects where organization_id = p_org and is_sample);
  return v_count;
end;
$$;

revoke all on function public.load_sample_project(uuid) from public, anon;
revoke all on function public.remove_sample_project(uuid) from public, anon;
grant execute on function public.load_sample_project(uuid) to authenticated;
grant execute on function public.remove_sample_project(uuid) to authenticated;

-- An administrator can hide the Getting started checklist for the whole company.
alter table public.organization_settings add column if not exists getting_started_dismissed_at timestamptz;

-- Welcome email for a new company's first administrator. Queued once per company (event_key),
-- sent by the existing email worker once email is configured, and never re-sent.
alter table public.email_outbox drop constraint if exists email_outbox_template_check;
alter table public.email_outbox add constraint email_outbox_template_check
  check (template in ('notification', 'staff_invitation', 'client_invitation', 'portal_access', 'welcome'));

create or replace function public.queue_welcome_email(p_org uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_name text;
  v_org text;
  v_trial timestamptz;
begin
  if v_uid is null or p_org is null or not public.is_org_admin(p_org) then
    raise exception 'Only an administrator of this company can do this';
  end if;
  select u.email, nullif(btrim(coalesce(u.raw_user_meta_data->>'full_name', '')), '') into v_email, v_name
  from auth.users u where u.id = v_uid;
  select o.display_name, o.trial_ends_at into v_org, v_trial from public.organizations o where o.id = p_org;
  if v_email is null then return; end if;

  insert into public.email_outbox (event_key, organization_id, user_id, recipient_email, category, template, payload)
  values ('welcome:' || p_org, p_org, v_uid, v_email, 'account', 'welcome',
    jsonb_build_object('organization_name', v_org, 'first_name', split_part(coalesce(v_name, ''), ' ', 1), 'trial_ends_at', v_trial))
  on conflict (event_key) do nothing;
end;
$$;

revoke all on function public.queue_welcome_email(uuid) from public, anon;
grant execute on function public.queue_welcome_email(uuid) to authenticated;

-- New companies start with the field and money modules on, so a trial (and its sample project) shows the
-- whole workflow. Only modules the company's plan includes are switched on; existing companies are unchanged,
-- and admins can turn any of these off in Feature management. A failure here never blocks company creation.
create or replace function public.after_organization_insert_default_modules()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare k text;
begin
  foreach k in array array['daily_logs', 'change_orders', 'invoices'] loop
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

revoke all on function public.after_organization_insert_default_modules() from public, anon, authenticated;

drop trigger if exists after_organization_insert_default_modules on public.organizations;
create trigger after_organization_insert_default_modules
  after insert on public.organizations
  for each row execute function public.after_organization_insert_default_modules();
