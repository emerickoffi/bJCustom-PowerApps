-- Usage ledger for voice punch-item drafting (transcription + draft extraction).
-- Stores no audio, transcript, or project content: only who, where, what kind, and when.
create table if not exists public.ai_voice_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null check (kind in ('transcribe', 'extract')),
  created_at timestamptz not null default now()
);

create index if not exists ai_voice_requests_user_idx on public.ai_voice_requests (user_id, created_at desc);
create index if not exists ai_voice_requests_org_idx on public.ai_voice_requests (organization_id, created_at desc);

alter table public.ai_voice_requests enable row level security;

drop policy if exists ai_voice_requests_insert on public.ai_voice_requests;
create policy ai_voice_requests_insert on public.ai_voice_requests
  for insert with check (user_id = auth.uid() and public.is_org_member(organization_id));

drop policy if exists ai_voice_requests_select on public.ai_voice_requests;
create policy ai_voice_requests_select on public.ai_voice_requests
  for select using (user_id = auth.uid() or public.is_org_admin(organization_id));

create or replace function public.ai_voice_usage(p_org uuid, p_kind text)
returns table(user_last_hour integer, org_last_day integer)
language sql
stable
security definer
set search_path to ''
as $$
  select
    (select count(*)::int from public.ai_voice_requests
      where user_id = auth.uid() and organization_id = p_org and kind = p_kind and created_at > now() - interval '1 hour'),
    (select count(*)::int from public.ai_voice_requests
      where organization_id = p_org and kind = p_kind and created_at > now() - interval '1 day')
  where public.is_org_member(p_org)
$$;

revoke all on function public.ai_voice_usage(uuid, text) from public, anon;
grant execute on function public.ai_voice_usage(uuid, text) to authenticated;
