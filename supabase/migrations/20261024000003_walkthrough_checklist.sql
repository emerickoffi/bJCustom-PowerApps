-- Homeowner Walkthrough & Inspection Checklist with issue descriptions, attachments, and linked project issues.
-- Draft notes live in walkthrough_responses (editable until submission).
-- Submitted descriptions are copied verbatim into project_issues.homeowner_description (immutable).

create type public.walkthrough_status as enum ('draft', 'in_progress', 'submitted');
create type public.walkthrough_response_value as enum ('satisfactory', 'needs_attention', 'not_applicable');
create type public.issue_status as enum ('open', 'in_progress', 'resolved', 'closed');
create type public.homeowner_validation_status as enum ('pending', 'accepted', 'rejected');

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
create or replace function public.is_project_homeowner(p_project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.projects p
    join public.project_clients pc on pc.project_id = p.id
    join public.clients c on c.id = pc.client_id
    where p.id = p_project
      and p.archived_at is null
      and c.portal_user_id = auth.uid()
      and public.is_org_member(p.organization_id)
  );
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.walkthroughs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  title text not null check (char_length(title) between 2 and 160),
  walkthrough_type text not null default 'final'
    check (walkthrough_type in ('orientation', 'final', 'warranty_30', 'warranty_11', 'other')),
  scheduled_date date,
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  status public.walkthrough_status not null default 'draft',
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index walkthroughs_project_idx on public.walkthroughs (project_id, created_at desc);
create trigger walkthroughs_updated_at before update on public.walkthroughs
  for each row execute function public.set_updated_at();

create table public.walkthrough_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  walkthrough_id uuid not null references public.walkthroughs(id) on delete restrict,
  category text not null check (char_length(category) between 1 and 80),
  label text not null check (char_length(label) between 1 and 160),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (walkthrough_id, category, label)
);
create index walkthrough_items_walkthrough_idx on public.walkthrough_items (walkthrough_id, sort_order);

create table public.walkthrough_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  walkthrough_id uuid not null references public.walkthroughs(id) on delete restrict,
  item_id uuid not null unique references public.walkthrough_items(id) on delete restrict,
  response public.walkthrough_response_value,
  draft_description text check (draft_description is null or char_length(draft_description) <= 5000),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index walkthrough_responses_walkthrough_idx on public.walkthrough_responses (walkthrough_id);
create trigger walkthrough_responses_updated_at before update on public.walkthrough_responses
  for each row execute function public.set_updated_at();

create table public.walkthrough_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  walkthrough_id uuid not null references public.walkthroughs(id) on delete restrict,
  item_id uuid not null references public.walkthrough_items(id) on delete restrict,
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type ~ '^(image|video)/'),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  media_kind text not null check (media_kind in ('photo', 'video')),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index walkthrough_attachments_item_idx on public.walkthrough_attachments (item_id);

create table public.project_issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  walkthrough_id uuid not null references public.walkthroughs(id) on delete restrict,
  item_id uuid not null unique references public.walkthrough_items(id) on delete restrict,
  category text not null,
  item_label text not null,
  homeowner_description text not null check (char_length(btrim(homeowner_description)) > 0),
  reported_by uuid not null references auth.users(id) on delete restrict,
  reported_at timestamptz not null default now(),
  status public.issue_status not null default 'open',
  responsible_user_id uuid references auth.users(id) on delete set null,
  corrective_action text check (corrective_action is null or char_length(corrective_action) <= 5000),
  builder_approved_by uuid references auth.users(id) on delete set null,
  builder_approved_at timestamptz,
  homeowner_validation public.homeowner_validation_status not null default 'pending',
  homeowner_validation_note text check (homeowner_validation_note is null or char_length(homeowner_validation_note) <= 2000),
  homeowner_validated_by uuid references auth.users(id) on delete set null,
  homeowner_validated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index project_issues_project_idx on public.project_issues (project_id, reported_at desc);
create index project_issues_walkthrough_idx on public.project_issues (walkthrough_id);
create index project_issues_responsible_idx on public.project_issues (responsible_user_id);
create trigger project_issues_updated_at before update on public.project_issues
  for each row execute function public.set_updated_at();

