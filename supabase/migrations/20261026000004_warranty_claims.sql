insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('warranty-claims', 'warranty-claims', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create table public.warranty_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  warranty_id uuid not null references public.project_warranties(id) on delete restrict,
  milestone_id uuid not null references public.warranty_milestones(id) on delete restrict,
  coverage_key text not null,
  category text not null,
  location text not null check (char_length(btrim(location)) between 2 and 200),
  title text not null check (char_length(btrim(title)) between 3 and 160),
  original_description text not null check (char_length(btrim(original_description)) between 10 and 5000),
  submitted_after_coverage boolean not null default false,
  reported_by uuid not null references auth.users(id) on delete restrict,
  reported_by_role text not null check (reported_by_role in ('homeowner', 'staff')),
  reported_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in
    ('submitted', 'under_review', 'info_requested', 'accepted', 'not_covered', 'in_progress', 'ready_for_validation', 'closed')),
  coverage_decision text check (coverage_decision in ('covered', 'not_covered')),
  coverage_decision_note text,
  coverage_decided_by uuid references auth.users(id) on delete set null,
  coverage_decided_at timestamptz,
  assigned_to uuid references auth.users(id) on delete set null,
  corrective_action text check (corrective_action is null or char_length(corrective_action) <= 5000),
  builder_verified_by uuid references auth.users(id) on delete set null,
  builder_verified_at timestamptz,
  homeowner_validation text not null default 'pending' check (homeowner_validation in ('pending', 'accepted', 'rejected')),
  homeowner_validation_note text,
  homeowner_validated_by uuid references auth.users(id) on delete set null,
  homeowner_validated_at timestamptz,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index warranty_claims_project_idx on public.warranty_claims (project_id, reported_at desc);
create index warranty_claims_org_status_idx on public.warranty_claims (organization_id, status);

create table public.warranty_claim_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  claim_id uuid not null references public.warranty_claims(id) on delete restrict,
  event_type text not null,
  from_status text,
  to_status text,
  note text,
  visibility text not null default 'shared' check (visibility in ('shared', 'internal')),
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null check (actor_role in ('homeowner', 'staff', 'system')),
  created_at timestamptz not null default now()
);
create index warranty_claim_events_claim_idx on public.warranty_claim_events (claim_id, created_at);

create table public.warranty_claim_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  claim_id uuid not null references public.warranty_claims(id) on delete restrict,
  storage_path text not null unique,
  kind text not null check (kind in ('original', 'info', 'repair')),
  file_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);
create index warranty_claim_media_claim_idx on public.warranty_claim_media (claim_id, uploaded_at);

create table public.warranty_claim_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  claim_id uuid not null references public.warranty_claims(id) on delete restrict,
  issue_id uuid not null references public.project_issues(id) on delete restrict,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (claim_id, issue_id)
);

create or replace function public.can_view_claim(p_claim uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.warranty_claims c
    where c.id = p_claim
      and public.is_feature_enabled(c.organization_id, 'warranty')
      and (public.can_view_project_internal(c.project_id)
           or (public.is_feature_enabled(c.organization_id, 'portal') and public.is_project_homeowner(c.project_id))))
$$;

create or replace function public.warranty_claim_history_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Claim history and original submissions cannot be changed or removed';
end;
$$;
create trigger warranty_claim_events_immutable before update or delete on public.warranty_claim_events
  for each row execute function public.warranty_claim_history_guard();
create trigger warranty_claim_media_immutable before update or delete on public.warranty_claim_media
  for each row execute function public.warranty_claim_history_guard();
create trigger warranty_claims_no_delete before delete on public.warranty_claims
  for each row execute function public.warranty_claim_history_guard();

create or replace function public.warranty_claims_original_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.original_description <> old.original_description or new.title <> old.title
     or new.location <> old.location or new.category <> old.category or new.coverage_key <> old.coverage_key
     or new.reported_by <> old.reported_by or new.reported_at <> old.reported_at
     or new.project_id <> old.project_id or new.warranty_id <> old.warranty_id or new.milestone_id <> old.milestone_id then
    raise exception 'The original claim submission cannot be changed';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger warranty_claims_original_guard before update on public.warranty_claims
  for each row execute function public.warranty_claims_original_guard();

create trigger audit_warranty_claims after insert or update on public.warranty_claims
  for each row execute function public.write_audit_event();
