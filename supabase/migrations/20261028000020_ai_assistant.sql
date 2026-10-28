-- Register the B & J AI Assistant for server-side feature enforcement (off by default) and add a
-- per-request ledger used for rate limiting and usage review. Prompts and answers are never stored.

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
    ('e_signatures', false, array['documents']),
    ('reports',      true,  array['walkthroughs']),
    ('invoices',     false, array[]::text[]),
    ('payments',     false, array['estimates']),
    ('quickbooks',   false, array['estimates']),
    ('ai_assistant', false, array[]::text[])
$$;

create table if not exists public.ai_assistant_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ai_assistant_requests_user_time on public.ai_assistant_requests (user_id, created_at desc);
create index if not exists ai_assistant_requests_org_time on public.ai_assistant_requests (organization_id, created_at desc);

alter table public.ai_assistant_requests enable row level security;

drop policy if exists ai_assistant_requests_select on public.ai_assistant_requests;
create policy ai_assistant_requests_select on public.ai_assistant_requests for select to authenticated
  using (user_id = auth.uid() or public.is_org_admin(organization_id));

drop policy if exists ai_assistant_requests_insert on public.ai_assistant_requests;
create policy ai_assistant_requests_insert on public.ai_assistant_requests for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists ai_assistant_requests_feature_gate on public.ai_assistant_requests;
create policy ai_assistant_requests_feature_gate on public.ai_assistant_requests as restrictive for all to authenticated
  using (public.is_feature_enabled(organization_id, 'ai_assistant'))
  with check (public.is_feature_enabled(organization_id, 'ai_assistant'));

-- Counts across the whole organization without exposing other users' rows.
create or replace function public.ai_assistant_usage(p_org uuid)
returns table(user_last_hour int, org_last_day int)
language sql stable security definer set search_path = '' as $$
  select
    (select count(*)::int from public.ai_assistant_requests
      where user_id = auth.uid() and organization_id = p_org and created_at > now() - interval '1 hour'),
    (select count(*)::int from public.ai_assistant_requests
      where organization_id = p_org and created_at > now() - interval '1 day')
  where public.is_org_member(p_org)
$$;
revoke all on function public.ai_assistant_usage(uuid) from public;
grant execute on function public.ai_assistant_usage(uuid) to authenticated;
