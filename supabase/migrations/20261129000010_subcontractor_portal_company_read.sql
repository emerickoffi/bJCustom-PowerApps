-- Corrective migration for 20261121000010_subcontractor_work_submissions.
-- Portal users are not organization members, so the only permissive read policy on
-- subcontractor_companies (is_org_manager) hid their own company. getSubcontractorSession embeds
-- subcontractor_companies(company_name, status) and drops accounts whose company is not visible,
-- which signed every portal user out. Let a portal user read only the companies sub_company_ids()
-- already authorizes (active account, active company, feature enabled). The restrictive
-- subcontractor_companies_feature_read policy still applies.

create policy subcontractor_companies_portal_read on public.subcontractor_companies
  for select to authenticated
  using (id in (select public.sub_company_ids()));
