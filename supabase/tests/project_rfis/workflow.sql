-- Workflow and access checks for Questions (RFIs). Run with psql after fixtures.sql, on a disposable database:
--   psql -v ON_ERROR_STOP=1 -f fixtures.sql -f workflow.sql
-- Each check writes a row to test.results; the final query lists failures (none expected).
\set ORG '00000000-0000-0000-0000-00000000000a'
\set ADMIN '00000000-0000-0000-0000-0000000000a1'
\set PM '00000000-0000-0000-0000-0000000000a2'
\set STAFF '00000000-0000-0000-0000-0000000000a3'
\set STAFF_OFF '00000000-0000-0000-0000-0000000000a4'
\set STAFF_PENDING '00000000-0000-0000-0000-0000000000a5'
\set SUB1 '00000000-0000-0000-0000-0000000000b1'
\set SUB2 '00000000-0000-0000-0000-0000000000b2'
\set SUB3 '00000000-0000-0000-0000-0000000000b3'
\set OWNER1 '00000000-0000-0000-0000-0000000000c1'
\set OWNER2 '00000000-0000-0000-0000-0000000000c2'
\set OTHER '00000000-0000-0000-0000-0000000000d1'
\set P1 '00000000-0000-0000-0000-0000000000f1'
\set P2 '00000000-0000-0000-0000-0000000000f2'
\set PX '00000000-0000-0000-0000-0000000000f9'
\set DOC1 '00000000-0000-0000-0000-0000000d0c11'
\set DOC2 '00000000-0000-0000-0000-0000000d0c21'
\set R1 '10000000-0000-0000-0000-000000000001'
\set R2 '10000000-0000-0000-0000-000000000002'
\set R3 '10000000-0000-0000-0000-000000000003'
\set R4 '10000000-0000-0000-0000-000000000004'
\set R5 '10000000-0000-0000-0000-000000000005'
\set ANSWER_FILE '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f1/10000000-0000-0000-0000-000000000001/answer/aaaaaaaa-1111-1111-1111-111111111111-panel.pdf'
\set QUESTION_FILE '00000000-0000-0000-0000-00000000000a/00000000-0000-0000-0000-0000000000f1/10000000-0000-0000-0000-000000000001/question/bbbbbbbb-1111-1111-1111-111111111111-sketch.png'

-- ───────── 1. Incomplete draft → edit → send ─────────
select test.as(:'STAFF');
select test.eq('draft: subject only is enough',
  (public.rfi_save_draft(:'R1', :'P1', null, '{"subject":"Panel location"}') ->> 'status'), 'draft');
select public.rfi_save_draft(:'R1', :'P1', null, '{"subject":"Panel location"}');
select test.eq('draft: repeated create lands on one row', (select count(*)::text from public.project_rfis where id = :'R1'), '1');
select test.eq('draft: has no number', (select coalesce(rfi_number::text, 'none') from public.project_rfis where id = :'R1'), 'none');
select test.throws('draft: subject is required', format('select public.rfi_save_draft(%L, %L, null, %L)', gen_random_uuid(), :'P1', '{"subject":"  "}'), 'subject');
select test.throws('send: question is required',
  format('select public.rfi_send(%L, (select row_version from public.project_rfis where id = %L), gen_random_uuid())', :'R1', :'R1'), 'Write the question');
select public.rfi_save_draft(:'R1', :'P1', null, '{"subject":"Panel location","question":"Where does the main panel go?"}');
select test.throws('send: responder is required',
  format('select public.rfi_send(%L, (select row_version from public.project_rfis where id = %L), gen_random_uuid())', :'R1', :'R1'), 'Choose who should answer');
select test.throws('draft: document from another project is refused',
  format('select public.rfi_save_draft(%L, %L, null, %L)', :'R1', :'P1', json_build_object('subject', 'x', 'document_version_id', :'DOC2')::text), 'not available');
select test.throws('draft: ineligible responder (company not on project) is refused',
  format('select public.rfi_save_draft(%L, %L, null, %L)', :'R1', :'P1', json_build_object('subject', 'x', 'responder_user_id', :'SUB3')::text), 'cannot sign in');
select test.throws('draft: homeowner cannot be the responder',
  format('select public.rfi_save_draft(%L, %L, null, %L)', :'R1', :'P1', json_build_object('subject', 'x', 'responder_user_id', :'OWNER1')::text), 'cannot sign in');
