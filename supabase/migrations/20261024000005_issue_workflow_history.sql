alter table public.project_issues
  add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  add column if not exists due_date date;

create table if not exists public.project_issue_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  issue_id uuid not null references public.project_issues(id) on delete restrict,
  event_type text not null check (event_type in (
    'reported', 'status_changed', 'assigned', 'repair_recorded', 'priority_changed',
    'due_date_changed', 'builder_approved', 'homeowner_accepted', 'homeowner_rejected', 'repair_photo_added'
  )),
  actor_id uuid references auth.users(id) on delete set null,
  from_value text,
  to_value text,
  details text,
  created_at timestamptz not null default now()
);
create index if not exists project_issue_events_issue_idx on public.project_issue_events (issue_id, created_at);

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

  if new.homeowner_validated_at is distinct from old.homeowner_validated_at and new.homeowner_validated_at is not null then
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

drop trigger if exists project_issues_events on public.project_issues;
create trigger project_issues_events after insert or update on public.project_issues
  for each row execute function public.record_issue_events();

create or replace function public.record_repair_photo_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.attachment_kind = 'repair' then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, details)
      values (new.organization_id, new.issue_id, 'repair_photo_added', coalesce(auth.uid(), new.uploaded_by), new.file_name);
  end if;
  return new;
end;
$$;

drop trigger if exists issue_attachments_events on public.issue_attachments;
create trigger issue_attachments_events after insert on public.issue_attachments
  for each row execute function public.record_repair_photo_event();

drop trigger if exists project_issue_events_no_change on public.project_issue_events;
create trigger project_issue_events_no_change before update or delete on public.project_issue_events
  for each row execute function public.block_delete();

insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, to_value, created_at)
select pi.organization_id, pi.id, 'reported', pi.reported_by, 'open', pi.reported_at
from public.project_issues pi
where not exists (select 1 from public.project_issue_events e where e.issue_id = pi.id and e.event_type = 'reported');

alter table public.project_issue_events enable row level security;

drop policy if exists project_issue_events_select on public.project_issue_events;
create policy project_issue_events_select on public.project_issue_events for select to authenticated
  using (exists (
    select 1 from public.project_issues pi
    where pi.id = issue_id
      and (public.can_view_project_internal(pi.project_id) or public.is_project_homeowner(pi.project_id))
  ));
