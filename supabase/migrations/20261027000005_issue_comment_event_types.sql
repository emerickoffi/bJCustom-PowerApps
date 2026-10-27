alter table public.project_issue_events drop constraint if exists project_issue_events_event_type_check;
alter table public.project_issue_events add constraint project_issue_events_event_type_check check (event_type in (
  'reported', 'status_changed', 'assigned', 'repair_recorded', 'priority_changed', 'due_date_changed',
  'builder_approved', 'homeowner_accepted', 'homeowner_rejected', 'repair_photo_added',
  'builder_reply', 'homeowner_comment'));
