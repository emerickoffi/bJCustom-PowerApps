import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  canSendInvoice, customerDisplayName, pickIncomeAccount, qboErrorMessage, qboQueryLiteral,
  toQboCustomer, toQboInvoice, toQboPayment, type QboInvoiceSource,
} from './quickbooks-mapping.ts'

const inv = (over: Partial<QboInvoiceSource> = {}): QboInvoiceSource => ({
  invoice_number: 'INV-0007',
  title: 'Draw 2',
  invoice_date: '2026-11-19',
  due_date: '2026-12-19',
  status: 'issued',
  tax_cents: 0,
  total_cents: 1250050,
  notes: null,
  project_name: 'Maple St',
  lines: [
    { description: 'Framing', quantity: 1, unit_rate_cents: 1000000, amount_cents: 1000000, position: 2 },
    { description: 'Lumber', quantity: 2.5, unit_rate_cents: 100020, amount_cents: 250050, position: 1 },
  ],
  ...over,
})

describe('QuickBooks mapping', () => {
  it('uses the company name, else the person, as the display name', () => {
    assert.equal(customerDisplayName({ first_name: 'Ana', last_name: 'Diaz', company_name: null }), 'Ana Diaz')
    assert.equal(customerDisplayName({ first_name: 'Ana', last_name: 'Diaz', company_name: ' Diaz Homes ' }), 'Diaz Homes')
  })

  it('escapes query literals', () => {
    assert.equal(qboQueryLiteral("O'Neil"), "'O\\'Neil'")
  })

  it('omits empty contact fields', () => {
    const c = toQboCustomer({ first_name: 'A', last_name: 'B', company_name: null, email: '', phone: null, address_line1: null, address_line2: null, city: null, state: null, postal_code: null, country: null })
    assert.deepEqual(Object.keys(c).sort(), ['DisplayName', 'FamilyName', 'GivenName'])
  })

  it('orders lines and keeps exact quantity breakdowns', () => {
    const body = toQboInvoice(inv(), 'C1', 'I1')
    assert.equal(body.Line[0].Description, 'Lumber')
    assert.equal(body.Line[0].Amount, 2500.5)
    assert.deepEqual(body.Line[0].SalesItemLineDetail, { ItemRef: { value: 'I1' }, Qty: 2.5, UnitPrice: 1000.2 })
    assert.equal(body.DocNumber, 'INV-0007')
  })

  it('falls back to qty 1 when quantity × rate does not equal the amount', () => {
    const body = toQboInvoice(inv({ lines: [{ description: 'x', quantity: 3, unit_rate_cents: 333, amount_cents: 1000, position: 1 }] }), 'C', 'I')
    assert.deepEqual(body.Line[0].SalesItemLineDetail, { ItemRef: { value: 'I' }, Qty: 1, UnitPrice: 10 })
  })

  it('refuses drafts and taxed invoices', () => {
    assert.equal(canSendInvoice(inv({ status: 'draft' })).ok, false)
    assert.equal(canSendInvoice(inv({ tax_cents: 5 })).ok, false)
    assert.equal(canSendInvoice(inv()).ok, true)
  })

  it('links payments to the invoice', () => {
    const p = toQboPayment({ payment_date: '2026-11-20', amount_cents: 50000, method: 'check', reference: '1042' }, 'C', 'Q9')
    assert.equal(p.TotalAmt, 500)
    assert.equal(p.PaymentRefNum, '1042')
    assert.deepEqual(p.Line[0].LinkedTxn, [{ TxnId: 'Q9', TxnType: 'Invoice' }])
  })

  it('prefers a services income account', () => {
    assert.equal(pickIncomeAccount([{ Id: '1', Name: 'Sales' }, { Id: '2', Name: 'Services' }]), '2')
    assert.equal(pickIncomeAccount([{ Id: '1', Name: 'Other' }]), '1')
    assert.equal(pickIncomeAccount([]), null)
  })

  it('explains common QuickBooks errors', () => {
    assert.match(qboErrorMessage(401, null), /reconnected/)
    assert.match(qboErrorMessage(400, { Fault: { Error: [{ code: '6140', Message: 'Duplicate' }] } }), /invoice with this number/)
  })
})
