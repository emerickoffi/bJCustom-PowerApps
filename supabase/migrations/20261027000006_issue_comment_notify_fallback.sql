-- Homeowner comments notify org admins when the issue has no assignee and the project has no PM.
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
    from (
      select v.responsible_user_id as uid union select v.project_manager_id
      union
      select m.user_id from public.organization_memberships m
      where v.responsible_user_id is null and v.project_manager_id is null
        and m.organization_id = new.organization_id and m.status = 'active' and m.role = 'org_admin'
    ) r
    where r.uid is not null;
  end if;
  return new;
end;
$$;
