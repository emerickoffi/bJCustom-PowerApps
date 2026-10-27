-- Shared issue conversation between builder and homeowner, built on the existing
-- project_issue_notes table. Existing notes stay internal (staff only).

alter table public.project_issue_notes
  add column if not exists visibility text not null default 'internal';
alter table public.project_issue_notes drop constraint if exists project_issue_notes_visibility_check;
alter table public.project_issue_notes add constraint project_issue_notes_visibility_check
  check (visibility in ('internal', 'shared'));
alter table public.project_issue_notes drop constraint if exists project_issue_notes_body_check;
alter table public.project_issue_notes add constraint project_issue_notes_body_check
  check (char_length(btrim(body)) between 1 and 5000);

drop policy if exists project_issue_notes_homeowner_select on public.project_issue_notes;
create policy project_issue_notes_homeowner_select on public.project_issue_notes
  for select to authenticated using (
    visibility = 'shared' and exists (
      select 1 from public.project_issues pi
      where pi.id = project_issue_notes.issue_id and public.is_project_homeowner(pi.project_id)));

drop policy if exists project_issue_notes_homeowner_insert on public.project_issue_notes;
create policy project_issue_notes_homeowner_insert on public.project_issue_notes
  for insert to authenticated with check (
    visibility = 'shared' and created_by = auth.uid() and exists (
      select 1 from public.project_issues pi
      where pi.id = project_issue_notes.issue_id
        and pi.organization_id = project_issue_notes.organization_id
        and pi.status <> 'closed'
        and public.is_project_homeowner(pi.project_id)
        and public.portal_contact_can(pi.project_id, 'validate_issues')));

-- Homeowner photos attached to a shared comment.
alter table public.issue_attachments
  add column if not exists note_id uuid references public.project_issue_notes(id);
create index if not exists issue_attachments_note_idx on public.issue_attachments (note_id) where note_id is not null;
alter table public.issue_attachments drop constraint if exists issue_attachments_attachment_kind_check;
alter table public.issue_attachments add constraint issue_attachments_attachment_kind_check
  check (attachment_kind in ('original', 'repair', 'feedback'));

drop policy if exists issue_attachments_homeowner_feedback_insert on public.issue_attachments;
create policy issue_attachments_homeowner_feedback_insert on public.issue_attachments
  for insert to authenticated with check (
    attachment_kind = 'feedback' and uploaded_by = auth.uid() and note_id is not null
    and exists (
      select 1 from public.project_issue_notes n
      join public.project_issues pi on pi.id = n.issue_id
      where n.id = issue_attachments.note_id and n.issue_id = issue_attachments.issue_id
        and n.created_by = auth.uid() and n.visibility = 'shared'
        and pi.status <> 'closed' and public.is_project_homeowner(pi.project_id)));

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
  return new;
end;
$$;

create or replace function public.can_upload_media_path(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w
      join public.walkthrough_items i on i.walkthrough_id = w.id and i.id = public.media_path_uuid(p_path, 3)
      where w.id = public.media_path_uuid(p_path, 2)
        and w.status <> 'submitted'
        and public.is_project_homeowner(w.project_id)
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and pi.status <> 'closed'
        and (public.can_view_project_internal(pi.project_id)
          or (split_part(p_path, '/', 3) = 'feedback'
              and public.is_project_homeowner(pi.project_id)
              and public.portal_contact_can(pi.project_id, 'validate_issues')))
    )
    else false
  end;
$$;

-- In-app notifications for shared comments, in both directions.
create or replace function public.notify_issue_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v record; v_from_staff boolean;
begin
  if new.visibility <> 'shared' then return new; end if;
  select pi.*, p.project_number, p.project_manager_id into v
    from public.project_issues pi join public.projects p on p.id = pi.project_id
    where pi.id = new.issue_id;
  v_from_staff := exists (
    select 1 from public.organization_memberships m
    where m.user_id = new.created_by and m.organization_id = new.organization_id
      and m.status = 'active' and m.role <> 'client');

  insert into public.project_issue_events (organization_id, issue_id, event_type, actor_id, details)
    values (new.organization_id, new.issue_id,
            case when v_from_staff then 'builder_reply' else 'homeowner_comment' end,
            new.created_by, left(new.body, 200));

  if v_from_staff then
    insert into public.notifications (organization_id, user_id, title, body, link, project_id)
    select distinct new.organization_id, pa.user_id,
           'Your builder replied about ' || v.item_label,
           left(new.body, 200),
           case when v.walkthrough_id is not null then '/portal/walkthroughs/' || v.walkthrough_id::text else '/portal' end,
           v.project_id
    from public.portal_project_access a
    join public.portal_accounts pa on pa.id = a.portal_account_id
    left join public.client_contacts cc on cc.id = pa.contact_id
    where a.project_id = v.project_id and pa.user_id <> new.created_by
      and (cc.id is null or (cc.archived_at is null and cc.portal_enabled));
  else
    insert into public.notifications (organization_id, user_id, title, body, link, project_id)
    select new.organization_id, r.uid,
           'Homeowner comment on ' || v.project_number,
           v.category || ' · ' || v.item_label || ': ' || left(new.body, 160),
           '/projects/' || v.project_id::text || '/issues/' || v.id::text,
           v.project_id
    from (select v.responsible_user_id as uid union select v.project_manager_id) r
    where r.uid is not null;
  end if;
  return new;
end;
$$;
drop trigger if exists notify_issue_comment on public.project_issue_notes;
create trigger notify_issue_comment after insert on public.project_issue_notes
  for each row execute function public.notify_issue_comment();
