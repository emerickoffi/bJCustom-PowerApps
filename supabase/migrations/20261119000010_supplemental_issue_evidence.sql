-- Supplemental issue evidence: staff-added photos documenting the original
-- issue after it was reported. Kept separate from the homeowner's original
-- evidence (immutable) and from after-repair photos.

alter table public.issue_attachments drop constraint if exists issue_attachments_attachment_kind_check;
alter table public.issue_attachments add constraint issue_attachments_attachment_kind_check
  check (attachment_kind in ('original', 'supplemental', 'repair', 'feedback'));

drop policy if exists issue_attachments_staff_supplemental_insert on public.issue_attachments;
create policy issue_attachments_staff_supplemental_insert on public.issue_attachments
  for insert to authenticated with check (
    attachment_kind = 'supplemental' and uploaded_by = auth.uid() and note_id is null
    and exists (
      select 1 from public.project_issues pi
      where pi.id = issue_attachments.issue_id
        and pi.organization_id = issue_attachments.organization_id
        and pi.status <> 'closed'
        and public.can_view_project_internal(pi.project_id)));

create or replace function public.guard_issue_attachment_paths()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.project_issues pi where pi.id = new.issue_id and pi.organization_id = new.organization_id) then
    raise exception 'Issue does not belong to this organization';
  end if;
  if new.attachment_kind = 'repair' and new.storage_path not like ('issues/' || new.issue_id::text || '/%') then
    raise exception 'Invalid repair photo path';
  end if;
  if new.attachment_kind = 'feedback' and new.storage_path not like ('issues/' || new.issue_id::text || '/feedback/%') then
    raise exception 'Invalid photo path';
  end if;
  if new.attachment_kind = 'supplemental' and new.storage_path not like ('issues/' || new.issue_id::text || '/supplemental/%') then
    raise exception 'Invalid supplemental photo path';
  end if;
  return new;
end;
$$;

alter table public.project_issue_events drop constraint if exists project_issue_events_event_type_check;
alter table public.project_issue_events add constraint project_issue_events_event_type_check check (event_type in (
  'reported', 'status_changed', 'assigned', 'repair_recorded', 'priority_changed', 'due_date_changed',
  'builder_approved', 'homeowner_accepted', 'homeowner_rejected', 'repair_photo_added',
  'builder_reply', 'homeowner_comment', 'evidence_photo_added'));

create or replace function public.record_repair_photo_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.attachment_kind = 'repair' then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, details)
      values (new.organization_id, new.issue_id, 'repair_photo_added', coalesce(auth.uid(), new.uploaded_by), new.file_name);
  elsif new.attachment_kind = 'supplemental' then
    insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, details)
      values (new.organization_id, new.issue_id, 'evidence_photo_added', coalesce(auth.uid(), new.uploaded_by), new.file_name);
  end if;
  return new;
end;
$$;