select public.rfi_save_draft(:'R1', :'P1', (select row_version from public.project_rfis where id = :'R1'),
  json_build_object('subject', 'Panel location', 'question', 'Where does the main panel go?', 'responder_user_id', :'SUB1',
                    'due_date', (current_date - 1)::text, 'location', 'Garage', 'document_version_id', :'DOC1')::jsonb);
select test.eq('draft: document label is stored', (select document_label from public.project_rfis where id = :'R1'), 'A-201 Floor Plan (v1)');
select test.throws('draft: stale version is refused', format('select public.rfi_save_draft(%L, %L, 1, %L)', :'R1', :'P1', '{"subject":"old tab"}'), 'changed since');

-- Draft privacy
select test.as(:'PM');
select test.eq('draft: manager sees it', (select count(*)::text from public.project_rfis where id = :'R1'), '1');
select test.as(:'STAFF_OFF');
select test.eq('draft: staff outside the project do not', (select count(*)::text from public.project_rfis), '0');
select test.as(:'SUB1');
select test.eq('draft: chosen responder does not see a draft', (select count(*)::text from public.project_rfis), '0');
select test.eq('draft: not in the responder workspace list', (select count(*)::text from public.my_assigned_rfis()), '0');
select test.as(:'OWNER1');
select test.eq('draft: homeowner does not', (select count(*)::text from public.project_rfis), '0');

-- Question attachment while draft
reset role;
insert into storage.objects (bucket_id, name, owner_id) values ('project-rfis', :'QUESTION_FILE', :'STAFF');
select test.as(:'STAFF');
select test.eq('files: requester may upload question files', public.rfi_can_upload_object(:'QUESTION_FILE')::text, 'true');
select public.rfi_attachment_add(:'R1', :'QUESTION_FILE', 'sketch.png', 'image/png', 2048);
select public.rfi_attachment_add(:'R1', :'QUESTION_FILE', 'sketch.png', 'image/png', 2048);
select test.eq('files: repeated register keeps one row', (select count(*)::text from public.project_rfi_attachments where rfi_id = :'R1'), '1');
select test.throws('files: unsupported type is refused',
  format('select public.rfi_attachment_add(%L, %L, %L, %L, 10)', :'R1', replace(:'QUESTION_FILE', 'sketch.png', 'run.exe'), 'run.exe', 'application/x-msdownload'), 'not supported');

-- Send
\set SEND1 '20000000-0000-0000-0000-000000000001'
select public.rfi_send(:'R1', (select row_version from public.project_rfis where id = :'R1'), :'SEND1') as sent \gset
select test.eq('send: status is open', (:'sent'::jsonb ->> 'status'), 'open');
select test.eq('send: first number on the project', (:'sent'::jsonb ->> 'rfi_number'), '1');
select test.eq('send: repeated request is replayed', (public.rfi_send(:'R1', 1, :'SEND1') ->> 'replayed'), 'true');
select test.eq('send: one sent event', (select count(*)::text from public.project_rfi_events where rfi_id = :'R1' and event_type = 'sent'), '1');
select test.throws('send: a second, different send is refused', format('select public.rfi_send(%L, 99, gen_random_uuid())', :'R1'), 'already been sent');
select test.throws('draft: a sent question cannot be saved as a draft', format('select public.rfi_save_draft(%L, %L, null, %L)', :'R1', :'P1', '{"subject":"x"}'), 'already been sent');
reset role;
select test.eq('notify: responder got exactly one notice',
  (select count(*)::text from public.notifications where user_id = :'SUB1' and dedupe_key like 'rfi:' || :'R1' || ':%'), '1');
select test.eq('notify: responder link opens their own workspace',
  (select link from public.notifications where user_id = :'SUB1' and dedupe_key like 'rfi:' || :'R1' || ':%'), '/sub/questions/' || :'R1');
select test.eq('notify: sender is not notified', (select count(*)::text from public.notifications where user_id = :'STAFF'), '0');

-- A second question on the same project, assigned to staff, so the responder directory check below is meaningful.
select test.as(:'PM');
select public.rfi_save_draft(:'R2', :'P1', null, json_build_object('subject', 'Tile selection', 'question', 'Which tile?', 'responder_user_id', :'STAFF')::jsonb);
select public.rfi_send(:'R2', 1, gen_random_uuid());
select test.eq('number: second question is RFI-002', (select rfi_number::text from public.project_rfis where id = :'R2'), '2');

