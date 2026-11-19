-- RFIs connect to cost and schedule.
-- - Managers can record a question's expected cost impact (none / possible / yes) and schedule impact in days.
-- - "Create change order" turns an RFI into a draft change order prefilled from the question and its latest
--   answer, linked both ways (change_orders.rfi_id). Calling it again returns the existing, non-void change order.
-- Both go through security-definer functions like every other RFI write, with the same permission checks
-- (rfi_lock + rfi_can_manage) plus the change-order feature switch and manager role for the change order.

alter table public.project_rfis
  add column if not exists cost_impact text check (cost_impact is null or cost_impact in ('none', 'possible', 'yes')),
  add column if not exists schedule_impact_days integer check (schedule_impact_days is null or schedule_impact_days between 0 and 365);

alter table public.change_orders
  add column if not exists rfi_id uuid references public.project_rfis(id) on delete set null;
create index if not exists change_orders_rfi_id on public.change_orders (rfi_id) where rfi_id is not null;

alter table public.project_rfi_events drop constraint if exists project_rfi_events_event_type_check;
alter table public.project_rfi_events add constraint project_rfi_events_event_type_check
  check (event_type in ('created', 'sent', 'amended', 'reassigned', 'answered', 'closed', 'reopened', 'shared', 'unshared',
                        'attachment_added', 'impact_updated', 'change_order_created'));

create or replace function public.rfi_set_impact(p_rfi uuid, p_cost_impact text, p_schedule_days integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare r public.project_rfis;
begin
  r := public.rfi_lock(p_rfi);
  if not public.rfi_can_manage(r.organization_id, r.project_id) then
    raise exception 'Only an administrator or project manager can record cost and schedule impact.' using errcode = '42501';
  end if;
  if p_cost_impact is not null and p_cost_impact not in ('none', 'possible', 'yes') then
    raise exception 'Choose a cost impact: none, possible, or yes.';
  end if;
  if p_schedule_days is not null and (p_schedule_days < 0 or p_schedule_days > 365) then
    raise exception 'Schedule impact must be between 0 and 365 days.';
  end if;
  if r.cost_impact is not distinct from p_cost_impact and r.schedule_impact_days is not distinct from p_schedule_days then
    return public.rfi_result(r, true);
  end if;
  update public.project_rfis set cost_impact = p_cost_impact, schedule_impact_days = p_schedule_days
  where id = r.id returning * into r;
  perform public.rfi_log(r, 'impact_updated', r.status, r.status, null,
    jsonb_build_object('cost_impact', p_cost_impact, 'schedule_impact_days', p_schedule_days), null, true);
  return public.rfi_result(r);
end;
$$;

create or replace function public.create_change_order_from_rfi(p_rfi uuid)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  r public.project_rfis;
  v_co uuid;
  v_number integer;
  v_answer text;
  v_description text;
begin
  r := public.rfi_lock(p_rfi);
  if not public.rfi_can_manage(r.organization_id, r.project_id) or not public.is_org_manager(r.organization_id) then
    raise exception 'Only an administrator or project manager can create a change order.' using errcode = '42501';
  end if;
  if not public.is_feature_enabled(r.organization_id, 'change_orders') then
    raise exception 'Turn on Change orders in Feature management first.' using errcode = '42501';
  end if;
  if r.status = 'draft' then
    raise exception 'Send the question before creating a change order from it.';
  end if;

  select c.id into v_co from public.change_orders c
  where c.rfi_id = r.id and c.status <> 'void' order by c.created_at limit 1;
  if v_co is not null then return v_co; end if;

  select resp.body into v_answer from public.project_rfi_responses resp
  where resp.rfi_id = r.id order by resp.created_at desc limit 1;

  v_description := left(
    'From ' || public.rfi_ref(r) || '.' || E'\n\n' || 'Question: ' || coalesce(nullif(btrim(r.question), ''), r.subject)
    || case when v_answer is not null then E'\n\n' || 'Answer: ' || btrim(v_answer) else '' end,
    4000);

  v_co := public.save_change_order(r.project_id, null,
    jsonb_build_object(
      'title', left(public.rfi_ref(r) || ': ' || btrim(r.subject), 160),
      'description', v_description,
      'reason', 'RFI response',
      'requested_by', left(coalesce(nullif(btrim(r.responder_name), ''), r.created_by_name), 160),
      'schedule_impact_days', r.schedule_impact_days),
    '[]'::jsonb);
  update public.change_orders set rfi_id = r.id where id = v_co returning number into v_number;

  perform public.rfi_log(r, 'change_order_created', r.status, r.status, null,
    jsonb_build_object('change_order_id', v_co, 'change_order_number', v_number), null, true);
  return v_co;
end;
$$;

revoke all on function public.rfi_set_impact(uuid, text, integer) from public, anon;
revoke all on function public.create_change_order_from_rfi(uuid) from public, anon;
grant execute on function public.rfi_set_impact(uuid, text, integer) to authenticated;
grant execute on function public.create_change_order_from_rfi(uuid) to authenticated;