create trigger audit_warranty_claim_media after insert on public.warranty_claim_media
  for each row execute function public.write_audit_event();
create trigger audit_warranty_claim_links after insert on public.warranty_claim_links
  for each row execute function public.write_audit_event();

alter table public.warranty_claims enable row level security;
alter table public.warranty_claim_events enable row level security;
alter table public.warranty_claim_media enable row level security;
alter table public.warranty_claim_links enable row level security;

create policy warranty_claims_select on public.warranty_claims for select to authenticated
  using (public.can_view_claim(id));
create policy warranty_claim_events_select on public.warranty_claim_events for select to authenticated
  using (public.is_feature_enabled(organization_id, 'warranty') and (
    public.can_view_project_internal(project_id)
    or (visibility = 'shared' and public.is_feature_enabled(organization_id, 'portal') and public.is_project_homeowner(project_id))));
create policy warranty_claim_media_select on public.warranty_claim_media for select to authenticated
  using (public.can_view_claim(claim_id));
create policy warranty_claim_links_select on public.warranty_claim_links for select to authenticated
  using (public.is_feature_enabled(organization_id, 'warranty')
         and exists (select 1 from public.warranty_claims c where c.id = claim_id and public.can_view_project_internal(c.project_id)));

create policy warranty_claims_storage_select on storage.objects for select to authenticated
  using (bucket_id = 'warranty-claims'
         and exists (select 1 from public.warranty_claim_media m where m.storage_path = name and public.can_view_claim(m.claim_id)));

create or replace function public.can_upload_claim_object(p_name text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_parts text[] := string_to_array(p_name, '/'); v_claim uuid;
begin
  if array_length(v_parts, 1) <> 4 then return false; end if;
  begin
    v_claim := v_parts[3]::uuid;
  exception when others then return false;
  end;
  return exists (select 1 from public.warranty_claims c
                 where c.id = v_claim and c.organization_id::text = v_parts[1] and c.project_id::text = v_parts[2]
                   and c.status <> 'closed' and public.can_view_claim(c.id));
end;
$$;
create policy warranty_claims_storage_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'warranty-claims' and public.can_upload_claim_object(name));

create or replace function public.notify_claim_staff(c public.warranty_claims, p_title text, p_body text, p_dedupe text, p_action boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.project_warranties;
begin
  select * into w from public.project_warranties where id = c.warranty_id;
  perform public.notify_warranty_recipients(w, c.milestone_id, 'warranty_claim', p_title, p_body, p_dedupe, p_action);
  if c.assigned_to is not null then
    insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, warranty_id, milestone_id, dedupe_key, action_required)
    values (c.organization_id, c.assigned_to, p_title, p_body, '/projects/' || c.project_id || '/warranty', 'warranty_claim',
            c.project_id, c.warranty_id, c.milestone_id, p_dedupe, p_action)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
end;
$$;
revoke execute on function public.notify_claim_staff(public.warranty_claims, text, text, text, boolean) from public, anon, authenticated;

create or replace function public.submit_warranty_claim(
  p_project uuid, p_coverage_key text, p_category text, p_location text, p_title text, p_description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare w public.project_warranties; m public.warranty_milestones; c public.warranty_claims; v_staff boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
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
      location, title, original_description, submitted_after_coverage, reported_by, reported_by_role)
    values (w.organization_id, p_project, w.id, m.id, m.coverage_key, p_category, btrim(p_location), btrim(p_title),
            btrim(p_description), (m.reached_at is not null or m.due_on < public.org_today(w.organization_id)),
            auth.uid(), case when v_staff then 'staff' else 'homeowner' end)
    returning * into c;
  insert into public.warranty_claim_events (organization_id, project_id, claim_id, event_type, to_status, actor_id, actor_role, note)
    values (c.organization_id, c.project_id, c.id, 'submitted', 'submitted', auth.uid(), c.reported_by_role,
            case when c.submitted_after_coverage then 'Submitted after this coverage period ended' end);
  perform public.notify_claim_staff(c, 'New warranty claim: ' || c.title,
    c.category || ' at ' || c.location || '. Review and record a coverage decision.', 'claim:' || c.id || ':submitted', true);
  perform public.refresh_warranty_stage(w.id);
  return c.id;