-- ───────── 2. Recipient opens and answers through their own workspace ─────────
select test.as(:'SUB1');
select test.eq('responder: sees only the question assigned to them', (select string_agg(rfi_number::text, ',') from public.project_rfis), '1');
select test.eq('responder: workspace list shows it with the project name',
  (select project_name || '|' || status from public.my_assigned_rfis()), 'Maple Street Residence|open');
select test.eq('responder: sees the question file', (select count(*)::text from public.project_rfi_attachments where rfi_id = :'R1'), '1');
select test.eq('responder: may read the question file object', public.rfi_can_read_object(:'QUESTION_FILE')::text, 'true');
select test.eq('responder: cannot open the referenced document', coalesce(public.rfi_document_path(:'R1'), 'none'), 'none');
select test.eq('responder: internal history is hidden', (select count(*)::text from public.project_rfi_events where rfi_id = :'R1' and internal), '0');
select test.throws('responder: cannot add question files', format('select public.rfi_attachment_add(%L, %L, %L, %L, 10)', :'R1', :'QUESTION_FILE', 'a.png', 'image/png'), 'Only the person who asked');
select test.eq('responder: may upload answer files', public.rfi_can_upload_object(:'ANSWER_FILE')::text, 'true');
select test.eq('responder: may not upload question files', public.rfi_can_upload_object(:'QUESTION_FILE')::text, 'false');
select test.as(:'SUB2');
select test.eq('same company, not assigned: sees nothing', (select count(*)::text from public.project_rfis), '0');
select test.eq('same company, not assigned: cannot upload answer files', public.rfi_can_upload_object(:'ANSWER_FILE')::text, 'false');
select test.throws('same company, not assigned: cannot answer', format('select public.rfi_answer(%L, 3, %L, %L, gen_random_uuid())', :'R1', 'hi', '[]'), 'not available');

-- Comments stay comments
select test.as(:'SUB1');
\set C1 '30000000-0000-0000-0000-000000000001'
select public.rfi_comment(:'R1', :'C1', 'Is this the 200A panel?');
select public.rfi_comment(:'R1', :'C1', 'Is this the 200A panel?');
select test.as(:'STAFF');
select public.rfi_comment(:'R1', gen_random_uuid(), 'Yes, 200A.');
select test.eq('comments: retried post is stored once', (select count(*)::text from public.project_rfi_comments where rfi_id = :'R1'), '2');
select test.eq('comments: status is unchanged', (select status from public.project_rfis where id = :'R1'), 'open');
select test.eq('comments: no official answer was created', (select count(*)::text from public.project_rfi_responses where rfi_id = :'R1'), '0');

-- Official answer
reset role;
insert into storage.objects (bucket_id, name, owner_id) values ('project-rfis', :'ANSWER_FILE', :'SUB1');
select row_version as v1 from public.project_rfis where id = :'R1' \gset
select test.as(:'PM');
select test.throws('answer: only the assigned responder', format('select public.rfi_answer(%L, %s, %L, %L, gen_random_uuid())', :'R1', :v1, 'PM answer', '[]'), 'Only the assigned responder');
select test.as(:'SUB1');
select test.throws('answer: stale version is refused', format('select public.rfi_answer(%L, %s, %L, %L, gen_random_uuid())', :'R1', :v1 - 1, 'late', '[]'), 'changed since');
select test.throws('answer: a file that was never uploaded is refused',
  format('select public.rfi_answer(%L, %s, %L, %L, gen_random_uuid())', :'R1', :v1, 'x',
         json_build_array(json_build_object('path', replace(:'ANSWER_FILE', 'panel.pdf', 'ghost.pdf'), 'name', 'ghost.pdf', 'type', 'application/pdf', 'size', 10))::text), 'not uploaded');
select test.throws('answer: a file from another question is refused',
  format('select public.rfi_answer(%L, %s, %L, %L, gen_random_uuid())', :'R1', :v1, 'x',
         json_build_array(json_build_object('path', replace(:'ANSWER_FILE', :'R1', :'R2'), 'name', 'p.pdf', 'type', 'application/pdf', 'size', 10))::text), 'does not belong');