create table public.issue_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  issue_id uuid not null references public.project_issues(id) on delete restrict,
  attachment_kind text not null check (attachment_kind in ('original', 'repair')),
  storage_path text not null,
  file_name text not null,
  mime_type text not null check (mime_type ~ '^(image|video)/'),
  size_bytes bigint not null check (size_bytes > 0),
  media_kind text not null check (media_kind in ('photo', 'video')),
  uploaded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (issue_id, storage_path)
);
create index issue_attachments_issue_idx on public.issue_attachments (issue_id, attachment_kind);

create table public.project_issue_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  issue_id uuid not null references public.project_issues(id) on delete restrict,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index project_issue_notes_issue_idx on public.project_issue_notes (issue_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------
create or replace function public.validate_walkthrough_project()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.projects p where p.id = new.project_id and p.organization_id = new.organization_id) then
    raise exception 'Project does not belong to this organization';
  end if;
  return new;
end;
$$;
create trigger walkthroughs_validate before insert or update of project_id, organization_id on public.walkthroughs
  for each row execute function public.validate_walkthrough_project();

create or replace function public.validate_walkthrough_child()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.walkthroughs w where w.id = new.walkthrough_id and w.organization_id = new.organization_id) then
    raise exception 'Walkthrough does not belong to this organization';
  end if;
  if tg_table_name in ('walkthrough_attachments', 'walkthrough_responses') and not exists (
    select 1 from public.walkthrough_items i where i.id = new.item_id and i.walkthrough_id = new.walkthrough_id
  ) then
    raise exception 'Checklist item does not belong to this walkthrough';
  end if;
  return new;
end;
$$;
create trigger walkthrough_items_validate before insert or update on public.walkthrough_items
  for each row execute function public.validate_walkthrough_child();
create trigger walkthrough_responses_validate before insert or update on public.walkthrough_responses
  for each row execute function public.validate_walkthrough_child();
create trigger walkthrough_attachments_validate before insert or update on public.walkthrough_attachments
  for each row execute function public.validate_walkthrough_child();

-- Walkthrough status only moves to submitted through submit_walkthrough(); submitted walkthroughs are frozen.
create or replace function public.guard_walkthrough()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'submitted' and coalesce(current_setting('app.walkthrough_system', true), '') <> 'on' then
    raise exception 'A submitted walkthrough cannot be changed';
  end if;
  if new.status is distinct from old.status
     and coalesce(current_setting('app.walkthrough_system', true), '') <> 'on' then
    raise exception 'Walkthrough status is managed by the checklist workflow';
  end if;
  return new;
end;
$$;
create trigger walkthroughs_guard before update on public.walkthroughs
  for each row execute function public.guard_walkthrough();

create or replace function public.guard_issue_attachment_paths()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.project_issues pi where pi.id = new.issue_id and pi.organization_id = new.organization_id) then
    raise exception 'Issue does not belong to this organization';
  end if;
  if new.attachment_kind = 'repair' and new.storage_path not like ('issues/' || new.issue_id::text || '/%') then
    raise exception 'Invalid repair photo path';
  end if;
  return new;
end;
$$;
create trigger issue_attachments_validate before insert on public.issue_attachments
  for each row execute function public.guard_issue_attachment_paths();