end;
$$;

create or replace function public.staff_warranty_claim_action(
  p_claim uuid, p_action text, p_note text default null, p_assignee uuid default null, p_corrective text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.warranty_claims; v_from text; v_to text; v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_vis text := 'shared';
begin
  select * into c from public.warranty_claims where id = p_claim for update;
  if c.id is null or not public.is_org_staff(c.organization_id) or not public.can_view_project_internal(c.project_id) then
    raise exception 'Claim not found';
  end if;
  if not public.is_feature_enabled(c.organization_id, 'warranty') then raise exception 'Warranty Management is turned off'; end if;
  v_from := c.status; v_to := c.status;

  if p_action in ('accept', 'not_covered', 'close') and not public.is_org_manager(c.organization_id) then
    raise exception 'Only an administrator or project manager can make coverage decisions or close claims';
  end if;

  case p_action
    when 'start_review' then
      if c.status <> 'submitted' then raise exception 'Only new claims can be moved to review'; end if;
      v_to := 'under_review';
    when 'request_info' then
      if c.status not in ('submitted', 'under_review') then raise exception 'Information can only be requested before a coverage decision'; end if;
      if v_note is null then raise exception 'Describe the information you need'; end if;
      v_to := 'info_requested';
    when 'accept' then
      if c.status not in ('submitted', 'under_review') then raise exception 'This claim is not awaiting a coverage decision'; end if;
      v_to := 'accepted';
      update public.warranty_claims set coverage_decision = 'covered', coverage_decision_note = v_note,
        coverage_decided_by = auth.uid(), coverage_decided_at = now() where id = c.id;
    when 'not_covered' then
      if c.status not in ('submitted', 'under_review', 'info_requested') then raise exception 'This claim is not awaiting a coverage decision'; end if;
      if v_note is null then raise exception 'Explain why the item is not covered'; end if;
      v_to := 'not_covered';
      update public.warranty_claims set coverage_decision = 'not_covered', coverage_decision_note = v_note,
        coverage_decided_by = auth.uid(), coverage_decided_at = now() where id = c.id;
    when 'start_work' then
      if c.status <> 'accepted' then raise exception 'Accept the claim for repair first'; end if;
      v_to := 'in_progress';
    when 'ready_for_validation' then
      if c.status <> 'in_progress' then raise exception 'Repairs must be in progress first'; end if;
      if coalesce(nullif(btrim(coalesce(p_corrective, '')), ''), c.corrective_action) is null then
        raise exception 'Describe the corrective work performed';
      end if;
      v_to := 'ready_for_validation';
      update public.warranty_claims set
        corrective_action = coalesce(nullif(btrim(coalesce(p_corrective, '')), ''), corrective_action),
        builder_verified_by = auth.uid(), builder_verified_at = now(),
        homeowner_validation = 'pending', homeowner_validation_note = null,
        homeowner_validated_by = null, homeowner_validated_at = null
      where id = c.id;
    when 'close' then
      if not ((c.status = 'ready_for_validation' and c.homeowner_validation = 'accepted') or c.status = 'not_covered') then
        raise exception 'Claims close only after the homeowner accepts the repair, or after a not-covered decision';
      end if;
      v_to := 'closed';
      update public.warranty_claims set closed_at = now(), closed_by = auth.uid() where id = c.id;
    when 'assign' then
      if p_assignee is not null and not exists (select 1 from public.organization_memberships om
          where om.organization_id = c.organization_id and om.user_id = p_assignee and om.status = 'active' and om.role <> 'client') then
        raise exception 'Claims can only be assigned to active staff';
      end if;
      update public.warranty_claims set assigned_to = p_assignee where id = c.id;
      v_vis := 'internal';
      v_note := coalesce(v_note, case when p_assignee is null then 'Unassigned' else 'Assigned to staff member' end);
    when 'note' then
      if v_note is null then raise exception 'Enter a note'; end if;
      v_vis := 'internal';
    when 'update_corrective' then
      if c.status not in ('accepted', 'in_progress') then raise exception 'Corrective work can be updated only during repair'; end if;
      if nullif(btrim(coalesce(p_corrective, '')), '') is null then raise exception 'Describe the corrective work'; end if;
      update public.warranty_claims set corrective_action = btrim(p_corrective) where id = c.id;
      v_note := btrim(p_corrective);
    else
      raise exception 'Unknown claim action';
  end case;

  if v_to <> v_from then
    update public.warranty_claims set status = v_to where id = c.id;
  end if;
  insert into public.warranty_claim_events (organization_id, project_id, claim_id, event_type, from_status, to_status, note, visibility, actor_id, actor_role)
    values (c.organization_id, c.project_id, c.id, p_action, v_from, case when v_to <> v_from then v_to end, v_note, v_vis, auth.uid(), 'staff');
  if p_action = 'assign' and p_assignee is not null then
    select * into c from public.warranty_claims where id = c.id;
    insert into public.notifications (organization_id, user_id, title, body, link, kind, project_id, warranty_id, milestone_id, dedupe_key, action_required)
    values (c.organization_id, p_assignee, 'Warranty claim assigned: ' || c.title, c.category || ' at ' || c.location,
            '/projects/' || c.project_id || '/warranty', 'warranty_claim', c.project_id, c.warranty_id, c.milestone_id,
            'claim:' || c.id || ':assigned:' || p_assignee || ':' || extract(epoch from now())::bigint, true)
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  perform public.refresh_warranty_stage(c.warranty_id);
end;
$$;

create or replace function public.homeowner_warranty_claim_action(p_claim uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c public.warranty_claims; v_from text; v_to text; v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select * into c from public.warranty_claims where id = p_claim for update;
  if c.id is null or not public.is_project_homeowner(c.project_id)
     or not public.is_feature_enabled(c.organization_id, 'warranty') or not public.is_feature_enabled(c.organization_id, 'portal') then
    raise exception 'Claim not found';
  end if;
  v_from := c.status; v_to := c.status;
  case p_action
    when 'provide_info' then
      if c.status <> 'info_requested' then raise exception 'Your builder has not requested more information'; end if;
      if v_note is null then raise exception 'Enter the requested information'; end if;
      v_to := 'under_review';
    when 'accept_repair' then
      if c.status <> 'ready_for_validation' or c.homeowner_validation <> 'pending' then raise exception 'This repair is not awaiting your review'; end if;
      update public.warranty_claims set homeowner_validation = 'accepted', homeowner_validation_note = v_note,
        homeowner_validated_by = auth.uid(), homeowner_validated_at = now() where id = c.id;
    when 'reject_repair' then
      if c.status <> 'ready_for_validation' or c.homeowner_validation <> 'pending' then raise exception 'This repair is not awaiting your review'; end if;
      if v_note is null then raise exception 'Explain what still needs attention'; end if;
      update public.warranty_claims set homeowner_validation = 'rejected', homeowner_validation_note = v_note,
        homeowner_validated_by = auth.uid(), homeowner_validated_at = now() where id = c.id;
      v_to := 'in_progress';
    else
      raise exception 'Unknown claim action';
  end case;
  if v_to <> v_from then
    update public.warranty_claims set status = v_to where id = c.id;
  end if;
  insert into public.warranty_claim_events (organization_id, project_id, claim_id, event_type, from_status, to_status, note, visibility, actor_id, actor_role)
    values (c.organization_id, c.project_id, c.id, p_action, v_from, case when v_to <> v_from then v_to end, v_note, 'shared', auth.uid(), 'homeowner');
  select * into c from public.warranty_claims where id = c.id;
  perform public.notify_claim_staff(c,
    case p_action when 'provide_info' then 'Homeowner replied: ' when 'accept_repair' then 'Repair accepted: ' else 'Repair rejected: ' end || c.title,
    coalesce(v_note, 'The homeowner accepted the repair. The claim can now be closed.'),
    'claim:' || c.id || ':' || p_action || ':' || extract(epoch from now())::bigint, true);
end;
$$;

create or replace function public.warranty_claim_media_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.warranty_claims; v_staff boolean;
begin
  select * into c from public.warranty_claims where id = new.claim_id;
  if c.id is null then raise exception 'Claim not found'; end if;
  new.organization_id := c.organization_id;
  new.project_id := c.project_id;
  new.uploaded_by := auth.uid();
  new.uploaded_at := now();
  if new.storage_path not like c.organization_id || '/' || c.project_id || '/' || c.id || '/%' then
    raise exception 'Invalid attachment path';
  end if;
  v_staff := public.can_view_project_internal(c.project_id) and public.is_org_staff(c.organization_id);
  if c.status = 'closed' then raise exception 'Closed claims cannot receive new attachments'; end if;
  if new.kind = 'repair' and not v_staff then raise exception 'Only staff can attach repair photos'; end if;
  if new.kind = 'original' and (auth.uid() <> c.reported_by or c.reported_at < now() - interval '1 hour') then
    raise exception 'Original photos can only be added by the reporter when submitting';
  end if;
  return new;
end;
$$;
create trigger warranty_claim_media_guard before insert on public.warranty_claim_media
  for each row execute function public.warranty_claim_media_guard();
create policy warranty_claim_media_insert on public.warranty_claim_media for insert to authenticated
  with check (public.can_view_claim(claim_id));

create or replace function public.warranty_claim_links_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c public.warranty_claims; v_issue_project uuid;
begin
  select * into c from public.warranty_claims where id = new.claim_id;
  select project_id into v_issue_project from public.project_issues where id = new.issue_id;
  if c.id is null or v_issue_project is distinct from c.project_id then raise exception 'The issue must belong to the same project'; end if;
  new.organization_id := c.organization_id;
  new.created_by := auth.uid();
  new.created_at := now();
  return new;
end;
$$;
create trigger warranty_claim_links_guard before insert on public.warranty_claim_links
  for each row execute function public.warranty_claim_links_guard();
create policy warranty_claim_links_insert on public.warranty_claim_links for insert to authenticated
  with check (exists (select 1 from public.warranty_claims c where c.id = claim_id
                      and public.is_org_staff(c.organization_id) and public.can_view_project_internal(c.project_id)
                      and public.is_feature_enabled(c.organization_id, 'warranty')));

create or replace function public.refresh_warranty_stage(p_warranty uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare w public.project_warranties; v_next uuid; v_open int;
begin
  select * into w from public.project_warranties where id = p_warranty for update;
  if w.id is null or w.stage = 'archived' then return; end if;
  select id into v_next from public.warranty_milestones
    where warranty_id = w.id and reached_at is null order by due_on, sort_order limit 1;
  if v_next is not null then
    update public.project_warranties set stage = 'monitoring', current_milestone_id = v_next, updated_at = now()
      where id = w.id and (stage <> 'monitoring' or current_milestone_id is distinct from v_next);
    return;
  end if;
  select (select count(*) from public.project_issues where project_id = w.project_id and status not in ('resolved', 'closed'))
       + (select count(*) from public.warranty_claims where warranty_id = w.id and status <> 'closed')
    into v_open;
  update public.project_warranties
    set stage = case when v_open = 0 then 'ready_to_archive' else 'completed' end,
        current_milestone_id = null, updated_at = now()
    where id = w.id and stage is distinct from case when v_open = 0 then 'ready_to_archive' else 'completed' end;
end;
$$;
revoke execute on function public.refresh_warranty_stage(uuid) from public, anon, authenticated;

create or replace function public.organization_features_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_blocker text; v_open int;
begin
  if tg_op = 'DELETE' then raise exception 'Feature settings cannot be deleted; turn the feature off instead'; end if;
  if not exists (select 1 from public.feature_registry() r where r.feature_key = new.feature_key) then
    raise exception 'Unknown or core feature: %', new.feature_key;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  if new.enabled then
    select req into v_blocker from public.feature_registry() r, unnest(r.requires) req
      where r.feature_key = new.feature_key and not public.feature_flag_raw(new.organization_id, req) limit 1;
    if v_blocker is not null then
      raise exception 'Turn on % before enabling %', v_blocker, new.feature_key;
    end if;
  else
    select r.feature_key into v_blocker from public.feature_registry() r
      where new.feature_key = any(r.requires) and public.feature_flag_raw(new.organization_id, r.feature_key) limit 1;
    if v_blocker is not null then
      raise exception 'Turn off % first; it depends on %', v_blocker, new.feature_key;
    end if;
    if new.feature_key = 'warranty' then
      select count(*) into v_open from public.warranty_claims
        where organization_id = new.organization_id and status <> 'closed';
      if v_open > 0 then
        raise exception 'Resolve or close the % open warranty claim(s) before turning Warranty Management off. Warranty records are always preserved.', v_open;
      end if;
    end if;
  end if;
  return new;
end;
$$;
