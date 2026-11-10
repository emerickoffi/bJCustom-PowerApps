import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ineligibleExplanation,
  isRfiOverdue,
  parseRfiNumber,
  rfiDbError,
  rfiEventSummary,
  rfiFileProblem,
  rfiFileType,
  rfiObjectPath,
  rfiRef,
  rfisPath,
} from './rfis.ts'

const ID = '11111111-1111-4111-8111-111111111111'

test('a sent question shows a padded project number; a draft has none', () => {
  assert.equal(rfiRef(3), 'RFI-003')
  assert.equal(rfiRef(1204), 'RFI-1204')
  assert.equal(rfiRef(null), 'Draft')
})

test('the direct link keeps the question in the URL', () => {
  assert.equal(rfisPath(ID), `/projects/${ID}/rfis`)
  assert.equal(rfisPath(ID, 'abc'), `/projects/${ID}/rfis?rfi=abc`)
})

test('search recognises a question number in the forms people type', () => {
  for (const q of ['3', '003', 'RFI-003', 'rfi 3', '#3', ' RFI-3 ']) assert.equal(parseRfiNumber(q), 3, q)
  for (const q of ['', 'panel', 'RFI', '0', 'RFI-3a', '3 outlets']) assert.equal(parseRfiNumber(q), null, q)
})

test('only an open question past its due date is overdue', () => {
  assert.equal(isRfiOverdue('open', '2026-01-01', '2026-01-02'), true)
  assert.equal(isRfiOverdue('open', '2026-01-02', '2026-01-02'), false)
  assert.equal(isRfiOverdue('open', null, '2026-01-02'), false)
  assert.equal(isRfiOverdue('answered', '2026-01-01', '2026-01-02'), false)
  assert.equal(isRfiOverdue('closed', '2026-01-01', '2026-01-02'), false)
  assert.equal(isRfiOverdue('draft', '2026-01-01', '2026-01-02'), false)
})

test('file checks fall back to the extension when the browser reports no usable type', () => {
  assert.equal(rfiFileType({ name: 'photo.HEIC', type: '' }), 'image/heic')
  assert.equal(rfiFileType({ name: 'takeoff.csv', type: 'application/octet-stream' }), 'text/csv')
  assert.equal(rfiFileType({ name: 'plan.pdf', type: 'application/pdf' }), 'application/pdf')
  assert.equal(rfiFileType({ name: 'run.exe', type: 'application/x-msdownload' }), null)
  assert.equal(rfiFileProblem({ name: 'plan.pdf', type: 'application/pdf', size: 10 }), null)
  assert.match(rfiFileProblem({ name: 'big.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 }) ?? '', /25 MB/)
  assert.match(rfiFileProblem({ name: 'run.exe', type: '', size: 10 }) ?? '', /not a supported/)
  assert.match(rfiFileProblem({ name: 'empty.pdf', type: 'application/pdf', size: 0 }) ?? '', /empty/)
})

test('storage paths follow the layout the storage policies check', () => {
  const path = rfiObjectPath({ organization_id: 'org', project_id: 'proj', id: 'rfi' }, 'answer', 'Panel photo (1).png', 'uuid')
  assert.equal(path, 'org/proj/rfi/answer/uuid-Panel_photo_1_.png')
})

test('each ineligible reason explains itself and links to an existing access page', () => {
  const base = { full_name: 'Sam', company_id: 'c1', company_name: 'Acme', person_id: 'p1' }
  assert.equal(ineligibleExplanation({ ...base, reason: 'not_activated' }, ID).href, '/team')
  assert.equal(ineligibleExplanation({ ...base, reason: 'not_on_project' }, ID).href, `/projects/${ID}#project-team`)
  assert.equal(ineligibleExplanation({ ...base, reason: 'no_portal_account' }, ID).href, '/subcontractors/c1')
  assert.equal(ineligibleExplanation({ ...base, reason: 'company_inactive' }, ID).href, '/subcontractors/c1')
  const directory = ineligibleExplanation({ ...base, reason: 'directory_only' }, ID)
  assert.equal(directory.href, '/contacts/people/p1')
  assert.match(directory.message, /does not include a sign-in/)
})

test('history entries read as plain sentences', () => {
  assert.equal(rfiEventSummary({ event_type: 'sent', details: { responder_name: 'Eli' } }), 'Question sent to Eli')
  assert.equal(
    rfiEventSummary({ event_type: 'reassigned', details: { from_name: 'Eli', to_name: 'Erin' } }),
    'Reassigned from Eli to Erin',
  )
  assert.equal(rfiEventSummary({ event_type: 'reopened', details: {} }), 'Clarification requested')
})

test('workflow messages pass through; raw database errors do not', () => {
  assert.equal(rfiDbError({ code: '40001', message: 'This question changed since you opened it.' }), 'This question changed since you opened it.')
  assert.equal(rfiDbError({ code: 'P0001', message: 'Choose who should answer before sending.' }), 'Choose who should answer before sending.')
  assert.equal(rfiDbError({ code: '42501', message: 'This question is not available.' }), 'This question is not available.')
  assert.equal(rfiDbError({ code: '42501', message: 'permission denied for table project_rfis' }), 'You do not have permission to do that.')
  assert.equal(rfiDbError({ code: 'XX000', message: 'internal detail' }), 'Something went wrong. Please try again.')
  assert.match(rfiDbError({ code: 'PGRST202', message: 'function not found' }), /not set up/)
})
