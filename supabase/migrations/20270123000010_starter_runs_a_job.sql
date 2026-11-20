-- Starter runs a whole job: change orders, invoices and draws, documents and time tracking move into Starter
-- (they stay in Pro and Business). E-signatures, RFIs, subcontractors, client updates, AI and reports stay on higher plans.
-- Plan access only: nothing is switched on for any company. New companies still start with these off
-- (see 20270122000010_simpler_starting_modules.sql) and turn them on in Feature management.

update public.subscription_plans
set features = (
      select array_agg(distinct f order by f)
      from unnest(features || array['change_orders', 'invoices', 'documents', 'time_tracking']) as f
    ),
    updated_at = now()
where key = 'starter';
