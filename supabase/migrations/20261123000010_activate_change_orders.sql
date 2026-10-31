-- Activate Change Orders. FOR REVIEW — not yet applied. Requires deployment authorization.
-- Additive only. Tables, triggers, RPCs and RLS from 20261029000010_change_orders.sql are already present in the
-- connected environment (verified via PostgREST); this migration only:
-- * registers 'change_orders' in feature_registry() so the Feature Management switch can be persisted, and
-- * adds restrictive feature-gate policies (same pattern as daily_logs) so a disabled module is blocked in the
--   database, not only hidden in the UI. Disabling never deletes rows; re-enabling restores access.
-- feature_registry() is re-declared with the full current list (including client_updates) plus one row, so applying
-- this before or after 20261031000010_client_updates.sql yields the same registry.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
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
    ('daily_logs',     false, array[]::text[]),
    ('subcontractors', false, array[]::text[]),
    ('client_updates', false, array['portal']),
    ('change_orders',  false, array[]::text[])
$$;

do $$
declare t text;
begin
  foreach t in array array['change_orders', 'change_order_line_items', 'change_order_events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_feature_gate', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_feature_enabled(organization_id, %L)) with check (public.is_feature_enabled(organization_id, %L))',
      t || '_feature_gate', t, 'change_orders', 'change_orders');
  end loop;
end $$;
