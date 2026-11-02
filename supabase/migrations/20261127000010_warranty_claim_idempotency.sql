-- Retry-safe warranty claim submission: a client-generated submission key makes the
-- claim insert idempotent per reporter, and a per-file client key prevents the same
-- selected attachment from being recorded twice when uploads are retried.

alter table public.warranty_claims add column if not exists submission_key uuid;
create unique index if not exists warranty_claims_submission_key_idx
  on public.warranty_claims (reported_by, submission_key)
  where submission_key is not null;

alter table public.warranty_claim_media add column if not exists client_key uuid;
create unique index if not exists warranty_claim_media_client_key_idx
  on public.warranty_claim_media (claim_id, client_key)
  where client_key is not null;

drop function if exists public.submit_warranty_claim(uuid, text, text, text, text, text);

create function public.submit_warranty_claim(
  p_project uuid,
  p_coverage_key text,
  p_category text,
  p_location text,
  p_title text,
  p_description text,
  p_submission_key uuid default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare w public.project_warranties; m public.warranty_milestones; c public.warranty_claims; v_staff boolean; v_existing uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  if p_submission_key is not null then
    select id into v_existing from public.warranty_claims
      where reported_by = auth.uid() and submission_key = p_submission_key and project_id = p_project;
    if v_existing is not null then return v_existing; end if;
  end if;

  select * into w from public.project_warranties where project_id = p_project;
  if w.id is null then raise exception 'This project does not have a warranty'; end if;
  if not public.is_feature_enabled(w.organization_id, 'warranty') then raise exception 'Warranty Management is turned off'; end if;
  v_staff := public.can_view_project_internal(p_project) and public.is_org_staff(w.organization_id);
  if not v_staff and not (public.is_feature_enabled(w.organization_id, 'portal') and public.is_project_homeowner(p_project)) then
    raise exception 'You do not have access to this project';
  end if;
  if w.stage = 'archived' then raise exception 'This warranty is archived. Contact your builder.'; end if;
  select * into m from public.warranty_milestones where warranty_id = w.id and coverage_key = p_coverage_key;
  if m.id is null then raise exception 'Choose a coverage period'; end if;
  if p_category is null or not (p_category = any(m.categories) or p_category = 'Other') then
    raise exception 'Choose a category listed under this coverage period';
  end if;

  insert into public.warranty_claims (organization_id, project_id, warranty_id, milestone_id, coverage_key, category,
      location, title, original_description, submitted_after_coverage, reported_by, reported_by_role, submission_key)
    values (w.organization_id, p_project, w.id, m.id, m.coverage_key, p_category, btrim(p_location), btrim(p_title),
            btrim(p_description), (m.reached_at is not null or m.due_on < public.org_today(w.organization_id)),
            auth.uid(), case when v_staff then 'staff' else 'homeowner' end, p_submission_key)
    returning * into c;
  insert into public.warranty_claim_events (organization_id, project_id, claim_id, event_type, to_status, actor_id, actor_role, note)
    values (c.organization_id, c.project_id, c.id, 'submitted', 'submitted', auth.uid(), c.reported_by_role,
            case when c.submitted_after_coverage then 'Submitted after this coverage period ended' end);
  perform public.notify_claim_staff(c, 'New warranty claim: ' || c.title,
    c.category || ' at ' || c.location || '. Review and record a coverage decision.', 'claim:' || c.id || ':submitted', true);
  perform public.refresh_warranty_stage(w.id);
  return c.id;
end;
$function$;

revoke all on function public.submit_warranty_claim(uuid, text, text, text, text, text, uuid) from public, anon;
grant execute on function public.submit_warranty_claim(uuid, text, text, text, text, text, uuid) to authenticated;
