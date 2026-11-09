import { test } from 'node:test'
import assert from 'node:assert/strict'
import { invoiceDetailHref, invoicePrintHref, invoiceReturnTarget } from './invoice-return.ts'

const PID = '3f1c2a7e-1b2c-4d5e-8f90-123456789abc'

test('direct links fall back to the global invoice list', () => {
  assert.deepEqual(invoiceReturnTarget(undefined), { href: '/invoices', label: 'Back to invoices' })
  assert.equal(invoiceReturnTarget(['/invoices', '/x']).href, '/invoices')
})

test('preserves a valid status filter from the global list', () => {
  assert.equal(invoiceReturnTarget('/invoices?status=overdue').href, '/invoices?status=overdue')
  assert.equal(invoiceReturnTarget('/invoices?status=bogus').href, '/invoices')
})

test('preserves search and page from the global list', () => {
  assert.equal(
    invoiceReturnTarget('/invoices?status=issued&q=smith+kitchen&page=3').href,
    '/invoices?status=issued&q=smith+kitchen&page=3',
  )
  assert.equal(invoiceReturnTarget('/invoices?page=abc&q=').href, '/invoices')
  assert.equal(invoiceReturnTarget('/invoices?page=1').href, '/invoices')
})

test('returns to the project invoices panel', () => {
  assert.deepEqual(invoiceReturnTarget(`/projects/${PID}`), {
    href: `/projects/${PID}#invoices-heading`,
    label: 'Back to project invoices',
  })
  assert.equal(invoiceReturnTarget('/projects/not-a-uuid').href, '/invoices')
})

test('rejects external and unknown destinations', () => {
  for (const bad of ['https://evil.test/invoices', '//evil.test/invoices', '/settings', 'javascript:alert(1)']) {
    assert.equal(invoiceReturnTarget(bad).href, '/invoices', bad)
  }
})

test('detail href round-trips the origin', () => {
  const href = invoiceDetailHref('abc', '/invoices?status=paid')
  assert.equal(href, '/invoices/abc?from=%2Finvoices%3Fstatus%3Dpaid')
  const from = new URL(href, 'http://local').searchParams.get('from') ?? undefined
  assert.equal(invoiceReturnTarget(from).href, '/invoices?status=paid')
  assert.equal(invoiceDetailHref('abc'), '/invoices/abc')
})

test('invoicePrintHref carries the validated return target', () => {
  assert.equal(invoicePrintHref('abc'), '/invoices/abc/print')
  assert.equal(invoicePrintHref('abc', '/invoices?status=paid'), '/invoices/abc/print?from=%2Finvoices%3Fstatus%3Dpaid')
})
