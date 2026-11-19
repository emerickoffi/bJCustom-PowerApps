import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dailyLogIdFromHref, dailyLogLabel, isDue, nextRetryDelay, sendOrder, statusText, waitingSummary } from './field-outbox-shared.ts'

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e'

describe('field outbox', () => {
  it('backs off retries up to 15 minutes', () => {
    assert.equal(nextRetryDelay(1), 15_000)
    assert.equal(nextRetryDelay(2), 30_000)
    assert.equal(nextRetryDelay(4), 120_000)
    assert.equal(nextRetryDelay(20), 15 * 60_000)
  })

  it('never resends items that need a person or are already sending', () => {
    assert.equal(isDue({ status: 'waiting', nextAttemptAt: 100 }, 200), true)
    assert.equal(isDue({ status: 'waiting', nextAttemptAt: 300 }, 200), false)
    assert.equal(isDue({ status: 'waiting', nextAttemptAt: 300 }, 200, true), true)
    assert.equal(isDue({ status: 'needs_attention', nextAttemptAt: 0 }, 200, true), false)
    assert.equal(isDue({ status: 'sending', nextAttemptAt: 0 }, 200, true), false)
    assert.equal(isDue({ status: 'photos_pending', nextAttemptAt: 0 }, 200), true)
  })

  it('sends oldest first', () => {
    const out = sendOrder([{ id: 'b', createdAt: 2 }, { id: 'a', createdAt: 1 }, { id: 'c', createdAt: 2 }])
    assert.deepEqual(out.map((x) => x.id), ['a', 'b', 'c'])
  })

  it('reads the saved log id from the redirect', () => {
    assert.equal(dailyLogIdFromHref(`/projects/p1/daily-logs/${ID}?saved=1#daily-log-photos`), ID)
    assert.equal(dailyLogIdFromHref(`/projects/p1/daily-logs/${ID.toUpperCase()}`), ID)
    assert.equal(dailyLogIdFromHref('/projects/p1/daily-logs/new'), null)
    assert.equal(dailyLogIdFromHref(null), null)
  })

  it('labels logs by date and describes status', () => {
    assert.equal(dailyLogLabel([['log_date', '2026-11-18']]), 'Daily log · Nov 18')
    assert.equal(dailyLogLabel([['log_date', 'bad']]), 'Daily log')
    const photo = { id: 'x', blob: new Blob(), fileName: 'a.jpg', mimeType: 'image/jpeg', caption: '' }
    assert.equal(statusText({ status: 'waiting', photos: [photo, photo], lastError: null }), 'Waiting to upload · 2 photos')
    assert.equal(statusText({ status: 'photos_pending', photos: [photo], lastError: null }), 'Saved. 1 photo still uploading')
    assert.equal(statusText({ status: 'needs_attention', photos: [], lastError: 'A daily log already exists' }), 'A daily log already exists')
    assert.deepEqual(waitingSummary([{ status: 'waiting' }, { status: 'needs_attention' }, { status: 'signed_out' }]), { count: 3, attention: 2 })
  })
})
