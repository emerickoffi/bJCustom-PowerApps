import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePortfolioStatus, portfolioStatusCounts, portfolioViewAllHref, rankPortfolio, type PortfolioRow, type PortfolioSignals } from './portfolio.ts'

const none: PortfolioSignals = { attention: new Set(), upcoming: new Map() }

function row(id: string, status: PortfolioRow['status'], updated_at = '2026-01-01T00:00:00Z'): PortfolioRow {
  return { id, status, updated_at }
}

test('never returns more than six projects', () => {
  const rows = Array.from({ length: 40 }, (_, i) => row(`p${String(i).padStart(2, '0')}`, 'under_construction'))
  assert.equal(rankPortfolio(rows, none, null).length, 6)
})

test('returns fewer than six when fewer exist', () => {
  assert.deepEqual(rankPortfolio([row('a', 'consultation')], none, null), ['a'])
})

test('attention beats upcoming beats active beats early pipeline beats completed beats cancelled', () => {
  const rows = [
    row('cancelled', 'cancelled', '2026-09-01T00:00:00Z'),
    row('done', 'completed', '2026-09-01T00:00:00Z'),
    row('lead', 'lead', '2026-09-01T00:00:00Z'),
    row('active', 'under_construction'),
    row('upcoming', 'preconstruction'),
    row('urgent', 'punch_list'),
  ]
  const signals: PortfolioSignals = { attention: new Set(['urgent']), upcoming: new Map([['upcoming', '2026-11-01']]) }
  assert.deepEqual(rankPortfolio(rows, signals, null), ['urgent', 'upcoming', 'active', 'lead', 'done', 'cancelled'])
})

test('attention on a closed project does not promote it', () => {
  const rows = [row('done', 'completed'), row('open', 'consultation')]
  const signals: PortfolioSignals = { attention: new Set(['done']), upcoming: new Map() }
  assert.deepEqual(rankPortfolio(rows, signals, null), ['open', 'done'])
})

test('upcoming projects are ordered by their real due date', () => {
  const rows = [row('later', 'under_construction'), row('sooner', 'under_construction')]
  const signals: PortfolioSignals = {
    attention: new Set(),
    upcoming: new Map([
      ['later', '2026-12-01'],
      ['sooner', '2026-11-02'],
    ]),
  }
  assert.deepEqual(rankPortfolio(rows, signals, null), ['sooner', 'later'])
})

test('status filter shows only matching projects, including completed', () => {
  const rows = [row('a', 'completed'), row('b', 'under_construction'), row('c', 'completed')]
  assert.deepEqual(rankPortfolio(rows, none, 'completed').sort(), ['a', 'c'])
})

test('fallback ordering is stable: newest update first, then id', () => {
  const rows = [row('b', 'planning'), row('a', 'planning'), row('z', 'planning', '2026-05-01T00:00:00Z')]
  assert.deepEqual(rankPortfolio(rows, none, null), ['z', 'a', 'b'])
})

test('status counts include only present statuses in lifecycle order', () => {
  const counts = portfolioStatusCounts([
    row('1', 'completed'),
    row('2', 'consultation'),
    row('3', 'consultation'),
    row('4', 'on_hold'),
  ])
  assert.deepEqual(counts, [
    { status: 'consultation', count: 2 },
    { status: 'completed', count: 1 },
    { status: 'on_hold', count: 1 },
  ])
})

test('unknown status values are ignored', () => {
  assert.equal(parsePortfolioStatus('bogus'), null)
  assert.equal(parsePortfolioStatus(undefined), null)
  assert.equal(parsePortfolioStatus('on_hold'), 'on_hold')
})

test('View All Projects carries the selected portfolio status and starts on page 1', () => {
  assert.equal(portfolioViewAllHref(null), '/projects')
  assert.equal(portfolioViewAllHref(parsePortfolioStatus('consultation')), '/projects?status=consultation')
  assert.equal(portfolioViewAllHref(parsePortfolioStatus('preconstruction')), '/projects?status=preconstruction')
  assert.equal(portfolioViewAllHref(parsePortfolioStatus('completed')), '/projects?status=completed')
  assert.equal(portfolioViewAllHref(parsePortfolioStatus('on_hold')), '/projects?status=on_hold')
  assert.equal(portfolioViewAllHref(parsePortfolioStatus('<script>')), '/projects')
  assert.ok(!portfolioViewAllHref('completed').includes('page='))
})
