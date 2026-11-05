-- AI-assisted quote review. Stores validated, builder-internal analyses bound to the exact quote
-- revisions, scope version, and qualification snapshot they were generated from. Analyses are
-- advisory only: nothing here can select, reject, notify, or change quotes. Subcontractor portal
-- users never pass can_review_quotes, so they cannot read these rows.
-- Requires 20261130000010_subcontract_quote_requests.sql and 20261028000020_ai_assistant.sql.

create table if not exists public.subcontract_quote_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  request_id uuid not null references public.subcontract_quote_requests(id) on delete cascade,
  invitation_ids uuid[] not null check (cardinality(invitation_ids) between 2 and 6),
  revision_ids uuid[] not null check (cardinality(revision_ids) = cardinality(invitation_ids)),
  scope_version integer not null check (scope_version > 0),
  input_fingerprint text not null check (input_fingerprint ~ '^[0-9a-f]{64}$'),
  input_snapshot jsonb not null,
  model text not null check (length(model) between 1 and 120),
  result jsonb not null check (jsonb_typeof(result) = 'object' and pg_column_size(result) < 200000),
  created_by uuid not null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists subcontract_quote_ai_analyses_request_time
  on public.subcontract_quote_ai_analyses (request_id, created_at desc);

alter table public.subcontract_quote_ai_analyses enable row level security;

drop policy if exists subcontract_quote_ai_analyses_select on public.subcontract_quote_ai_analyses;
create policy subcontract_quote_ai_analyses_select on public.subcontract_quote_ai_analyses for select to authenticated
  using (public.can_review_quotes(organization_id, project_id));

-- The request must belong to the same organization and project, so a client cannot attach an
-- analysis to another tenant's request. No update or delete policies: analyses are append-only.
drop policy if exists subcontract_quote_ai_analyses_insert on public.subcontract_quote_ai_analyses;
create policy subcontract_quote_ai_analyses_insert on public.subcontract_quote_ai_analyses for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.can_review_quotes(organization_id, project_id)
    and exists (
      select 1 from public.subcontract_quote_requests r
      where r.id = request_id and r.organization_id = subcontract_quote_ai_analyses.organization_id
        and r.project_id = subcontract_quote_ai_analyses.project_id and r.status <> 'draft'
    )
  );

drop policy if exists subcontract_quote_ai_analyses_feature_gate on public.subcontract_quote_ai_analyses;
create policy subcontract_quote_ai_analyses_feature_gate on public.subcontract_quote_ai_analyses as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'ai_assistant') and public.is_feature_enabled(organization_id, 'subcontractors'))
  with check (public.is_feature_enabled(organization_id, 'ai_assistant') and public.is_feature_enabled(organization_id, 'subcontractors'));

revoke all on public.subcontract_quote_ai_analyses from anon;
revoke update, delete, truncate on public.subcontract_quote_ai_analyses from authenticated;
grant select, insert on public.subcontract_quote_ai_analyses to authenticated;

-- Rollback:
--   drop table if exists public.subcontract_quote_ai_analyses;
