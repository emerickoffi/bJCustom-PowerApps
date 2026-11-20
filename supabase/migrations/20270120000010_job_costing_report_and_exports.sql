-- Job costing report and data exports (Business plan).
-- Two new switchable modules. Both only read records each user can already see through RLS; nothing new is stored.
--   project_reports: company-wide job costing report (every job's budget, cost and profit on one page)
--   data_exports:    one-click CSV downloads of company records (administrators only)

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql
immutable
set search_path to ''
as $function$
  values
    ('consultation',    true,  array[]::text[]),
    ('schedule',        true,  array[]::text[]),
    ('estimates',       true,  array[]::text[]),
    ('walkthroughs',    true,  array[]::text[]),
    ('issues',          true,  array[]::text[]),
    ('warranty',        true,  array[]::text[]),
    ('portal',          true,  array[]::text[]),
    ('documents',       false, array[]::text[]),
    ('e_signatures',    false, array['documents']),
    ('reports',         true,  array['walkthroughs']),
    ('invoices',        false, array[]::text[]),
    ('payments',        false, array['estimates']),
    ('quickbooks',      false, array['estimates']),
    ('ai_assistant',    false, array[]::text[]),
    ('ai_essentials',   false, array[]::text[]),
    ('daily_logs',      false, array[]::text[]),
    ('subcontractors',  false, array[]::text[]),
    ('client_updates',  false, array['portal']),
    ('change_orders',   false, array[]::text[]),
    ('rfis',            false, array[]::text[]),
    ('project_photos',  false, array[]::text[]),
    ('time_tracking',   false, array[]::text[]),
    ('project_reports', false, array['estimates']),
    ('data_exports',    false, array[]::text[])
$function$;

update public.subscription_plans
set features = array_append(features, 'project_reports'), updated_at = now()
where key = 'business' and not ('project_reports' = any (features));

update public.subscription_plans
set features = array_append(features, 'data_exports'), updated_at = now()
where key = 'business' and not ('data_exports' = any (features));

-- New companies (who start on the Business trial) get both switched on; they can turn them off in Feature management.
create or replace function public.after_organization_insert_default_modules()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare k text;
begin
  foreach k in array array['daily_logs', 'change_orders', 'invoices', 'ai_essentials', 'ai_assistant', 'time_tracking',
                           'project_reports', 'data_exports'] loop
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
