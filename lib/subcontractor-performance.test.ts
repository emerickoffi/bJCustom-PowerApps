import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comparePerformance, formatRating, overallRating, parseStars, summarizePerformance } from './subcontractor-performance.ts'

test('overall averages all five criteria', () => {
  assert.equal(overallRating({ quality: 5, timeliness: 4, communication: 3, professionalism: 5, issue_resolution: 3 }), 4)
})

test('overall excludes issue resolution when not applicable', () => {
  assert.equal(overallRating({ quality: 5, timeliness: 4, communication: 4, professionalism: 4, issue_resolution: null }), 4.25)
})

test('summary averages criteria and skips N/A issue resolution', () => {
  const s = summarizePerformance([
    { overall_rating: 4, quality: 4, timeliness: 4, communication: 4, professionalism: 4, issue_resolution: 4 },
    { overall_rating: 5, quality: 5, timeliness: 5, communication: 5, professionalism: 5, issue_resolution: null },
  ])
  assert.equal(s.count, 2)
  assert.equal(s.average, 4.5)
  assert.equal(s.criteria.quality, 4.5)
  assert.equal(s.criteria.issue_resolution, 4)
})

test('empty summary has no average', () => {
  const s = summarizePerformance([])
  assert.equal(s.average, null)
  assert.equal(formatRating(s.average), '–')
})

test('sorting puts rated companies first, highest first', () => {
  const rated = (average: number, count = 1) => ({ average, count, criteria: {} as never })
  const list = [undefined, rated(3.5), rated(4.8), rated(4.8, 3)]
  list.sort(comparePerformance)
  assert.deepEqual(list.map((s) => s && [s.average, s.count]), [[4.8, 3], [4.8, 1], [3.5, 1], undefined])
})

test('parses star inputs strictly', () => {
  assert.equal(parseStars('4'), 4)
  assert.equal(parseStars('0'), undefined)
  assert.equal(parseStars('4.5'), undefined)
  assert.equal(parseStars('na'), undefined)
  assert.equal(parseStars('na', { allowNa: true }), null)
})
