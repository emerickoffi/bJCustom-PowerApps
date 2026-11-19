/**
 * Pure mapping from Trefort records to QuickBooks Online API payloads. Money stays in integer cents until the
 * final conversion to dollars, which QuickBooks expects as decimal numbers.
 */

export type QboClient = {
  first_name: string
  last_name: string
  company_name: string | null
  email: string | null
  phone: string | null
  address_line1: string | null
  address_line2: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country: string | null
}

export type QboInvoiceSource = {
  invoice_number: string
  title: string | null
  invoice_date: string
  due_date: string | null
  status: string
  tax_cents: number
  total_cents: number
  notes: string | null
  project_name: string | null
  lines: { description: string; quantity: number; unit_rate_cents: number; amount_cents: number; position: number }[]
}

export type QboPaymentSource = {
  payment_date: string
  amount_cents: number
  method: string | null
  reference: string | null
}

const dollars = (cents: number) => Math.round(cents) / 100

/** QuickBooks caps several text fields; trim rather than fail. */
const cap = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').trim()
  return t.length > n ? t.slice(0, n) : t
}

export function customerDisplayName(c: Pick<QboClient, 'first_name' | 'last_name' | 'company_name'>): string {
  const person = `${c.first_name} ${c.last_name}`.trim()
  return cap(c.company_name?.trim() ? c.company_name : person, 100)
}

/** Escapes a value for a QuickBooks query string literal. */
export function qboQueryLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

export function toQboCustomer(c: QboClient) {
  const body: Record<string, unknown> = {
    DisplayName: customerDisplayName(c),
    GivenName: cap(c.first_name, 100),
    FamilyName: cap(c.last_name, 100),
  }
  if (c.company_name?.trim()) body.CompanyName = cap(c.company_name, 100)
  if (c.email?.trim()) body.PrimaryEmailAddr = { Address: cap(c.email, 100) }
  if (c.phone?.trim()) body.PrimaryPhone = { FreeFormNumber: cap(c.phone, 30) }
  if (c.address_line1?.trim()) {
    body.BillAddr = {
      Line1: cap(c.address_line1, 500),
      ...(c.address_line2?.trim() ? { Line2: cap(c.address_line2, 500) } : {}),
      ...(c.city?.trim() ? { City: cap(c.city, 255) } : {}),
      ...(c.state?.trim() ? { CountrySubDivisionCode: cap(c.state, 255) } : {}),
      ...(c.postal_code?.trim() ? { PostalCode: cap(c.postal_code, 30) } : {}),
      ...(c.country?.trim() ? { Country: cap(c.country, 255) } : {}),
    }
  }
  return body
}

export type InvoiceCheck = { ok: true } | { ok: false; reason: string }

export function canSendInvoice(inv: Pick<QboInvoiceSource, 'status' | 'tax_cents' | 'lines'>): InvoiceCheck {
  if (inv.status === 'draft') return { ok: false, reason: 'Issue the invoice before sending it to QuickBooks.' }
  if (inv.tax_cents > 0) {
    return { ok: false, reason: 'Invoices with sales tax can’t be sent yet. Enter this one in QuickBooks so its tax settings apply.' }
  }
  if (!inv.lines.length) return { ok: false, reason: 'This invoice has no line items.' }
  return { ok: true }
}

export function toQboInvoice(inv: QboInvoiceSource, customerId: string, itemId: string) {
  const lines = [...inv.lines]
    .sort((a, b) => a.position - b.position)
    .map((l) => {
      // QuickBooks rejects a line whose Amount differs from Qty × UnitPrice, so only send the
      // quantity breakdown when it multiplies out exactly in cents.
      const exact = Number.isFinite(l.quantity) && l.quantity > 0 && Math.round(l.quantity * l.unit_rate_cents) === l.amount_cents
      return {
        DetailType: 'SalesItemLineDetail',
        Amount: dollars(l.amount_cents),
        Description: cap(l.description, 4000),
        SalesItemLineDetail: {
          ItemRef: { value: itemId },
          ...(exact ? { Qty: l.quantity, UnitPrice: dollars(l.unit_rate_cents) } : { Qty: 1, UnitPrice: dollars(l.amount_cents) }),
        },
      }
    })
  const memo = [inv.project_name ? `Project: ${inv.project_name}` : null, inv.title].filter(Boolean).join(' — ')
  return {
    CustomerRef: { value: customerId },
    DocNumber: cap(inv.invoice_number, 21),
    TxnDate: inv.invoice_date,
    ...(inv.due_date ? { DueDate: inv.due_date } : {}),
    Line: lines,
    ...(memo ? { CustomerMemo: { value: cap(memo, 1000) } } : {}),
    PrivateNote: cap(`Sent from Trefort (${inv.invoice_number})`, 4000),
  }
}

export function invoiceLinesTotalCents(inv: Pick<QboInvoiceSource, 'lines'>): number {
  return inv.lines.reduce((s, l) => s + l.amount_cents, 0)
}

export function toQboPayment(p: QboPaymentSource, customerId: string, qboInvoiceId: string) {
  const note = [p.method ? `Method: ${p.method}` : null, 'Recorded in Trefort'].filter(Boolean).join(' · ')
  return {
    CustomerRef: { value: customerId },
    TotalAmt: dollars(p.amount_cents),
    TxnDate: p.payment_date,
    ...(p.reference?.trim() ? { PaymentRefNum: cap(p.reference, 21) } : {}),
    PrivateNote: cap(note, 4000),
    Line: [{ Amount: dollars(p.amount_cents), LinkedTxn: [{ TxnId: qboInvoiceId, TxnType: 'Invoice' }] }],
  }
}

/** Picks the income account for the Trefort service item: a services or sales account if there is one. */
export function pickIncomeAccount(accounts: { Id: string; Name: string; Active?: boolean }[]): string | null {
  const active = accounts.filter((a) => a.Active !== false)
  const preferred = active.find((a) => /service/i.test(a.Name)) ?? active.find((a) => /sales|income|revenue/i.test(a.Name))
  return (preferred ?? active[0])?.Id ?? null
}

/** Turns a QuickBooks error response into a short message a contractor can act on. */
export function qboErrorMessage(status: number, body: unknown): string {
  const fault = (body as { Fault?: { Error?: { Message?: string; Detail?: string; code?: string }[] } } | null)?.Fault?.Error?.[0]
  if (status === 401) return 'QuickBooks needs to be reconnected.'
  if (fault?.code === '6240') return 'A customer with this name already exists in QuickBooks as a vendor or employee. Rename one of them and try again.'
  if (fault?.code === '6140') return 'QuickBooks already has an invoice with this number.'
  const text = fault?.Detail || fault?.Message
  return text ? `QuickBooks said: ${cap(text, 300)}` : `QuickBooks returned an error (${status}).`
}