select test.eq('answer: failed attempts left nothing behind', (select count(*)::text from public.project_rfi_responses where rfi_id = :'R1'), '0');
\set ANS1 '20000000-0000-0000-0000-000000000002'
select public.rfi_answer(:'R1', :v1, 'North wall of the garage, per A-201.',
  json_build_array(json_build_object('path', :'ANSWER_FILE', 'name', 'panel.pdf', 'type', 'application/pdf', 'size', 4096))::jsonb, :'ANS1') as answered \gset
select test.eq('answer: status is answered', (:'answered'::jsonb ->> 'status'), 'answered');
select test.eq('answer: repeated request is replayed', (public.rfi_answer(:'R1', :v1, 'North wall', '[]', :'ANS1') ->> 'replayed'), 'true');
select test.eq('answer: one official answer', (select count(*)::text from public.project_rfi_responses where rfi_id = :'R1'), '1');
select test.eq('answer: file is attached to the answer', (select count(*)::text from public.project_rfi_attachments where rfi_id = :'R1' and kind = 'answer' and response_id is not null), '1');
select test.throws('answer: a second answer needs the question reopened', format('select public.rfi_answer(%L, %s, %L, %L, gen_random_uuid())', :'R1', :v1 + 1, 'again', '[]'), 'no longer waiting');
select test.throws('responder: cannot close', format('select public.rfi_transition(%L, %s, %L, null, gen_random_uuid())', :'R1', :v1 + 1, 'close'), 'Only the person who asked');
reset role;
select test.eq('notify: requester told once, linked to the project page',
  (select string_agg(link, ',') from public.notifications where user_id = :'STAFF' and dedupe_key like 'rfi:' || :'R1' || ':%'),
  '/projects/' || :'P1' || '/rfis?rfi=' || :'R1');
select test.eq('notify: responder''s open task is cleared',
  (select count(*)::text from public.notifications where user_id = :'SUB1' and action_required and acknowledged_at is null), '0');

-- ───────── 3. Requester reviews and closes ─────────
select test.as(:'STAFF');
select row_version as v2 from public.project_rfis where id = :'R1' \gset
\set CLOSE1 '20000000-0000-0000-0000-000000000003'
select test.eq('close: answered question closes without a reason', (public.rfi_transition(:'R1', :v2, 'close', null, :'CLOSE1') ->> 'status'), 'closed');
select test.eq('close: repeated request is replayed', (public.rfi_transition(:'R1', :v2, 'close', null, :'CLOSE1') ->> 'replayed'), 'true');
select test.eq('close: one closed event', (select count(*)::text from public.project_rfi_events where rfi_id = :'R1' and event_type = 'closed'), '1');
reset role;
select test.eq('notify: responder is told it closed, as information only',
  (select string_agg(action_required::text, ',') from public.notifications where user_id = :'SUB1' and title like '%closed%'), 'false');

-- ───────── 4. Clarification preserves prior answers ─────────
select test.as(:'STAFF');
select test.throws('reopen: reason is required', format('select public.rfi_transition(%L, %s, %L, %L, gen_random_uuid())', :'R1', :v2 + 1, 'reopen', '  '), 'needs clarification');
select test.eq('reopen: returns to open', (public.rfi_transition(:'R1', :v2 + 1, 'reopen', 'Which breaker size?', gen_random_uuid()) ->> 'status'), 'open');
select test.eq('reopen: earlier answer is kept', (select count(*)::text from public.project_rfi_responses where rfi_id = :'R1'), '1');
select test.as(:'SUB1');
select public.rfi_answer(:'R1', (select row_version from public.project_rfis where id = :'R1'), '200A main breaker.', '[]', gen_random_uuid());
select test.eq('reopen: both answers are kept in order',
  (select string_agg(cycle::text, ',' order by created_at) from public.project_rfi_responses where rfi_id = :'R1'), '1,2');
select test.eq('history: every step is recorded',
  (select string_agg(event_type, ',' order by created_at, id) from public.project_rfi_events where rfi_id = :'R1'),
  'sent,answered,closed,reopened,answered');
