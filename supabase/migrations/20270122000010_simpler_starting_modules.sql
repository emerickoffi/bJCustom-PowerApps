-- Simpler first day: new companies start with fewer modules switched on.
-- Before: daily logs, change orders, invoices, time tracking and AI were switched on for every new company.
-- Now: daily logs, project photos and AI (AI stays on for trials by decision). Change orders, invoices and time tracking
-- start off; the Getting started checklist points to them. Existing companies are not changed.
-- Every plan already starts with Schedule, Estimates (with Selections), Walkthroughs and punch list, Warranty and the
-- homeowner portal, which are on by default in feature_registry().

create or replace function public.after_organization_insert_default_modules()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare k text;
begin
  foreach k in array array['daily_logs', 'project_photos', 'ai_essentials', 'ai_assistant'] loop
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

-- "Consultations" was a planned module that was never built; projects already have Lead and Consultation stages.
-- It is taken off the plans so it is never listed as a plan feature. (It stays in feature_registry() so any old
-- stored preference row remains valid; the app no longer shows it.)
update public.subscription_plans
set features = array_remove(features, 'consultation'), updated_at = now()
where 'consultation' = any (features);
