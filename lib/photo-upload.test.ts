import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PHOTO_DOWNSCALE_MIN_BYTES,
  PHOTO_MAX_EDGE,
  canDownscale,
  retryableItems,
  runUploadBatch,
  shouldDownscale,
  targetDimensions,
  uploadSummary,
  type UploadOutcome,
} from './photo-upload.ts'

const MB = 1024 * 1024

test('only large lossy photos beyond the edge limit are downscaled', () => {
  assert.equal(shouldDownscale({ type: 'image/jpeg', size: 5 * MB, width: 4032, height: 3024 }), true)
  assert.equal(shouldDownscale({ type: 'image/webp', size: 5 * MB, width: 4032, height: 3024 }), true)
  assert.equal(shouldDownscale({ type: 'image/jpeg', size: PHOTO_DOWNSCALE_MIN_BYTES, width: 4032, height: 3024 }), false)
  assert.equal(shouldDownscale({ type: 'image/jpeg', size: 8 * MB, width: PHOTO_MAX_EDGE, height: 2000 }), false)
  assert.equal(shouldDownscale({ type: 'image/png', size: 9 * MB, width: 5000, height: 4000 }), false)
  assert.equal(shouldDownscale({ type: 'image/heic', size: 9 * MB, width: 5000, height: 4000 }), false)
  assert.equal(canDownscale('video/mp4'), false)
})

test('target dimensions keep aspect ratio and never upscale', () => {
  assert.deepEqual(targetDimensions(4032, 3024), { width: 3072, height: 2304 })
  assert.deepEqual(targetDimensions(3024, 4032), { width: 2304, height: 3072 })
  assert.deepEqual(targetDimensions(1200, 900), { width: 1200, height: 900 })
  assert.deepEqual(targetDimensions(0, 0), { width: 0, height: 0 })
})

test('a batch keeps every successful upload when some fail', async () => {
  const outcomes: Record<string, UploadOutcome> = {
    a: { ok: true },
    b: { ok: false, reason: 'network', retryable: true },
    c: { ok: true },
    d: { ok: false, reason: 'too big', retryable: false },
  }
  const result = await runUploadBatch(['a', 'b', 'c', 'd'], async (item) => outcomes[item])
  assert.deepEqual(result.uploaded, ['a', 'c'])
  assert.deepEqual(
    result.failed.map((f) => f.item),
    ['b', 'd'],
  )
})

test('a thrown upload is reported as a retryable failure and the batch continues', async () => {
  const result = await runUploadBatch(['a', 'b'], async (item) => {
    if (item === 'a') throw new Error('offline')
    return { ok: true }
  })
  assert.deepEqual(result.uploaded, ['b'])
  assert.equal(result.failed[0].item, 'a')
  assert.equal(result.failed[0].retryable, true)
})

test('retry sends only retryable failures, never files that already uploaded', async () => {
  const sent: string[] = []
  let attempt = 0
  const first = await runUploadBatch(['a', 'b', 'c'], async (item) => {
    sent.push(item)
    if (item === 'b') return { ok: false, reason: 'network', retryable: true }
    if (item === 'c') return { ok: false, reason: 'not a photo', retryable: false }
    return { ok: true }
  })
  const again = retryableItems(first.failed)
  assert.deepEqual(again, ['b'])
  const second = await runUploadBatch(again, async (item) => {
    sent.push(item)
    attempt++
    return { ok: true }
  })
  assert.deepEqual(second.uploaded, ['b'])
  assert.equal(attempt, 1)
  assert.deepEqual(sent, ['a', 'b', 'c', 'b'])
})

test('progress reports each step and completion', async () => {
  const steps: string[] = []
  await runUploadBatch(['a', 'b'], async () => ({ ok: true }), (done, total) => steps.push(`${done}/${total}`))
  assert.deepEqual(steps, ['0/2', '1/2', '2/2'])
})

test('upload summary wording', () => {
  assert.equal(uploadSummary(3, 0), '3 photos added.')
  assert.equal(uploadSummary(0, 1), '1 photo could not be uploaded.')
  assert.equal(uploadSummary(2, 1), '2 photos added. 1 photo could not be uploaded.')
})
