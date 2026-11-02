import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comparePerformance, formatRating, parseStars, ratingLabel, reviewCountLabel, summarizePerformance } from './subcontractor-performance.ts'

const row = (overall: number, cats: Partial<Record<string, number | null>> = {}) => ({
  overall_rating: overall,
  quality: null,
  schedule_reliability: null,
  communication: null,
  cleanliness: null,
  safety: null,
  ...cats,
})

test('overall average is the mean of submitted Overall ratings, independent of categories', () => {
  const s = summarizePerformance([row(5, { quality: 1, safety: 1 }), row(4), row(4)])
  assert.equal(s.count, 3)
  assert.equal(s.average, 4.33)
})

test('unassessed categories are excluded from category averages, never counted as zero', () => {
  const s = summarizePerformance([row(4, { quality: 4, safety: 5 }), row(5, { quality: 2 }), row(3)])
  assert.deepEqual(s.criteria.quality, { average: 3, count: 2 })
  assert.deepEqual(s.criteria.safety, { average: 5, count: 1 })
  assert.deepEqual(s.criteria.communication, { average: null, count: 0 })
})

test('no reviews yields no average', () => {
  const s = summarizePerformance([])
  assert.equal(s.average, null)
  assert.equal(formatRating(s.average), '–')
})

test('rated companies sort before unrated ones, higher averages first', () => {
  const a = summarizePerformance([row(4)])
  const b = summarizePerformance([row(5)])
  const list = [undefined, a, b]
  list.sort(comparePerformance)
  assert.deepEqual(list, [b, a, undefined])
})

test('parseStars accepts only integers 1 to 5', () => {
  assert.equal(parseStars('3'), 3)
  for (const bad of ['0', '6', '3.5', '-1', 'x', '']) assert.equal(parseStars(bad), undefined)
  assert.equal(parseStars('na', { allowNa: true }), null)
  assert.equal(parseStars('', { allowNa: true }), null)
  assert.equal(parseStars('7', { allowNa: true }), undefined)
})

test('labels', () => {
  assert.equal(reviewCountLabel(1), '1 review')
  assert.equal(reviewCountLabel(8), '8 reviews')
  assert.equal(ratingLabel(3), 'Meets expectations')
  assert.equal(ratingLabel(null), 'Not assessed')
})