-- The homeowner's original report is immutable. Approval and validation are workflow-controlled.
create or replace function public.guard_project_issue()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_system boolean := coalesce(current_setting('app.issue_homeowner_validation', true), '') = 'on';
begin
  if tg_op = 'DELETE' then
    raise exception 'Reported issues cannot be deleted';
  end if;

  if new.homeowner_description is distinct from old.homeowner_description
     or new.category is distinct from old.category
     or new.item_label is distinct from old.item_label
     or new.reported_by is distinct from old.reported_by
     or new.reported_at is distinct from old.reported_at
     or new.walkthrough_id is distinct from old.walkthrough_id
     or new.item_id is distinct from old.item_id
     or new.project_id is distinct from old.project_id
     or new.organization_id is distinct from old.organization_id then
    raise exception 'The homeowner''s original report cannot be modified';
  end if;

  if not v_system then
    if new.homeowner_validation is distinct from old.homeowner_validation
       or new.homeowner_validation_note is distinct from old.homeowner_validation_note
       or new.homeowner_validated_by is distinct from old.homeowner_validated_by
       or new.homeowner_validated_at is distinct from old.homeowner_validated_at then
      raise exception 'Only the homeowner can validate a repair';
    end if;
    if new.status = 'closed' and old.status <> 'closed' then
      raise exception 'Issues close when the homeowner confirms the repair';
    end if;
    if old.status = 'closed' then
      raise exception 'Closed issues cannot be changed';
    end if;

    if new.responsible_user_id is not null and new.responsible_user_id is distinct from old.responsible_user_id
       and not exists (
         select 1 from public.organization_memberships m
         where m.organization_id = new.organization_id and m.user_id = new.responsible_user_id
           and m.status = 'active' and m.role in ('org_admin', 'project_manager', 'builder_staff')
       ) then
      raise exception 'Responsible person must be active builder staff';
    end if;

    -- Leaving "resolved" withdraws any approval.
    if new.status <> 'resolved' then
      new.builder_approved_by := null;
      new.builder_approved_at := null;
    end if;

    if new.builder_approved_at is distinct from old.builder_approved_at and new.builder_approved_at is not null then
      if not public.is_org_manager(new.organization_id) then
        raise exception 'Only an administrator or project manager can approve a repair';
      end if;
      if new.status <> 'resolved' then
        raise exception 'Mark the repair complete before approving it';
      end if;
      new.builder_approved_by := auth.uid();
      new.builder_approved_at := now();
      new.homeowner_validation := 'pending';
    end if;
  end if;
  return new;
end;
$$;
create trigger project_issues_guard before update or delete on public.project_issues
  for each row execute function public.guard_project_issue();

create or replace function public.block_delete()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception '% records cannot be deleted', tg_table_name;
end;
$$;
create trigger issue_attachments_no_delete before delete on public.issue_attachments
  for each row execute function public.block_delete();
create trigger project_issue_notes_no_delete before delete on public.project_issue_notes
  for each row execute function public.block_delete();

create trigger audit_walkthroughs after insert or update on public.walkthroughs
  for each row execute function public.write_audit_event();
create trigger audit_project_issues after insert or update on public.project_issues
  for each row execute function public.write_audit_event();

