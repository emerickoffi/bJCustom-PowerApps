-- Interruption-safe saves for daily logs, change orders and estimate headers.
--
-- Why a new structure: none of the three tables records which client operation produced a write.
-- Daily logs are protected from duplicate creates by unique (project_id, log_date), but change orders
-- and estimates are not, and a retried update after a lost response looks like a stale-version conflict.
-- Adding columns to those tables would bump `version`, fire audit triggers and trip write guards, so the
-- ledger lives in its own table and is written in the same transaction as the record.
--
-- Additive only: one table, wrapper RPCs that call the existing save functions unchanged, no data changes.
-- Retention: ledger rows are only needed while a client may still retry; rows older than 30 days may be
-- purged with: delete from public.client_save_requests where created_at < now() - interval '30 days';

create table public.client_save_requests (
  user_id uuid not null,
  request_id uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('daily_log', 'change_order', 'estimate')),
  record_id uuid not null,
  payload_hash text not null check (char_length(payload_hash) between 16 and 128),
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
create index client_save_requests_created_idx on public.client_save_requests (created_at);

alter table public.client_save_requests enable row level security;
create policy client_save_requests_select on public.client_save_requests for select to authenticated
  using (user_id = auth.uid() and public.is_org_member(organization_id));
create policy client_save_requests_insert on public.client_save_requests for insert to authenticated
  with check (user_id = auth.uid() and public.is_org_member(organization_id));
revoke update, delete on public.client_save_requests from authenticated, anon;

-- Serialises concurrent attempts with the same id (e.g. two tabs) and returns the committed record when
-- the identical payload was already saved. A different payload under the same id is refused.
create or replace function public.claim_save_request(p_request uuid, p_kind text, p_hash text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  r public.client_save_requests;
begin
  if p_request is null or auth.uid() is null then raise exception 'A save request id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('save_request:' || auth.uid()::text || ':' || p_request::text, 0));
  select * into r from public.client_save_requests x where x.user_id = auth.uid() and x.request_id = p_request;
  if r.request_id is null then return null; end if;
  if r.kind <> p_kind or r.payload_hash <> p_hash then
    raise exception 'This save was already used for different data. Press Save again.';
  end if;
  return r.record_id;
end;
$$;
revoke execute on function public.claim_save_request(uuid, text, text) from public, anon;
grant execute on function public.claim_save_request(uuid, text, text) to authenticated;

-- ============ DAILY LOGS ============
create or replace function public.save_daily_log_tracked(
  p_request uuid, p_hash text,
  p_project uuid, p_id uuid, p_expected_version integer, p_header jsonb, p_crews jsonb, p_activity_ids uuid[])
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  v_id := public.claim_save_request(p_request, 'daily_log', p_hash);
  if v_id is not null then return v_id; end if;
  v_id := public.save_daily_log(p_project, p_id, p_expected_version, p_header, p_crews, p_activity_ids);
  insert into public.client_save_requests (user_id, request_id, organization_id, kind, record_id, payload_hash)
  select auth.uid(), p_request, p.organization_id, 'daily_log', v_id, p_hash from public.projects p where p.id = p_project;
  return v_id;
end;
$$;
revoke execute on function public.save_daily_log_tracked(uuid, text, uuid, uuid, integer, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.save_daily_log_tracked(uuid, text, uuid, uuid, integer, jsonb, jsonb, uuid[]) to authenticated;

-- ============ CHANGE ORDERS ============
-- Adds the missing edit conflict check: an edit names the updated_at it loaded.
create or replace function public.save_change_order_tracked(
  p_request uuid, p_hash text, p_project uuid, p_id uuid, p_expected_updated_at timestamptz, p_header jsonb, p_lines jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_updated timestamptz;
begin
  v_id := public.claim_save_request(p_request, 'change_order', p_hash);
  if v_id is not null then return v_id; end if;
  if p_id is not null and p_expected_updated_at is not null then
    select c.updated_at into v_updated from public.change_orders c where c.id = p_id and c.project_id = p_project for update;
    if v_updated is not null and v_updated <> p_expected_updated_at then
      raise exception 'This change order was changed by someone else. Reload to see the latest version.';
    end if;
  end if;
  v_id := public.save_change_order(p_project, p_id, p_header, p_lines);
  insert into public.client_save_requests (user_id, request_id, organization_id, kind, record_id, payload_hash)
  select auth.uid(), p_request, p.organization_id, 'change_order', v_id, p_hash from public.projects p where p.id = p_project;
  return v_id;
end;
$$;
revoke execute on function public.save_change_order_tracked(uuid, text, uuid, uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.save_change_order_tracked(uuid, text, uuid, uuid, timestamptz, jsonb, jsonb) to authenticated;

-- ============ ESTIMATE HEADERS ============
-- Same columns the existing create/update actions write. RLS and estimates_before_write still apply.
create or replace function public.save_estimate_tracked(
  p_request uuid, p_hash text, p_project uuid, p_id uuid, p_expected_updated_at timestamptz, p_fields jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_org uuid;
  v_updated timestamptz;
begin
  v_id := public.claim_save_request(p_request, 'estimate', p_hash);
  if v_id is not null then return v_id; end if;

  if p_id is null then
    select p.organization_id into v_org from public.projects p where p.id = p_project;
    if v_org is null or not public.is_org_manager(v_org) then raise exception 'Project not found or access denied'; end if;
    insert into public.estimates (organization_id, project_id, name, description, estimate_date, expiration_date,
      markup_percent, contingency_percent, land_cost_cents, notes, is_demo, created_by, updated_by)
    values (v_org, p_project, p_fields->>'name', p_fields->>'description', (p_fields->>'estimate_date')::date,
      (p_fields->>'expiration_date')::date, (p_fields->>'markup_percent')::numeric, (p_fields->>'contingency_percent')::numeric,
      (p_fields->>'land_cost_cents')::bigint, p_fields->>'notes', coalesce((p_fields->>'is_demo')::boolean, false), auth.uid(), auth.uid())
    returning id into v_id;
  else
    select e.organization_id, e.updated_at into v_org, v_updated from public.estimates e where e.id = p_id for update;
    if v_org is null or not public.is_org_manager(v_org) then raise exception 'Estimate not found or access denied'; end if;
    if p_expected_updated_at is not null and v_updated <> p_expected_updated_at then
      raise exception 'This estimate was changed by someone else. Reload to see the latest version.';
    end if;
    update public.estimates e set
      name = p_fields->>'name', description = p_fields->>'description',
      estimate_date = (p_fields->>'estimate_date')::date, expiration_date = (p_fields->>'expiration_date')::date,
      markup_percent = (p_fields->>'markup_percent')::numeric, contingency_percent = (p_fields->>'contingency_percent')::numeric,
      land_cost_cents = (p_fields->>'land_cost_cents')::bigint, notes = p_fields->>'notes',
      is_demo = coalesce((p_fields->>'is_demo')::boolean, false), updated_by = auth.uid()
    where e.id = p_id;
    v_id := p_id;
  end if;

  insert into public.client_save_requests (user_id, request_id, organization_id, kind, record_id, payload_hash)
  values (auth.uid(), p_request, v_org, 'estimate', v_id, p_hash);
  return v_id;
end;
$$;
revoke execute on function public.save_estimate_tracked(uuid, text, uuid, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.save_estimate_tracked(uuid, text, uuid, uuid, timestamptz, jsonb) to authenticated;
