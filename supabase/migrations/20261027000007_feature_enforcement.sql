-- Server-side enforcement of organization feature flags.
-- Disabling a module hides its rows (restrictive RLS) but never deletes them; re-enabling restores access.
-- Security definer functions (warranty activation, report generation, scheduled jobs) run as the table owner
-- and are not affected, so background processing and data integrity are preserved.

create or replace function public.feature_registry()
returns table(feature_key text, default_enabled boolean, requires text[])
language sql immutable set search_path = '' as $$
  values
    ('consultation', true,  array[]::text[]),
    ('schedule',     true,  array[]::text[]),
    ('estimates',    true,  array[]::text[]),
    ('walkthroughs', true,  array[]::text[]),
    ('issues',       true,  array[]::text[]),
    ('warranty',     true,  array[]::text[]),
    ('portal',       true,  array[]::text[]),
    ('documents',    false, array[]::text[]),
    ('reports',      true,  array['walkthroughs']),
    ('payments',     false, array['estimates']),
    ('quickbooks',   false, array['estimates'])
$$;

-- Warranty claims reuse the issue engine, so a claim's linked issue stays visible under Warranty
-- even when the Issues and punch list module is off.
create or replace function public.issue_feature_visible(p_org uuid, p_issue uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_feature_enabled(p_org, 'issues')
      or (public.is_feature_enabled(p_org, 'warranty')
          and exists (select 1 from public.warranty_claim_links l where l.issue_id = p_issue))
$$;
grant execute on function public.issue_feature_visible(uuid, uuid) to authenticated;

do $$
declare r record;
begin
  for r in select * from (values
      ('estimates', 'estimates'), ('estimate_line_items', 'estimates'),
      ('schedule_activities', 'schedule'), ('schedule_activity_events', 'schedule'),
      ('schedule_baselines', 'schedule'), ('schedule_dependencies', 'schedule'),
      ('walkthroughs', 'walkthroughs'), ('walkthrough_items', 'walkthroughs'),
      ('walkthrough_responses', 'walkthroughs'), ('walkthrough_attachments', 'walkthroughs'),
      ('walkthrough_reports', 'reports'), ('report_acknowledgments', 'reports'),
      ('report_builder_signoffs', 'reports'), ('report_signature_requests', 'reports')
    ) as t(tbl, feature)
  loop
    execute format('drop policy if exists %I on public.%I', r.tbl || '_feature_gate', r.tbl);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.is_feature_enabled(organization_id, %L)) with check (public.is_feature_enabled(organization_id, %L))',
      r.tbl || '_feature_gate', r.tbl, r.feature, r.feature);
  end loop;
end $$;

drop policy if exists project_issues_feature_gate on public.project_issues;
create policy project_issues_feature_gate on public.project_issues as restrictive for all to authenticated
  using (public.issue_feature_visible(organization_id, id))
  with check (public.issue_feature_visible(organization_id, id));

do $$
declare t text;
begin
  foreach t in array array['project_issue_notes', 'project_issue_events', 'issue_attachments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_feature_gate', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (public.issue_feature_visible(organization_id, issue_id)) with check (public.issue_feature_visible(organization_id, issue_id))',
      t || '_feature_gate', t);
  end loop;
end $$;

-- Homeowner access to everything flows through this function, so the Portal switch blocks the whole portal
-- while keeping accounts, project associations and history intact.
create or replace function public.is_project_homeowner(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_project_homeowner_base(p_project)
     and public.portal_contact_can(p_project, 'portal')
     and public.is_feature_enabled((select p.organization_id from public.projects p where p.id = p_project), 'portal')
$$;
