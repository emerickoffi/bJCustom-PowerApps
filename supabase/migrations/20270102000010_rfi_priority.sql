-- Questions (RFIs): add a priority so builders can tell routine questions from urgent construction decisions.
-- Additive only: existing questions become 'normal'. Writes still go exclusively through the security-definer
-- functions below, so the existing permission checks (rfi_can_ask / rfi_can_edit) decide who may change it.

alter table public.project_rfis
  add column if not exists priority text not null default 'normal';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_rfis_priority_check') then
    alter table public.project_rfis
      add constraint project_rfis_priority_check check (priority in ('low', 'normal', 'high', 'urgent'));
  end if;
end $$;

-- Text sorts alphabetically, so the list sorts by this rank (Urgent first). Derived, so it can never disagree.
alter table public.project_rfis
  add column if not exists priority_rank smallint generated always as (
    case priority when 'urgent' then 3 when 'high' then 2 when 'normal' then 1 else 0 end
  ) stored;

create index if not exists project_rfis_project_priority_idx
  on public.project_rfis (project_id, priority_rank desc, due_date);

-- Creates the draft (p_rfi is the client-chosen id, so a retried create lands on the same row) or updates it.
-- A payload without a priority keeps the stored value, so older clients never reset it.
create or replace function public.rfi_save_draft(p_rfi uuid, p_project uuid, p_expected_version integer, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_archived timestamptz;
  r public.project_rfis;
  v_subject text := btrim(coalesce(p_payload ->> 'subject', ''));
  v_question text := coalesce(p_payload ->> 'question', '');
  v_responder uuid := nullif(p_payload ->> 'responder_user_id', '')::uuid;
  v_due date := nullif(p_payload ->> 'due_date', '')::date;
  v_location text := nullif(btrim(coalesce(p_payload ->> 'location', '')), '');
  v_doc uuid := nullif(p_payload ->> 'document_version_id', '')::uuid;
  v_priority text := nullif(btrim(coalesce(p_payload ->> 'priority', '')), '');
  v_doc_label text;
begin
  if auth.uid() is null or p_rfi is null then
    raise exception 'Sign in to continue.' using errcode = '42501';
  end if;
  select p.organization_id, p.archived_at into v_org, v_archived from public.projects p where p.id = p_project;
  if v_org is null or not public.rfi_can_ask(v_org, p_project) then
    raise exception 'You do not have access to ask questions on this project.' using errcode = '42501';
  end if;
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'Add a subject of 200 characters or fewer.';
  end if;
  if char_length(v_question) > 10000 then
    raise exception 'The question is too long. Keep it under 10,000 characters.';
  end if;
  if v_location is not null and char_length(v_location) > 300 then
    raise exception 'The location is too long. Keep it under 300 characters.';
  end if;
  if v_priority is not null and v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Choose a priority: Low, Normal, High, or Urgent.';
  end if;
  if v_responder is not null and not public.rfi_user_eligible(p_project, v_responder) then
    raise exception 'The selected responder cannot sign in to this project yet. Choose someone with access, or set up their access first.';
  end if;
  if v_doc is not null then
    select left(d.name || ' (v' || v.version_number || ')', 300) into v_doc_label
    from public.project_document_versions v
    join public.project_documents d on d.id = v.document_id
    where v.id = v_doc and d.scope = 'project' and d.project_id = p_project
      and public.can_view_document_version(v.id);
    if v_doc_label is null then
      raise exception 'That document is not available on this project.';
    end if;
  end if;

  select * into r from public.project_rfis where id = p_rfi for update;
  if not found then
    if v_archived is not null then
      raise exception 'This project is archived. Restore it before asking a new question.';
    end if;
    insert into public.project_rfis
      (id, organization_id, project_id, subject, question, responder_user_id, responder_name, responder_company,
       due_date, location, document_version_id, document_label, priority, created_by, created_by_name)
    values (p_rfi, v_org, p_project, v_subject, v_question, v_responder,
            case when v_responder is not null then public.rfi_user_name(v_org, v_responder) end,
            case when v_responder is not null then public.rfi_user_company(v_org, v_responder) end,
            v_due, v_location, v_doc, v_doc_label, coalesce(v_priority, 'normal'),
            auth.uid(), public.rfi_user_name(v_org, auth.uid()))
    returning * into r;
    perform public.rfi_log(r, 'created', null, 'draft', null, '{}'::jsonb, null, true);
    return public.rfi_result(r);
  end if;

  if r.project_id <> p_project or not public.rfi_can_edit(r.id) then
    raise exception 'This question is not available.' using errcode = '42501';
  end if;
  if r.status <> 'draft' then
    raise exception 'This question has already been sent. Reload to see it.' using errcode = '40001';
  end if;
  if p_expected_version is not null and p_expected_version <> r.row_version then
    raise exception 'This draft changed since you opened it. Reload to see the latest version, then try again.'
      using errcode = '40001';
  end if;
  update public.project_rfis set
    subject = v_subject, question = v_question, responder_user_id = v_responder,
    responder_name = case when v_responder is not null then public.rfi_user_name(v_org, v_responder) end,
    responder_company = case when v_responder is not null then public.rfi_user_company(v_org, v_responder) end,
    due_date = v_due, location = v_location, document_version_id = v_doc, document_label = v_doc_label,
    priority = coalesce(v_priority, r.priority),
    row_version = row_version + 1
  where id = r.id returning * into r;
  return public.rfi_result(r);
end;
$$;

-- Changes to an open question are recorded with the before and after values; the sent snapshot is never edited.
create or replace function public.rfi_amend(p_rfi uuid, p_expected_version integer, p_payload jsonb, p_note text, p_request uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.project_rfis;
  o public.project_rfis;
  v_subject text := btrim(coalesce(p_payload ->> 'subject', ''));
  v_question text := coalesce(p_payload ->> 'question', '');
  v_due date := nullif(p_payload ->> 'due_date', '')::date;
  v_location text := nullif(btrim(coalesce(p_payload ->> 'location', '')), '');
  v_priority text := nullif(btrim(coalesce(p_payload ->> 'priority', '')), '');
begin
  r := public.rfi_lock(p_rfi);
  if public.rfi_replayed(p_rfi, p_request) then return public.rfi_result(r, true); end if;
  if not public.rfi_can_edit(r.id) then
    raise exception 'Only the person who asked this question or a project manager can change it.' using errcode = '42501';
  end if;
  if r.status <> 'open' then
    raise exception 'Only an open question can be amended. Request clarification to reopen it first.' using errcode = '40001';
  end if;
  perform public.rfi_check_version(r, p_expected_version);
  if char_length(v_subject) not between 1 and 200 then
    raise exception 'Add a subject of 200 characters or fewer.';
  end if;
  if char_length(btrim(v_question)) = 0 or char_length(v_question) > 10000 then
    raise exception 'Write the question (up to 10,000 characters).';
  end if;
  if v_location is not null and char_length(v_location) > 300 then
    raise exception 'The location is too long. Keep it under 300 characters.';
  end if;
  if v_priority is not null and v_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Choose a priority: Low, Normal, High, or Urgent.';
  end if;
  v_priority := coalesce(v_priority, r.priority);
  if char_length(btrim(coalesce(p_note, ''))) < 3 then
    raise exception 'Describe what changed so the responder knows.';
  end if;
  o := r;
  if o.subject = v_subject and o.question = v_question and o.due_date is not distinct from v_due
     and o.location is not distinct from v_location and o.priority = v_priority then
    raise exception 'Nothing was changed.';
  end if;
  update public.project_rfis set
    subject = v_subject, question = v_question, due_date = v_due, location = v_location, priority = v_priority,
    row_version = row_version + 1
  where id = r.id returning * into r;
  perform public.rfi_log(r, 'amended', 'open', 'open', p_note, jsonb_build_object(
    'before', jsonb_build_object('subject', o.subject, 'question', o.question, 'due_date', o.due_date, 'location', o.location,
                                 'priority', o.priority),
    'after', jsonb_build_object('subject', r.subject, 'question', r.question, 'due_date', r.due_date, 'location', r.location,
                                'priority', r.priority)),
    p_request);
  perform public.rfi_notify(r, r.responder_user_id, 'Question updated: ' || public.rfi_ref(r),
                            'v' || r.row_version || ':amended', true);
  return public.rfi_result(r);
end;
$$;

revoke execute on function public.rfi_save_draft(uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.rfi_save_draft(uuid, uuid, integer, jsonb) to authenticated;
revoke execute on function public.rfi_amend(uuid, integer, jsonb, text, uuid) from public, anon;
grant execute on function public.rfi_amend(uuid, integer, jsonb, text, uuid) to authenticated;
