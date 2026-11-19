-- AI in two tiers.
-- - ai_essentials (new, Pro and Business): the daily priorities briefing, "Improve with AI" on RFIs, and client
--   update drafting. Small, review-first helpers.
-- - ai_assistant (Business): everything above plus the AI assistant chat, voice punch items, subcontractor quote
--   comparison and estimate drafting.
-- New companies start with both switched on where their plan includes them (the 14-day trial is on Business).
-- Existing companies keep their current switches.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql
immutable
set search_path to ''
as $function$
  values
    ('consultation',   true,  array[]::text[]),
    ('schedule',       true,  array[]::text[]),
    ('estimates',      true,  array[]::text[]),
    ('walkthroughs',   true,  array[]::text[]),
    ('issues',         true,  array[]::text[]),
    ('warranty',       true,  array[]::text[]),
    ('portal',         true,  array[]::text[]),
    ('documents',      false, array[]::text[]),
    ('e_signatures',   false, array['documents']),
    ('reports',        true,  array['walkthroughs']),
    ('invoices',       false, array[]::text[]),
    ('payments',       false, array['estimates']),
    ('quickbooks',     false, array['estimates']),
    ('ai_assistant',   false, array[]::text[]),
    ('ai_essentials',  false, array[]::text[]),
    ('daily_logs',     false, array[]::text[]),
    ('subcontractors', false, array[]::text[]),
    ('client_updates', false, array['portal']),
    ('change_orders',  false, array[]::text[]),
    ('rfis',           false, array[]::text[]),
    ('project_photos', false, array[]::text[])
$function$;

update public.subscription_plans
set features = array_append(features, 'ai_essentials'), updated_at = now()
where key in ('pro', 'business') and not ('ai_essentials' = any (features));

create or replace function public.after_organization_insert_default_modules()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare k text;
begin
  foreach k in array array['daily_logs', 'change_orders', 'invoices', 'ai_essentials', 'ai_assistant'] loop
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