select test.as(:'PM');
select test.throws('close: an unanswered question needs a reason', format('select public.rfi_transition(%L, 2, %L, null, gen_random_uuid())', :'R2', 'close'), 'Give a reason');
select test.eq('close: open closes with a reason', (public.rfi_transition(:'R2', 2, 'close', 'Resolved on site', gen_random_uuid()) ->> 'status'), 'closed');
select test.throws('stale: an old tab cannot overwrite a newer decision', format('select public.rfi_transition(%L, 2, %L, %L, gen_random_uuid())', :'R2', 'reopen', 'old tab'), 'changed since');

-- ───────── 5. Amendment keeps the sent question; reassignment moves access ─────────
select public.rfi_save_draft(:'R3', :'P1', null, json_build_object('subject', 'Outlet height', 'question', 'Height of kitchen outlets?', 'responder_user_id', :'SUB1')::jsonb);
select public.rfi_send(:'R3', 1, gen_random_uuid());
select test.throws('amend: a note is required', format('select public.rfi_amend(%L, 2, %L, %L, gen_random_uuid())', :'R3', '{"subject":"Outlet height","question":"Height of island outlets?"}', ''), 'what changed');
select public.rfi_amend(:'R3', 2, '{"subject":"Outlet height","question":"Height of island outlets?"}', 'Island, not perimeter', gen_random_uuid());
select test.eq('amend: sent snapshot still holds the original question',
  (select details ->> 'question' from public.project_rfi_events where rfi_id = :'R3' and event_type = 'sent'), 'Height of kitchen outlets?');
