import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  invoiceFilterCounts,
  invoiceListHref,
  matchesInvoiceFilter,
  matchesInvoiceSearch,
  paginate,
  parseInvoiceListState,
} from './invoice-list-filters.ts'

const PAST = '2000-01-01'
const FUTURE = '2999-01-01'

function inv(status: 'draft' | 'issued' | 'partially_paid' | 'paid' | 'voided', due = FUTURE, extra = {}) {
  return {
    status,
    due_date: due,
    invoice_number: 'INV-1001',
    title: 'Kitchen draw',
    project: { name: 'Maple Street Remodel', project_number: 'P-22' },
    clientName: 'Dana Smith',
    ...extra,
  }
}

test('an overdue issued invoice appears in Issued, All, and overdue only', () => {
  const row = inv('issued', PAST)
  assert.equal(matchesInvoiceFilter(row, 'issued'), true)
  assert.equal(matchesInvoiceFilter(row, undefined, true), true)
  assert.equal(matchesInvoiceFilter(row, undefined), true)
})

test('paid, voided, and draft invoices past due are never overdue', () => {
  for (const s of ['paid', 'voided', 'draft'] as const) {
    assert.equal(matchesInvoiceFilter(inv(s, PAST), undefined, true), false, s)
  }
  assert.equal(matchesInvoiceFilter(inv('partially_paid', PAST), undefined, true), true)
})

test('counts cover the searched set, not the selected status or page', () => {
  const rows = [inv('issued', PAST), inv('issued'), inv('paid'), inv('draft'), inv('voided', PAST)]
  const counts = invoiceFilterCounts(rows)
  assert.deepEqual(counts, { all: 5, draft: 1, issued: 2, partially_paid: 0, paid: 1, voided: 1, overdue: 1 })
})

test('search matches number, title, project, and homeowner', () => {
  const row = inv('issued')
  for (const q of ['inv-1001', 'kitchen', 'maple', 'p-22', 'smith', '  DANA ']) {
    assert.equal(matchesInvoiceSearch(row, q), true, q)
  }
  assert.equal(matchesInvoiceSearch(row, 'bathroom'), false)
  assert.equal(matchesInvoiceSearch({ ...row, project: null }, 'maple'), false)
})

test('parses and clamps URL state', () => {
  assert.deepEqual(parseInvoiceListState({ status: 'bogus', page: '-1' }), {
    status: undefined,
    overdue: false,
    q: '',
    page: 1,
  })
  assert.deepEqual(parseInvoiceListState({ status: 'issued', overdue: '1' }), {
    status: 'issued',
    overdue: true,
    q: '',
    page: 1,
  })
  assert.equal(invoiceListHref({ status: 'paid', q: 'a b', page: 1 }), '/invoices?status=paid&q=a+b')
  assert.equal(invoiceListHref({ status: 'issued', overdue: true, page: 2 }), '/invoices?status=issued&overdue=1&page=2')
  assert.equal(invoiceListHref({}), '/invoices')
})

test('legacy status=overdue links map to All + overdue only', () => {
  assert.deepEqual(parseInvoiceListState({ status: 'overdue', q: ' x ', page: '2' }), {
    status: undefined,
    overdue: true,
    q: 'x',
    page: 2,
  })
})

test('overdue combines with status using AND', () => {
  const late = inv('issued', PAST)
  const partialLate = inv('partially_paid', PAST)
  const onTime = inv('issued')
  assert.equal(matchesInvoiceFilter(late, 'issued', true), true)
  assert.equal(matchesInvoiceFilter(partialLate, 'partially_paid', true), true)
  assert.equal(matchesInvoiceFilter(onTime, 'issued', true), false)
  assert.equal(matchesInvoiceFilter(late, 'partially_paid', true), false)
  for (const s of ['paid', 'voided', 'draft'] as const) {
    assert.equal(matchesInvoiceFilter(inv(s, PAST), s, true), false, s)
  }
})

test('counts reflect the other active control', () => {
  const rows = [inv('issued', PAST), inv('issued'), inv('partially_paid', PAST), inv('paid', PAST)]
  assert.deepEqual(invoiceFilterCounts(rows, { overdue: true }), {
    all: 2,
    draft: 0,
    issued: 1,
    partially_paid: 1,
    paid: 0,
    voided: 0,
    overdue: 2,
  })
  assert.equal(invoiceFilterCounts(rows, { status: 'issued' }).overdue, 1)
  assert.equal(invoiceFilterCounts(rows, { status: 'paid' }).overdue, 0)
})

test('pagination clamps out-of-range pages', () => {
  const rows = Array.from({ length: 30 }, (_, i) => i)
  assert.deepEqual(paginate(rows, 9, 25), { rows: rows.slice(25), page: 2, pageCount: 2 })
  assert.equal(paginate([], 1, 25).pageCount, 1)
})
