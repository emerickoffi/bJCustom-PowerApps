-- Schedule report (Pro and Business) and warranty report (Business). Off by default for every company.
-- Both only read records each user can already see through RLS; nothing new is stored.
-- Requires 20270120000010_job_costing_report_and_exports.sql (this keeps its two modules in the registry).

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
    ('data_exports',    false, array[]::text[]),
    ('schedule_reports', false, array['schedule']),
    ('warranty_reports', false, array['warranty'])
$function$;

update public.subscription_plans
set features = array_append(features, 'schedule_reports'), updated_at = now()
where key in ('pro', 'business') and not ('schedule_reports' = any (features));

update public.subscription_plans
set features = array_append(features, 'warranty_reports'), updated_at = now()
where key = 'business' and not ('warranty_reports' = any (features));
