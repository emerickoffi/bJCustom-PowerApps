import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { billBalance, commitmentBilledCents, summarizeBills, type BillBalance, type BillsOverview } from '@/lib/vendor-bills'

const n = (v: unknown) => Number(v ?? 0)

export type PaymentRecord = {
  id: string
  paymentDate: string
  amountCents: number
  method: string
  reference: string | null
  notes: string | null
  reversedAt: string | null
  reversalReason: string | null
  createdAt: string
}

export type BillRecord = {
  id: string
  vendorName: string
  billNumber: string | null
  billDate: string
  dueDate: string | null
  description: string | null
  notes: string | null
  amountCents: number
  category: string
  status: string
  commitmentId: string | null
  commitmentLabel: string | null
  attachment: { documentId: string; versionId: string | null; name: string } | null
  createdAt: string
  approvedAt: string | null
  voidedAt: string | null
  voidReason: string | null
  payments: PaymentRecord[]
} & BillBalance

export type CommitmentRecord = {
  id: string
  vendorName: string
  description: string
  amountCents: number
  billedCents: number
  remainingCents: number
  category: string
  status: string
  type: string
  source: 'quote' | 'manual'
  notes: string | null
  effectiveDate: string | null
  createdAt: string
  approvedAt: string | null
}

export type ProjectBillsData =
  | { available: false }
  | { available: true; bills: BillRecord[]; commitments: CommitmentRecord[]; overview: BillsOverview; vendorSuggestions: string[]; today: string }

function isMissingSchema(error: { code?: string } | null) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || error?.code === '42703'
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** Reads the same tables job costing reads, so the bill and commitment lists always reconcile with the summary. */
export async function loadProjectBills(projectId: string): Promise<ProjectBillsData> {
  const supabase = await createClient()
  const [commitments, bills, payments] = await Promise.all([
    supabase
      .from('project_commitments')
      .select('id, vendor_name, description, amount_cents, cost_category, status, commitment_type, source_quote_award_id, notes, effective_date, created_at, approved_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vendor_bills')
      .select(
        'id, vendor_name, bill_number, bill_date, due_date, description, notes, amount_cents, cost_category, status, commitment_id, attachment_document_id, created_at, approved_at, voided_at, void_reason, project_documents(id, name, project_document_versions(id, version_number))',
      )
      .eq('project_id', projectId)
      .order('bill_date', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase
      .from('vendor_payments')
      .select('id, bill_id, payment_date, amount_cents, method, reference, notes, reversed_at, reversal_reason, created_at')
      .eq('project_id', projectId)
      .order('payment_date', { ascending: false }),
  ])
  const results = [commitments, bills, payments]
  if (results.some((r) => isMissingSchema(r.error))) return { available: false }
  const failed = results.find((r) => r.error)
  if (failed?.error) throw new Error(`Vendor bills could not be loaded: ${failed.error.message}`)

  const today = todayIso()
  const billRows = bills.data ?? []
  const billedInput = billRows.map((b) => ({ commitment_id: b.commitment_id, status: b.status, amount_cents: n(b.amount_cents) }))

  const commitmentRecords: CommitmentRecord[] = (commitments.data ?? []).map((c) => {
    const amountCents = n(c.amount_cents)
    const billedCents = commitmentBilledCents(c.id, billedInput)
    return {
      id: c.id,
      vendorName: c.vendor_name,
      description: c.description,
      amountCents,
      billedCents,
      remainingCents: c.status === 'approved' ? Math.max(amountCents - billedCents, 0) : 0,
      category: c.cost_category,
      status: c.status,
      type: c.commitment_type,
      source: c.source_quote_award_id ? 'quote' : 'manual',
      notes: c.notes,
      effectiveDate: c.effective_date,
      createdAt: c.created_at,
      approvedAt: c.approved_at,
    }
  })
  const commitmentLabel = new Map(commitmentRecords.map((c) => [c.id, `${c.vendorName} — ${c.description}`]))

  const paymentsByBill = new Map<string, PaymentRecord[]>()
  for (const p of payments.data ?? []) {
    const list = paymentsByBill.get(p.bill_id) ?? []
    list.push({
      id: p.id,
      paymentDate: p.payment_date,
      amountCents: n(p.amount_cents),
      method: p.method,
      reference: p.reference,
      notes: p.notes,
      reversedAt: p.reversed_at,
      reversalReason: p.reversal_reason,
      createdAt: p.created_at,
    })
    paymentsByBill.set(p.bill_id, list)
  }

  const billRecords: BillRecord[] = billRows.map((b) => {
    const billPayments = paymentsByBill.get(b.id) ?? []
    const balance = billBalance(
      { status: b.status, amount_cents: n(b.amount_cents), due_date: b.due_date },
      billPayments.map((p) => ({ amount_cents: p.amountCents, reversed: p.reversedAt !== null })),
      today,
    )
    const doc = b.project_documents as unknown as { id: string; name: string; project_document_versions: { id: string; version_number: number }[] } | null
    const latest = doc?.project_document_versions?.slice().sort((x, y) => y.version_number - x.version_number)[0]
    return {
      id: b.id,
      vendorName: b.vendor_name,
      billNumber: b.bill_number,
      billDate: b.bill_date,
      dueDate: b.due_date,
      description: b.description,
      notes: b.notes,
      amountCents: n(b.amount_cents),
      category: b.cost_category,
      commitmentId: b.commitment_id,
      commitmentLabel: b.commitment_id ? (commitmentLabel.get(b.commitment_id) ?? null) : null,
      attachment: doc ? { documentId: doc.id, versionId: latest?.id ?? null, name: doc.name } : null,
      createdAt: b.created_at,
      approvedAt: b.approved_at,
      voidedAt: b.voided_at,
      voidReason: b.void_reason,
      payments: billPayments,
      ...balance,
    }
  })

  const vendorSuggestions = [...new Set([...commitmentRecords.map((c) => c.vendorName), ...billRecords.map((b) => b.vendorName)])].sort((a, b) => a.localeCompare(b))

  return { available: true, bills: billRecords, commitments: commitmentRecords, overview: summarizeBills(billRecords), vendorSuggestions, today }
}
