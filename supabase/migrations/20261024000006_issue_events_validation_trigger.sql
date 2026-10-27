create or replace function public.record_issue_events()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, to_value)
      values (new.organization_id, new.id, 'reported', coalesce(v_actor, new.reported_by), new.status::text);
    return new;
  end if;

  if new.homeowner_validation in ('accepted', 'rejected')
     and (new.homeowner_validation is distinct from old.homeowner_validation
          or new.homeowner_validated_at is distinct from old.homeowner_validated_at) then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, details)
      values (new.organization_id, new.id,
              case when new.homeowner_validation = 'accepted' then 'homeowner_accepted' else 'homeowner_rejected' end,
              v_actor, new.homeowner_validation_note);
  end if;
  if new.builder_approved_at is distinct from old.builder_approved_at and new.builder_approved_at is not null then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id)
      values (new.organization_id, new.id, 'builder_approved', v_actor);
  end if;
  if new.status is distinct from old.status then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value)
      values (new.organization_id, new.id, 'status_changed', v_actor, old.status::text, new.status::text);
  end if;
  if new.responsible_user_id is distinct from old.responsible_user_id then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value)
      values (new.organization_id, new.id, 'assigned', v_actor, old.responsible_user_id::text, new.responsible_user_id::text);
  end if;
  if new.corrective_action is distinct from old.corrective_action and new.corrective_action is not null then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, details)
      values (new.organization_id, new.id, 'repair_recorded', v_actor, new.corrective_action);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value)
      values (new.organization_id, new.id, 'priority_changed', v_actor, old.priority, new.priority);
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, from_value, to_value)
      values (new.organization_id, new.id, 'due_date_changed', v_actor, old.due_date::text, new.due_date::text);
  end if;
  return new;
end;
$$;
