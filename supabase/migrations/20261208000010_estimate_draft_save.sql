-- Unified "Save draft" for the estimate editor: line items, pricing settings, land cost, description and
-- notes commit in one transaction, so a failure in any part rolls back the whole save.
--
-- Reuses the existing safeguards instead of replacing them:
--   * claim_save_request / client_save_requests: a retried request (same id + payload hash) returns the
--     recorded estimate id without re-applying anything, so lost responses never duplicate line items.
--   * save_estimate_line_items: manager check, draft/internal-review lock, stale-stamp check, item limits.
--   * Runs as the caller (security invoker), so RLS and the estimate/line-item guard triggers still apply.
-- Additive only. Depends on 20261117000010, 20261128000010 and 20261205000020. Re-running this file is safe.

create or replace function public.save_estimate_draft_tracked(
  p_request uuid,
  p_hash text,
  p_estimate uuid,
  p_expected_updated_at timestamptz,
  p_items jsonb,
  p_settings jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_est record;
begin
  v_id := public.claim_save_request(p_request, 'estimate', p_hash);
  if v_id is not null then return v_id; end if;

  if p_expected_updated_at is null then
    raise exception 'A save stamp is required. Reload the page and try again.';
  end if;
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Invalid pricing settings';
  end if;

  select e.id, e.organization_id, e.status, e.family_id, e.revision, e.updated_at
    into v_est
    from public.estimates e
   where e.id = p_estimate
   for update;
  if v_est.id is null or not public.is_org_manager(v_est.organization_id) then
    raise exception 'Estimate not found or access denied';
  end if;
  if exists (
    select 1 from public.estimates f where f.family_id = v_est.family_id and f.revision > v_est.revision
  ) then
    raise exception 'This is an older revision. Open the latest revision to make changes.';
  end if;
  if v_est.status not in ('draft', 'internal_review') then
    raise exception 'This estimate is locked because it is %. Create a revision to make changes.',
      replace(v_est.status, '_', ' ');
  end if;
  if v_est.updated_at <> p_expected_updated_at then
    raise exception 'This estimate was changed by someone else since you opened it. Reload to see the latest version, then reapply your edits.';
  end if;

  perform public.save_estimate_line_items(p_estimate, p_items, p_expected_updated_at);

  update public.estimates e
     set description = p_settings->>'description',
         markup_percent = (p_settings->>'markup_percent')::numeric,
         contingency_percent = (p_settings->>'contingency_percent')::numeric,
         land_cost_cents = (p_settings->>'land_cost_cents')::bigint,
         notes = p_settings->>'notes',
         updated_by = auth.uid()
   where e.id = p_estimate;

  insert into public.client_save_requests (user_id, request_id, organization_id, kind, record_id, payload_hash)
  values (auth.uid(), p_request, v_est.organization_id, 'estimate', p_estimate, p_hash);
  return p_estimate;
end;
$$;

revoke execute on function public.save_estimate_draft_tracked(uuid, text, uuid, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.save_estimate_draft_tracked(uuid, text, uuid, timestamptz, jsonb, jsonb) to authenticated;