select test.eq('amend: history records before and after',
  (select (details #>> '{before,question}') || ' -> ' || (details #>> '{after,question}') from public.project_rfi_events where rfi_id = :'R3' and event_type = 'amended'),
  'Height of kitchen outlets? -> Height of island outlets?');
select test.as(:'SUB1');
select test.throws('amend: an answer written against the old question is refused', format('select public.rfi_answer(%L, 2, %L, %L, gen_random_uuid())', :'R3', '18 inches', '[]'), 'changed since');

select test.as(:'PM');
select test.throws('reassign: company not on the project', format('select public.rfi_reassign(%L, 3, %L, null, gen_random_uuid())', :'R3', :'SUB3'), 'cannot sign in');
select test.throws('reassign: staff outside the project', format('select public.rfi_reassign(%L, 3, %L, null, gen_random_uuid())', :'R3', :'STAFF_OFF'), 'cannot sign in');
select test.throws('reassign: account not activated', format('select public.rfi_reassign(%L, 3, %L, null, gen_random_uuid())', :'R3', :'STAFF_PENDING'), 'cannot sign in');
select test.throws('reassign: homeowner', format('select public.rfi_reassign(%L, 3, %L, null, gen_random_uuid())', :'R3', :'OWNER1'), 'cannot sign in');
select test.eq('reassign: to a colleague at the same company', (public.rfi_reassign(:'R3', 3, :'SUB2', 'Eli is off this week', gen_random_uuid()) ->> 'status'), 'open');
select test.as(:'SUB1');
select test.eq('reassign: previous responder loses the question', (select count(*)::text from public.project_rfis where id = :'R3'), '0');
select test.throws('reassign: previous responder cannot answer', format('select public.rfi_answer(%L, 4, %L, %L, gen_random_uuid())', :'R3', 'late', '[]'), 'not available');
select test.throws('reassign: previous responder cannot comment', format('select public.rfi_comment(%L, gen_random_uuid(), %L)', :'R3', 'hello'), 'not available');
select test.as(:'SUB2');
select test.eq('reassign: new responder has it', (select count(*)::text from public.my_assigned_rfis() where id = :'R3'), '1');
reset role;
select test.eq('reassign: previous responder''s task is cleared, new responder notified',
  (select count(*) filter (where user_id = :'SUB1' and action_required and acknowledged_at is null) || '/' ||
          count(*) filter (where user_id = :'SUB2' and action_required and acknowledged_at is null)
   from public.notifications where dedupe_key like 'rfi:' || :'R3' || ':%'), '0/1');

-- ───────── 6. Homeowner: nothing by default, one question when shared ─────────
select test.as(:'OWNER1');
select test.eq('homeowner: sees nothing by default', (select count(*)::text from public.project_rfis), '0');
select test.eq('homeowner: cannot read an unshared file', public.rfi_can_read_object(:'ANSWER_FILE')::text, 'false');
select test.as(:'STAFF');
select test.throws('share: builder staff cannot share', format('select public.rfi_set_homeowner_shared(%L, true)', :'R1'), 'administrator or project manager');
select test.as(:'SUB1');
select test.throws('share: responder cannot share', format('select public.rfi_set_homeowner_shared(%L, true)', :'R1'), 'administrator or project manager');
select test.as(:'PM');
select public.rfi_set_homeowner_shared(:'R1', true);
select test.as(:'OWNER1');
select test.eq('homeowner: sees exactly the shared question', (select string_agg(rfi_number::text, ',') from public.project_rfis), '1');
select test.eq('homeowner: sees the official answers', (select count(*)::text from public.project_rfi_responses), '2');
select test.eq('homeowner: sees its files', (select count(*)::text from public.project_rfi_attachments), '2');
select test.eq('homeowner: may read a shared file', public.rfi_can_read_object(:'ANSWER_FILE')::text, 'true');
select test.eq('homeowner: comments stay private', (select count(*)::text from public.project_rfi_comments), '0');
select test.eq('homeowner: history stays private', (select count(*)::text from public.project_rfi_events), '0');
select test.eq('homeowner: internal document stays closed', coalesce(public.rfi_document_path(:'R1'), 'none'), 'none');
select test.eq('homeowner: no new project records are exposed', (select count(*)::text from public.project_documents), '0');
select test.throws('homeowner: cannot comment', format('select public.rfi_comment(%L, gen_random_uuid(), %L)', :'R1', 'hi'), 'not available');
select test.throws('homeowner: cannot answer', format('select public.rfi_answer(%L, 1, %L, %L, gen_random_uuid())', :'R1', 'hi', '[]'), 'not available');
select test.throws('homeowner: cannot close', format('select public.rfi_transition(%L, 1, %L, %L, gen_random_uuid())', :'R1', 'close', 'x'), 'not available');
select test.as(:'OWNER2');
select test.eq('homeowner of another project: sees nothing', (select count(*)::text from public.project_rfis), '0');
select test.as(:'PM');
select public.rfi_set_homeowner_shared(:'R1', false);
select test.as(:'OWNER1');
select test.eq('homeowner: unsharing removes access', (select count(*)::text from public.project_rfis), '0');

-- ───────── 7. Cross-company and unauthorized project access ─────────
select test.as(:'OTHER');
select test.eq('other organization: sees nothing', (select count(*)::text from public.project_rfis), '0');
select test.eq('other organization: no answers, comments, history, or files',
  (select (select count(*) from public.project_rfi_responses) + (select count(*) from public.project_rfi_comments)
        + (select count(*) from public.project_rfi_events) + (select count(*) from public.project_rfi_attachments))::text, '0');
select test.throws('other organization: cannot create on this project', format('select public.rfi_save_draft(gen_random_uuid(), %L, null, %L)', :'P1', '{"subject":"x"}'), 'do not have access');
select test.throws('other organization: cannot comment', format('select public.rfi_comment(%L, gen_random_uuid(), %L)', :'R1', 'hi'), 'not available');
select test.throws('other organization: cannot list responders', format('select * from public.rfi_responder_options(%L)', :'P1'), 'do not have access');
select test.as(:'ADMIN');
select test.throws('admin: cannot create on another organization''s project', format('select public.rfi_save_draft(gen_random_uuid(), %L, null, %L)', :'PX', '{"subject":"x"}'), 'do not have access');
select test.as(:'STAFF_OFF');
select test.throws('staff outside the project: cannot create', format('select public.rfi_save_draft(gen_random_uuid(), %L, null, %L)', :'P1', '{"subject":"x"}'), 'do not have access');
select test.as(:'SUB1');
select test.throws('subcontractor: cannot create questions', format('select public.rfi_save_draft(gen_random_uuid(), %L, null, %L)', :'P1', '{"subject":"x"}'), 'do not have access');
select test.as(:'STAFF');
select test.eq('builder staff on the project: see sent questions, not manager rights',
  (select count(*)::text from public.project_rfis where status <> 'draft'), '3');
select test.throws('builder staff: cannot close a colleague''s question', format('select public.rfi_transition(%L, 4, %L, %L, gen_random_uuid())', :'R3', 'close', 'x'), 'Only the person who asked');

-- Direct table writes are closed to every signed-in role.
select test.as(:'ADMIN');
select test.throws('tables: no direct insert', format('insert into public.project_rfis (organization_id, project_id, subject, created_by_name) values (%L, %L, %L, %L)', :'ORG', :'P1', 'x', 'x'), 'permission denied|row-level security');
select test.throws('tables: no direct status change', format('update public.project_rfis set status = %L where id = %L', 'closed', :'R3'), 'permission denied|row-level security');
select test.throws('tables: no direct answer', format('insert into public.project_rfi_responses (organization_id, project_id, rfi_id, cycle, body, responded_by_name) values (%L, %L, %L, 1, %L, %L)', :'ORG', :'P1', :'R3', 'x', 'x'), 'permission denied|row-level security');
reset role;
select test.throws('history: answers cannot be edited even by the database owner', format('update public.project_rfi_responses set body = %L', 'rewritten'), 'kept as history');
select test.throws('history: events cannot be removed', 'delete from public.project_rfi_events', 'kept as history');
select test.throws('history: questions cannot be deleted', format('delete from public.project_rfis where id = %L', :'R1'), 'kept as history');
set role anon;
select test.throws('signed-out visitors: no access', 'select count(*) from public.project_rfis', 'permission denied');
reset role;

-- ───────── 8. Responder choices explain who cannot be chosen ─────────
select test.as(:'STAFF');
select test.eq('responders: eligible people',
  (select string_agg(full_name, ', ' order by full_name) from public.rfi_responder_options(:'P1') where eligible),
  'Ada Admin, Eli Electric, Erin Electric, Pat Manager, Sam Staff');
select test.eq('responders: ineligible people carry a reason',
  (select string_agg(full_name || '=' || reason, ', ' order by full_name) from public.rfi_responder_options(:'P1') where not eligible),
  'Archie Architect=directory_only, Gamma Framing=no_portal_account, Otis Offsite=not_on_project, Penny Pending=not_activated');

-- ───────── 9. Losing project access ends responder access ─────────
reset role;
update public.subcontractor_project_assignments set ended_at = now()
where project_id = :'P1' and subcontractor_company_id = '00000000-0000-0000-0000-000000000c01';
select test.as(:'SUB2');
select test.eq('access: ending the company''s assignment hides the question', (select count(*)::text from public.project_rfis), '0');
select test.eq('access: and empties the workspace list', (select count(*)::text from public.my_assigned_rfis()), '0');
select test.as(:'PM');
select test.throws('reopen: blocked until the question is reassigned',
  format('select public.rfi_transition(%L, (select row_version from public.project_rfis where id = %L), %L, %L, gen_random_uuid())', :'R1', :'R1', 'reopen', 'More detail'), 'Reassign the question');

-- ───────── 10. Feature switch hides everything and keeps every row ─────────
reset role;
set session_replication_role = replica;
update public.organization_features set enabled = false where organization_id = :'ORG' and feature_key = 'rfis';
set session_replication_role = origin;
select count(*) as kept_before from public.project_rfis \gset
select test.as(:'ADMIN');
select test.eq('feature off: nothing is visible', (select count(*)::text from public.project_rfis), '0');
select test.throws('feature off: nothing can be created', format('select public.rfi_save_draft(gen_random_uuid(), %L, null, %L)', :'P1', '{"subject":"x"}'), 'do not have access');
select test.throws('feature off: nothing can be changed', format('select public.rfi_comment(%L, gen_random_uuid(), %L)', :'R1', 'hi'), 'not available');
reset role;
select test.eq('feature off: every record is kept', (select count(*)::text from public.project_rfis), :'kept_before');
set session_replication_role = replica;
update public.organization_features set enabled = true where organization_id = :'ORG' and feature_key = 'rfis';
set session_replication_role = origin;
select test.as(:'ADMIN');
select test.eq('feature on again: records return', (select count(*)::text from public.project_rfis), :'kept_before');

-- ───────── 11. Notifications never duplicate ─────────
reset role;
select test.eq('notify: no duplicate (user, key) pairs',
  (select count(*)::text from (select 1 from public.notifications where kind = 'rfi' group by user_id, dedupe_key having count(*) > 1) d), '0');
select test.eq('unrelated tables were not touched',
  (select (select count(*) from public.schedule_activities) + (select count(*) from public.change_orders)
        + (select count(*) from public.project_commitments) + (select count(*) from public.estimates))::text, '0');

select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from test.results;
select label, detail from test.results where not pass order by id;
