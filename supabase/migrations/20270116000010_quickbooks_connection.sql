-- QuickBooks Online connection (Business plan).
-- One QuickBooks company per Trefort company. OAuth tokens are stored in Supabase Vault, never in a table column,
-- and only the server (service role) can read them. Admins can see the connection status, never the tokens.

create table public.quickbooks_connections (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  realm_id text not null check (realm_id ~ '^[0-9]{1,32}$'),
  company_name text,
  environment text not null check (environment in ('sandbox', 'production')),
  status text not null default 'connected' check (status in ('connected', 'needs_reauth')),
  access_token_secret_id uuid,
  refresh_token_secret_id uuid,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  service_item_id text,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);

alter table public.quickbooks_connections enable row level security;

create policy quickbooks_connections_admin_read on public.quickbooks_connections
  for select to authenticated
  using (public.is_org_admin(organization_id));

-- Admins read status columns only; the secret ids stay server-side.
revoke all on public.quickbooks_connections from anon, authenticated;
grant select (organization_id, realm_id, company_name, environment, status, access_token_expires_at,
  refresh_token_expires_at, connected_by, connected_at, last_synced_at, last_error, updated_at)
  on public.quickbooks_connections to authenticated;

-- Which Trefort record matches which QuickBooks record.
create table public.quickbooks_sync_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in ('client', 'invoice', 'payment')),
  local_id uuid not null,
  qbo_id text not null,
  sync_token text,
  synced_at timestamptz not null default now(),
  unique (organization_id, entity_type, local_id)
);

alter table public.quickbooks_sync_links enable row level security;

create policy quickbooks_sync_links_staff_read on public.quickbooks_sync_links
  for select to authenticated
  using (public.is_org_staff(organization_id));

revoke all on public.quickbooks_sync_links from anon, authenticated;
grant select on public.quickbooks_sync_links to authenticated;

-- Server-only helpers (service role).
create or replace function public.qbo_save_connection(
  p_org uuid, p_realm text, p_environment text, p_company text,
  p_access text, p_refresh text, p_access_expires timestamptz, p_refresh_expires timestamptz, p_user uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v_old public.quickbooks_connections; v_access uuid; v_refresh uuid;
begin
  select * into v_old from public.quickbooks_connections where organization_id = p_org for update;
  if v_old.access_token_secret_id is not null then delete from vault.secrets where id = v_old.access_token_secret_id; end if;
  if v_old.refresh_token_secret_id is not null then delete from vault.secrets where id = v_old.refresh_token_secret_id; end if;

  v_access := vault.create_secret(p_access, 'qbo_access_' || p_org::text || '_' || gen_random_uuid()::text);
  v_refresh := vault.create_secret(p_refresh, 'qbo_refresh_' || p_org::text || '_' || gen_random_uuid()::text);

  insert into public.quickbooks_connections as c (organization_id, realm_id, company_name, environment, status,
    access_token_secret_id, refresh_token_secret_id, access_token_expires_at, refresh_token_expires_at,
    connected_by, connected_at, last_error, updated_at,
    service_item_id)
  values (p_org, p_realm, p_company, p_environment, 'connected', v_access, v_refresh, p_access_expires, p_refresh_expires,
    p_user, now(), null, now(), null)
  on conflict (organization_id) do update set
    realm_id = excluded.realm_id,
    company_name = coalesce(excluded.company_name, c.company_name),
    environment = excluded.environment,
    status = 'connected',
    access_token_secret_id = excluded.access_token_secret_id,
    refresh_token_secret_id = excluded.refresh_token_secret_id,
    access_token_expires_at = excluded.access_token_expires_at,
    refresh_token_expires_at = excluded.refresh_token_expires_at,
    connected_by = coalesce(excluded.connected_by, c.connected_by),
    -- A different QuickBooks company means old record links no longer apply.
    service_item_id = case when c.realm_id = excluded.realm_id then c.service_item_id else null end,
    last_error = null,
    updated_at = now();

  if v_old.realm_id is not null and v_old.realm_id <> p_realm then
    delete from public.quickbooks_sync_links where organization_id = p_org;
  end if;
end;
$$;

create or replace function public.qbo_get_tokens(p_org uuid)
returns table(realm_id text, environment text, access_token text, refresh_token text,
  access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, service_item_id text, status text)
language sql
security definer
set search_path to ''
as $$
  select c.realm_id, c.environment,
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.access_token_secret_id),
    (select s.decrypted_secret from vault.decrypted_secrets s where s.id = c.refresh_token_secret_id),
    c.access_token_expires_at, c.refresh_token_expires_at, c.service_item_id, c.status
  from public.quickbooks_connections c where c.organization_id = p_org
$$;

create or replace function public.qbo_disconnect(p_org uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare v public.quickbooks_connections;
begin
  delete from public.quickbooks_connections where organization_id = p_org returning * into v;
  if v.access_token_secret_id is not null then delete from vault.secrets where id = v.access_token_secret_id; end if;
  if v.refresh_token_secret_id is not null then delete from vault.secrets where id = v.refresh_token_secret_id; end if;
  delete from public.quickbooks_sync_links where organization_id = p_org;
end;
$$;

revoke all on function public.qbo_save_connection(uuid, text, text, text, text, text, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.qbo_get_tokens(uuid) from public, anon, authenticated;
revoke all on function public.qbo_disconnect(uuid) from public, anon, authenticated;
grant execute on function public.qbo_save_connection(uuid, text, text, text, text, text, timestamptz, timestamptz, uuid) to service_role;
grant execute on function public.qbo_get_tokens(uuid) to service_role;
grant execute on function public.qbo_disconnect(uuid) to service_role;
grant select, insert, update, delete on public.quickbooks_connections, public.quickbooks_sync_links to service_role;
