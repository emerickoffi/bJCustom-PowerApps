-- Assistant outcome tracking (audit findings F6/F9).
--
-- Every attempt already inserts one ai_assistant_requests row before generation; that row is the attempt
-- counter used by the rate limits and stays that way (failed attempts still count, so abuse controls are
-- not weakened). This adds the correlation id and the outcome of the attempt so a reference such as
-- 287e47a5 can be traced without relying on log retention.
--
-- No prompt, answer or document content is stored: only timings, a safe error category and token counts.
-- Completion is written once through complete_ai_assistant_request by the user who made the attempt.
-- Retention follows the existing table (no change). Re-running this file is safe.

alter table public.ai_assistant_requests
  add column if not exists request_ref uuid,
  add column if not exists outcome text not null default 'pending',
  add column if not exists error_category text,
  add column if not exists completed_at timestamptz,
  add column if not exists duration_ms integer,
  add column if not exists input_tokens integer,
  add column if not exists output_tokens integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_assistant_requests_outcome_check'
                   and conrelid = 'public.ai_assistant_requests'::regclass) then
    alter table public.ai_assistant_requests add constraint ai_assistant_requests_outcome_check
      check (outcome in ('pending', 'success', 'failure', 'timeout'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_assistant_requests_error_category_check'
                   and conrelid = 'public.ai_assistant_requests'::regclass) then
    alter table public.ai_assistant_requests add constraint ai_assistant_requests_error_category_check
      check (error_category is null or error_category in ('timeout', 'provider_error', 'empty_answer', 'context_error', 'internal'));
  end if;
end $$;

create unique index if not exists ai_assistant_requests_ref_uidx
  on public.ai_assistant_requests (request_ref) where request_ref is not null;

-- Rows are append-only for users; outcome columns change only through this function, once.
revoke update, delete, truncate on public.ai_assistant_requests from authenticated, anon;

create or replace function public.complete_ai_assistant_request(
  p_ref uuid, p_outcome text, p_error_category text, p_duration_ms integer, p_input_tokens integer, p_output_tokens integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_ref is null then return; end if;
  if p_outcome not in ('success', 'failure', 'timeout') then raise exception 'Invalid outcome'; end if;
  update public.ai_assistant_requests set
    outcome = p_outcome,
    error_category = case when p_outcome = 'success' then null else p_error_category end,
    completed_at = now(),
    duration_ms = greatest(0, least(coalesce(p_duration_ms, 0), 3600000)),
    input_tokens = case when p_input_tokens >= 0 then p_input_tokens end,
    output_tokens = case when p_output_tokens >= 0 then p_output_tokens end
  where request_ref = p_ref and user_id = auth.uid() and outcome = 'pending';
end;
$$;
revoke execute on function public.complete_ai_assistant_request(uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.complete_ai_assistant_request(uuid, text, text, integer, integer, integer) to authenticated;