-- ---------------------------------------------------------------------------
-- Workflow functions
-- ---------------------------------------------------------------------------
create or replace function public.create_walkthrough(
  p_project uuid,
  p_title text,
  p_type text,
  p_scheduled date,
  p_instructions text,
  p_items jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_org uuid;
  v_id uuid;
begin
  select p.organization_id into v_org from public.projects p where p.id = p_project;
  if v_org is null then raise exception 'Project not found or access denied'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'A walkthrough needs at least one checklist item';
  end if;

  insert into public.walkthroughs (organization_id, project_id, title, walkthrough_type, scheduled_date, instructions, created_by)
    values (v_org, p_project, btrim(p_title), p_type, p_scheduled, nullif(btrim(p_instructions), ''), auth.uid())
    returning id into v_id;

  insert into public.walkthrough_items (organization_id, walkthrough_id, category, label, sort_order)
    select v_org, v_id, btrim(x ->> 'category'), btrim(x ->> 'label'), (ord - 1)::integer
    from jsonb_array_elements(p_items) with ordinality as t(x, ord);

  return v_id;
end;
$$;

create or replace function public.save_walkthrough_response(
  p_item uuid,
  p_response public.walkthrough_response_value,
  p_description text
)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare
  v_item record;
  v_now timestamptz := now();
begin
  select i.id, i.organization_id, i.walkthrough_id, w.project_id, w.status
    into v_item
    from public.walkthrough_items i
    join public.walkthroughs w on w.id = i.walkthrough_id
    where i.id = p_item;
  if v_item.id is null or not public.is_project_homeowner(v_item.project_id) then
    raise exception 'Checklist item not found';
  end if;
  if v_item.status = 'submitted' then
    raise exception 'This walkthrough has already been submitted';
  end if;
  if p_description is not null and char_length(p_description) > 5000 then
    raise exception 'Issue descriptions are limited to 5,000 characters';
  end if;

  insert into public.walkthrough_responses (organization_id, walkthrough_id, item_id, response, draft_description, updated_by)
    values (v_item.organization_id, v_item.walkthrough_id, p_item, p_response, p_description, auth.uid())
    on conflict (item_id) do update
      set response = excluded.response,
          draft_description = excluded.draft_description,
          updated_by = excluded.updated_by;

  if v_item.status = 'draft' then
    perform set_config('app.walkthrough_system', 'on', true);
    update public.walkthroughs set status = 'in_progress' where id = v_item.walkthrough_id;
    perform set_config('app.walkthrough_system', '', true);
  end if;
  return v_now;
end;
$$;

create or replace function public.submit_walkthrough(p_walkthrough uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  w record;
  v_uid uuid := auth.uid();
  v_unanswered integer;
  v_missing_notes integer;
  v_created integer := 0;
  v_project record;
  v_link text;
begin
  select * into w from public.walkthroughs where id = p_walkthrough for update;
  if w.id is null or not public.is_project_homeowner(w.project_id) then
    raise exception 'Walkthrough not found';
  end if;
  if w.status = 'submitted' then
    return jsonb_build_object('already_submitted', true, 'issues_created', 0);
  end if;

  select count(*) into v_unanswered
    from public.walkthrough_items i
    left join public.walkthrough_responses r on r.item_id = i.id
    where i.walkthrough_id = w.id and r.response is null;
  if v_unanswered > 0 then
    raise exception 'Please respond to every checklist item before submitting (% remaining)', v_unanswered;
  end if;

  select count(*) into v_missing_notes
    from public.walkthrough_responses r
    where r.walkthrough_id = w.id and r.response = 'needs_attention'
      and coalesce(btrim(r.draft_description), '') = '';
  if v_missing_notes > 0 then
    raise exception 'Please describe the issue for every item marked Needs Attention (% missing)', v_missing_notes;
  end if;

  with inserted as (
    insert into public.project_issues (
      organization_id, project_id, walkthrough_id, item_id, category, item_label,
      homeowner_description, reported_by, reported_at
    )
    select w.organization_id, w.project_id, w.id, i.id, i.category, i.label,
           r.draft_description, v_uid, now()
    from public.walkthrough_responses r
    join public.walkthrough_items i on i.id = r.item_id
    where r.walkthrough_id = w.id and r.response = 'needs_attention'
    on conflict (item_id) do nothing
    returning id
  )
  select count(*) into v_created from inserted;

  insert into public.issue_attachments (
    organization_id, issue_id, attachment_kind, storage_path, file_name, mime_type, size_bytes, media_kind, uploaded_by, created_at
  )
  select a.organization_id, pi.id, 'original', a.storage_path, a.file_name, a.mime_type, a.size_bytes, a.media_kind, a.uploaded_by, a.created_at
  from public.walkthrough_attachments a
  join public.project_issues pi on pi.item_id = a.item_id
  where a.walkthrough_id = w.id
  on conflict (issue_id, storage_path) do nothing;

  perform set_config('app.walkthrough_system', 'on', true);
  update public.walkthroughs set status = 'submitted', submitted_by = v_uid, submitted_at = now() where id = w.id;
  perform set_config('app.walkthrough_system', '', true);

  select p.project_number, p.name, p.project_manager_id into v_project from public.projects p where p.id = w.project_id;
  v_link := '/projects/' || w.project_id::text || '/walkthroughs/' || w.id::text;

  insert into public.notifications (organization_id, user_id, title, body, link)
  select distinct w.organization_id, recipient, 
         case when v_created > 0
           then v_created || ' issue' || case when v_created = 1 then '' else 's' end || ' reported on ' || v_project.project_number
           else 'Walkthrough submitted for ' || v_project.project_number end,
         w.title || ' · ' || v_project.name,
         v_link
  from (
    select v_project.project_manager_id as recipient where v_project.project_manager_id is not null
    union
    select pm.user_id from public.project_members pm where pm.project_id = w.project_id and pm.project_role = 'project_manager'
    union
    select m.user_id from public.organization_memberships m
      where m.organization_id = w.organization_id and m.status = 'active' and m.role = 'org_admin'
        and v_project.project_manager_id is null
  ) recipients
  where recipient is not null
    and exists (
      select 1 from public.organization_memberships m
      where m.organization_id = w.organization_id and m.user_id = recipient and m.status = 'active'
        and m.role in ('org_admin', 'project_manager', 'builder_staff')
    );

  return jsonb_build_object('already_submitted', false, 'issues_created', v_created);
end;
$$;

create or replace function public.validate_issue_repair(p_issue uuid, p_accepted boolean, p_note text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  select pi.*, p.project_number into v
    from public.project_issues pi join public.projects p on p.id = pi.project_id
    where pi.id = p_issue for update of pi;
  if v.id is null or not public.is_project_homeowner(v.project_id) then
    raise exception 'Issue not found';
  end if;
  if v.status <> 'resolved' or v.builder_approved_at is null then
    raise exception 'This repair is not ready for your review yet';
  end if;
  if not p_accepted and coalesce(btrim(p_note), '') = '' then
    raise exception 'Please explain what still needs attention';
  end if;

  perform set_config('app.issue_homeowner_validation', 'on', true);
  update public.project_issues
    set homeowner_validation = case when p_accepted then 'accepted'::public.homeowner_validation_status else 'rejected'::public.homeowner_validation_status end,
        homeowner_validation_note = nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
        homeowner_validated_by = auth.uid(),
        homeowner_validated_at = now(),
        status = case when p_accepted then 'closed'::public.issue_status else 'in_progress'::public.issue_status end,
        builder_approved_by = case when p_accepted then builder_approved_by end,
        builder_approved_at = case when p_accepted then builder_approved_at end
    where id = p_issue;
  perform set_config('app.issue_homeowner_validation', '', true);

  insert into public.notifications (organization_id, user_id, title, body, link)
  select v.organization_id, r.uid,
         case when p_accepted then 'Homeowner confirmed repair on ' else 'Homeowner reopened issue on ' end || v.project_number,
         v.category || ' · ' || v.item_label,
         '/projects/' || v.project_id::text || '/issues/' || v.id::text
  from (
    select v.responsible_user_id as uid
    union select p.project_manager_id from public.projects p where p.id = v.project_id
  ) r
  where r.uid is not null;
end;
$$;

revoke execute on function public.create_walkthrough(uuid, text, text, date, text, jsonb) from public, anon;
revoke execute on function public.save_walkthrough_response(uuid, public.walkthrough_response_value, text) from public, anon;
revoke execute on function public.submit_walkthrough(uuid) from public, anon;
revoke execute on function public.validate_issue_repair(uuid, boolean, text) from public, anon;
grant execute on function public.create_walkthrough(uuid, text, text, date, text, jsonb) to authenticated;
grant execute on function public.save_walkthrough_response(uuid, public.walkthrough_response_value, text) to authenticated;
grant execute on function public.submit_walkthrough(uuid) to authenticated;
grant execute on function public.validate_issue_repair(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.walkthroughs enable row level security;
alter table public.walkthrough_items enable row level security;
alter table public.walkthrough_responses enable row level security;
alter table public.walkthrough_attachments enable row level security;
alter table public.project_issues enable row level security;
alter table public.issue_attachments enable row level security;
alter table public.project_issue_notes enable row level security;
alter table public.notifications enable row level security;

create policy walkthroughs_select on public.walkthroughs for select to authenticated
  using (public.can_view_project_internal(project_id) or public.is_project_homeowner(project_id));
create policy walkthroughs_insert on public.walkthroughs for insert to authenticated
  with check (public.is_org_manager(organization_id) and created_by = auth.uid() and status = 'draft');
create policy walkthroughs_update on public.walkthroughs for update to authenticated
  using (public.is_org_manager(organization_id)) with check (public.is_org_manager(organization_id));

create policy walkthrough_items_select on public.walkthrough_items for select to authenticated
  using (exists (
    select 1 from public.walkthroughs w where w.id = walkthrough_id
      and (public.can_view_project_internal(w.project_id) or public.is_project_homeowner(w.project_id))
  ));
create policy walkthrough_items_insert on public.walkthrough_items for insert to authenticated
  with check (public.is_org_manager(organization_id)
    and exists (select 1 from public.walkthroughs w where w.id = walkthrough_id and w.status = 'draft'));

create policy walkthrough_responses_select on public.walkthrough_responses for select to authenticated
  using (exists (
    select 1 from public.walkthroughs w where w.id = walkthrough_id
      and (public.can_view_project_internal(w.project_id) or public.is_project_homeowner(w.project_id))
  ));

create policy walkthrough_attachments_select on public.walkthrough_attachments for select to authenticated
  using (exists (
    select 1 from public.walkthroughs w where w.id = walkthrough_id
      and (public.can_view_project_internal(w.project_id) or public.is_project_homeowner(w.project_id))
  ));
create policy walkthrough_attachments_insert on public.walkthrough_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and storage_path like ('walkthroughs/' || walkthrough_id::text || '/' || item_id::text || '/%')
    and exists (
      select 1 from public.walkthroughs w where w.id = walkthrough_id
        and w.status <> 'submitted' and public.is_project_homeowner(w.project_id)
    )
  );
create policy walkthrough_attachments_delete on public.walkthrough_attachments for delete to authenticated
  using (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.walkthroughs w where w.id = walkthrough_id
        and w.status <> 'submitted' and public.is_project_homeowner(w.project_id)
    )
  );

create policy project_issues_select on public.project_issues for select to authenticated
  using (public.can_view_project_internal(project_id) or public.is_project_homeowner(project_id));
create policy project_issues_update on public.project_issues for update to authenticated
  using (public.can_view_project_internal(project_id)) with check (public.can_view_project_internal(project_id));

create policy issue_attachments_select on public.issue_attachments for select to authenticated
  using (exists (
    select 1 from public.project_issues pi where pi.id = issue_id
      and (public.can_view_project_internal(pi.project_id) or public.is_project_homeowner(pi.project_id))
  ));
create policy issue_attachments_insert on public.issue_attachments for insert to authenticated
  with check (
    attachment_kind = 'repair' and uploaded_by = auth.uid()
    and exists (select 1 from public.project_issues pi where pi.id = issue_id and public.can_view_project_internal(pi.project_id))
  );

create policy project_issue_notes_select on public.project_issue_notes for select to authenticated
  using (exists (select 1 from public.project_issues pi where pi.id = issue_id and public.can_view_project_internal(pi.project_id)));
create policy project_issue_notes_insert on public.project_issue_notes for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (select 1 from public.project_issues pi where pi.id = issue_id
                and pi.organization_id = project_issue_notes.organization_id
                and public.can_view_project_internal(pi.project_id))
  );

create policy notifications_select_own on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Private media storage
-- Paths: walkthroughs/{walkthrough_id}/{item_id}/{file}  |  issues/{issue_id}/{file}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-media', 'project-media', false, 52428800, array['image/*', 'video/*'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.media_path_uuid(p_path text, p_index integer)
returns uuid language sql immutable set search_path = '' as $$
  select case
    when split_part(p_path, '/', p_index) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then split_part(p_path, '/', p_index)::uuid
  end;
$$;

create or replace function public.can_view_media_path(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case split_part(p_path, '/', 1)
    when 'walkthroughs' then exists (
      select 1 from public.walkthroughs w where w.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(w.project_id) or public.is_project_homeowner(w.project_id))
    )
    when 'issues' then exists (
      select 1 from public.project_issues pi where pi.id = public.media_path_uuid(p_path, 2)
        and (public.can_view_project_internal(pi.project_id) or public.is_project_homeowner(pi.project_id))
    )
    else false
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
        and public.can_view_project_internal(pi.project_id)
    )
    else false
  end;
$$;

create policy project_media_select on storage.objects for select to authenticated
  using (bucket_id = 'project-media' and public.can_view_media_path(name));
create policy project_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-media' and public.can_upload_media_path(name));
create policy project_media_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-media'
    and owner_id = auth.uid()::text
    and split_part(name, '/', 1) = 'walkthroughs'
    and public.can_upload_media_path(name)
    and not exists (select 1 from public.issue_attachments ia where ia.storage_path = name)
  );
