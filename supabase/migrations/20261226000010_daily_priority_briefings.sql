-- Daily Priorities Agent: per-user briefing cache and an AI usage ledger.
-- The cache holds only model-written headings/sentences keyed to candidate ids and digests; the
-- candidates themselves are recomputed from live records on every view, so nothing here can surface
-- a record the user can no longer see.
create table if not exists public.daily_priority_briefings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Work scope + project filter, e.g. "mine|all" or "all|<project uuid>".
  scope_key text not null check (char_length(scope_key) <= 80),
  fingerprint text not null check (char_length(fingerprint) <= 128),
  items jsonb not null default '[]'::jsonb,
  source text not null default 'ai' check (source in ('ai', 'fallback')),
  data_checked_at timestamptz not null default now(),
  generated_at timestamptz not null default now(),
  lock_until timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, scope_key)
);

alter table public.daily_priority_briefings enable row level security;

drop policy if exists daily_priority_briefings_own on public.daily_priority_briefings;
create policy daily_priority_briefings_own on public.daily_priority_briefings
  for all
  using (user_id = auth.uid() and public.is_org_member(organization_id))
  with check (user_id = auth.uid() and public.is_org_member(organization_id));

-- Stores no prompts or project content: only who, what kind, and when.
create table if not exists public.ai_priority_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('auto', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists ai_priority_requests_user_idx on public.ai_priority_requests (user_id, created_at desc);
create index if not exists ai_priority_requests_org_idx on public.ai_priority_requests (organization_id, created_at desc);

alter table public.ai_priority_requests enable row level security;

drop policy if exists ai_priority_requests_insert on public.ai_priority_requests;
create policy ai_priority_requests_insert on public.ai_priority_requests
  for insert with check (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists ai_priority_requests_select on public.ai_priority_requests;
create policy ai_priority_requests_select on public.ai_priority_requests
  for select using (user_id = auth.uid() or public.is_org_admin(organization_id));

create or replace function public.ai_priority_usage(p_org uuid)
returns table(user_last_hour integer, user_manual_last_hour integer, user_last_manual timestamptz, org_last_day integer)
language sql
stable
security definer
set search_path to ''
as $$
  select
    (select count(*)::int from public.ai_priority_requests
      where user_id = auth.uid() and organization_id = p_org and created_at > now() - interval '1 hour'),
    (select count(*)::int from public.ai_priority_requests
      where user_id = auth.uid() and organization_id = p_org and kind = 'manual' and created_at > now() - interval '1 hour'),
    (select max(created_at) from public.ai_priority_requests
      where user_id = auth.uid() and organization_id = p_org and kind = 'manual'),
    (select count(*)::int from public.ai_priority_requests
      where organization_id = p_org and created_at > now() - interval '1 day')
  where public.is_org_member(p_org)
$$;

revoke all on function public.ai_priority_usage(uuid) from public, anon;
grant execute on function public.ai_priority_usage(uuid) to authenticated;
