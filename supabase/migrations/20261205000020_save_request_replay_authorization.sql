-- Follow-up to 20261128000010_save_request_idempotency.sql. Apply after it, in the same window.
--
-- claim_save_request returned the recorded id for a replayed request without re-checking that the caller
-- may still see that record. A replay now succeeds only if the record is visible under the caller's current
-- row-level security (same rules the original save used). Revoked or downgraded users get an access error.
-- Signature, ledger table and tracked wrappers are unchanged. Re-running this file is safe.

create or replace function public.claim_save_request(p_request uuid, p_kind text, p_hash text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  r public.client_save_requests;
  v_visible boolean;
begin
  if p_request is null or auth.uid() is null then raise exception 'A save request id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('save_request:' || auth.uid()::text || ':' || p_request::text, 0));
  select * into r from public.client_save_requests x where x.user_id = auth.uid() and x.request_id = p_request;
  if r.request_id is null then return null; end if;
  if r.kind <> p_kind or r.payload_hash <> p_hash then
    raise exception 'This save was already used for different data. Press Save again.';
  end if;

  v_visible := case r.kind
    when 'estimate' then exists (select 1 from public.estimates e where e.id = r.record_id)
    when 'change_order' then exists (select 1 from public.change_orders c where c.id = r.record_id)
    when 'daily_log' then exists (select 1 from public.daily_logs d where d.id = r.record_id)
    else false end;
  if not v_visible then raise exception 'Record not found or access denied'; end if;
  return r.record_id;
end;
$$;
revoke execute on function public.claim_save_request(uuid, text, text) from public, anon;
grant execute on function public.claim_save_request(uuid, text, text) to authenticated;
