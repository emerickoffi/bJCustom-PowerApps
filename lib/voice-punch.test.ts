import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVoiceDraft, matchAssignees, mergeDecision, pickRecordingMime, reviewProposedDate } from './voice-punch.ts'

const people = [
  { value: 'u1', label: 'Mike Smith · Smith Cabinets · Subcontractor' },
  { value: 'u2', label: 'Mike Jones · Builder Co · Superintendent' },
  { value: 'u3', label: 'Ana Lopez · Builder Co · PM' },
]

test('matches only eligible people and returns every candidate when ambiguous', () => {
  assert.deepEqual(matchAssignees('Mike Smith', people).map((p) => p.value), ['u1'])
  assert.deepEqual(matchAssignees('Mike', people).map((p) => p.value), ['u1', 'u2'])
  assert.deepEqual(matchAssignees('the cabinet contractor', people), [])
  assert.deepEqual(matchAssignees("Ana's crew", people).map((p) => p.value), ['u3'])
  assert.deepEqual(matchAssignees(null, people), [])
})

test('company names in the label are not treated as the person', () => {
  assert.deepEqual(matchAssignees('Smith Cabinets', people).map((p) => p.value), ['u1'])
  assert.deepEqual(matchAssignees('Builder', people), [])
})

test('keeps a proposed due date only when valid, upcoming, and unambiguous', () => {
  const today = '2026-11-12'
  assert.deepEqual(reviewProposedDate({ phrase: 'Friday', date: '2026-11-13', ambiguous: false }, today), { phrase: 'Friday', date: '2026-11-13', needsReview: false })
  assert.equal(reviewProposedDate({ phrase: 'last Monday', date: '2026-11-09', ambiguous: false }, today).needsReview, true)
  assert.equal(reviewProposedDate({ phrase: 'Friday', date: '2026-02-30', ambiguous: false }, today).date, null)
  assert.equal(reviewProposedDate({ phrase: 'next Friday', date: '2026-11-20', ambiguous: true }, today).date, null)
  assert.deepEqual(reviewProposedDate({ phrase: null, date: '2026-11-13', ambiguous: false }, today), { phrase: null, date: null, needsReview: false })
})

test('never overwrites user-entered values silently', () => {
  assert.equal(mergeDecision('', 'Scratched vanity'), 'fill')
  assert.equal(mergeDecision('My title', 'Scratched vanity'), 'conflict')
  assert.equal(mergeDecision('Scratched vanity', 'Scratched vanity '), 'skip')
  assert.equal(mergeDecision('My title', ''), 'skip')
})

test('builds a draft from the spoken example', () => {
  const draft = buildVoiceDraft(
    {
      title: 'Scratched vanity door',
      description: 'The vanity door is scratched.',
      location: 'Upstairs bathroom',
      assigneeMention: 'the cabinet contractor',
      dueDate: { phrase: 'Friday', date: '2026-11-13', ambiguous: false },
    },
    '2026-11-12',
    people,
  )
  assert.equal(draft.location, 'Upstairs bathroom')
  assert.deepEqual(draft.assignee, { mention: 'the cabinet contractor', matches: [] })
  assert.equal(draft.dueDate.date, '2026-11-13')
})

test('picks the first recording format the browser supports', () => {
  assert.equal(pickRecordingMime((t) => t === 'audio/mp4'), 'audio/mp4')
  assert.equal(pickRecordingMime(() => true), 'audio/webm;codecs=opus')
  assert.equal(pickRecordingMime(() => false), null)
})
