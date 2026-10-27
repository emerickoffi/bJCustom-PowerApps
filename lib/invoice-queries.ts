import { createClient } from '@/lib/supabase/server'
import type { DrawMilestone, InvoiceStatus, PaymentMethod } from '@/lib/invoices'

export type BillTo = {
  name?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}

export type InvoiceRow = {
  id: string
  organization_id: string
  project_id: string
  client_id: string
  estimate_id: string | null
  invoice_number: string
  invoice_type: 'standard' | 'draw'
  draw_milestone: DrawMilestone | null
  title: string
  invoice_date: string
  due_date: string
  payment_terms: string | null
  payment_instructions: string | null
  notes: string | null
  tax_percent: number
  subtotal_cents: number
  taxable_subtotal_cents: number
  tax_cents: number
  total_cents: number
  paid_cents: number
  status: InvoiceStatus
  portal_published: boolean
  issue_version: number
  issued_at: string | null
  bill_to: BillTo | null
  voided_at: string | null
  void_reason: string | null
  accounting_sync_status: string
  created_at: string
  project: {
    id: string
    name: string
    project_number: string | null
    address_line1: string | null
    address_line2: string | null
    city: string | null
    state: string | null
    postal_code: string | null
  } | null
  client: { id: string; first_name: string; last_name: string; email: string | null } | null
  estimate: { id: string; name: string; estimate_number: string | null; construction_total_cents: number } | null
}

export type InvoiceLine = {
  id: string
  position: number
  description: string
  quantity: number
  unit_rate_cents: number
  amount_cents: number
  taxable: boolean
}

export type InvoicePayment = {
  id: string
  payment_date: string
  amount_cents: number
  method: PaymentMethod
  reference: string | null
  notes: string | null
  created_at: string
  reversed_at: string | null
  reversal_reason: string | null
}

export type InvoiceEvent = {
  id: string
  event_type: string
  details: string | null
  amount_cents: number | null
  created_at: string
}

const INVOICE_SELECT = `*,
  project:projects(id, name, project_number, address_line1, address_line2, city, state, postal_code),
  client:clients(id, first_name, last_name, email),
  estimate:estimates(id, name, estimate_number, construction_total_cents)`

export async function listInvoices(
  organizationId: string,
  filters: { projectId?: string; status?: string } = {},
) {
  const supabase = await createClient()
  let query = supabase
    .from('invoices')
    .select(INVOICE_SELECT)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (filters.projectId) query = query.eq('project_id', filters.projectId)
  if (filters.status) query = query.eq('status', filters.status)
  const { data } = await query
  return (data ?? []) as InvoiceRow[]
}

export async function getInvoice(id: string, organizationId?: string) {
  const supabase = await createClient()
  let query = supabase.from('invoices').select(INVOICE_SELECT).eq('id', id)
  if (organizationId) query = query.eq('organization_id', organizationId)
  const { data: invoice } = await query.maybeSingle()
  if (!invoice) return null
  const [lines, payments] = await Promise.all([
    supabase.from('invoice_line_items').select('*').eq('invoice_id', id).order('position'),
    supabase.from('invoice_payments').select('*').eq('invoice_id', id).order('payment_date').order('created_at'),
  ])
  return {
    invoice: invoice as InvoiceRow,
    lines: (lines.data ?? []) as InvoiceLine[],
    payments: (payments.data ?? []) as InvoicePayment[],
  }
}

export async function getInvoiceEvents(id: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('invoice_events')
    .select('id, event_type, details, amount_cents, created_at')
    .eq('invoice_id', id)
    .order('created_at', { ascending: false })
  return (data ?? []) as InvoiceEvent[]
}

export type BillableEstimate = {
  id: string
  project_id: string
  name: string
  estimate_number: string | null
  construction_total_cents: number
  billed_cents: number
}

/** Approved estimates with how much has already been billed on non-draft, non-voided invoices. */
export async function listBillableEstimates(organizationId: string, excludeInvoiceId?: string) {
  const supabase = await createClient()
  const [{ data: estimates }, { data: billed }] = await Promise.all([
    supabase
      .from('estimates')
      .select('id, project_id, name, estimate_number, construction_total_cents')
      .eq('organization_id', organizationId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id, estimate_id, subtotal_cents')
      .eq('organization_id', organizationId)
      .not('estimate_id', 'is', null)
      .not('status', 'in', '(draft,voided)'),
  ])
  const billedBy = new Map<string, number>()
  for (const row of billed ?? []) {
    if (row.id === excludeInvoiceId || !row.estimate_id) continue
    billedBy.set(row.estimate_id, (billedBy.get(row.estimate_id) ?? 0) + row.subtotal_cents)
  }
  return (estimates ?? []).map((e) => ({ ...e, billed_cents: billedBy.get(e.id) ?? 0 })) as BillableEstimate[]
}

export function invoiceClientName(invoice: Pick<InvoiceRow, 'bill_to' | 'client'>) {
  if (invoice.bill_to?.name) return invoice.bill_to.name
  return invoice.client ? `${invoice.client.first_name} ${invoice.client.last_name}`.trim() : '—'
}
