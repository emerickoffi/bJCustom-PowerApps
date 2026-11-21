import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { getInvoice } from '@/lib/invoice-queries'
import { getInvoiceFormOptions } from '@/lib/invoice-form-data'
import { centsToInput } from '@/lib/estimates'
import { createClient } from '@/lib/supabase/server'
import { sourcesLabel } from '@/lib/invoice-sources'
import type { InvoiceLineSource } from '@/lib/invoices'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { InvoiceForm } from '@/components/invoices/invoice-form'

export const metadata: Metadata = { title: 'Edit invoice' }

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound()
  const session = await requireManager()
  if (!(await getInvoiceAccess(session)).canWrite) redirect(`/invoices/${id}`)
  const data = await getInvoice(id, session.organizationId)
  if (!data) notFound()
  if (data.invoice.status !== 'draft') redirect(`/invoices/${id}`)
  const { invoice, lines } = data
  const { projects, estimates } = await getInvoiceFormOptions(session.organizationId, id)

  // What each line bills (Add from). Missing table (update not applied yet) just means no links.
  const supabase = await createClient()
  const { data: sourceRows } = await supabase.from('invoice_line_sources').select('line_id, source_type, source_id').eq('invoice_id', id)
  const byLine = new Map<string, InvoiceLineSource[]>()
  for (const r of (sourceRows ?? []) as { line_id: string; source_type: InvoiceLineSource['type']; source_id: string }[]) {
    byLine.set(r.line_id, [...(byLine.get(r.line_id) ?? []), { type: r.source_type, id: r.source_id }])
  }
  const coIds = [...new Set((sourceRows ?? []).filter((r) => r.source_type === 'change_order').map((r) => r.source_id as string))]
  const { data: coRows } = coIds.length
    ? await supabase.from('change_orders').select('id, co_number').in('id', coIds)
    : { data: [] as { id: string; co_number: string | null }[] }
  const coNumbers = new Map((coRows ?? []).map((c) => [c.id as string, (c.co_number as string | null) ?? 'change order']))

  return (
    <div className={pageLayout('form')}>
      <PageHeader
        icon={Receipt}
        title={`Edit ${invoice.invoice_number}`}
        backHref={`/invoices/${id}`}
        backLabel="Back to invoice"
      />
      <InvoiceForm
        projects={projects}
        estimates={estimates}
        cancelHref={`/invoices/${id}`}
        defaults={{
          id: invoice.id,
          project_id: invoice.project_id,
          estimate_id: invoice.estimate_id,
          invoice_type: invoice.invoice_type,
          draw_milestone: invoice.draw_milestone,
          title: invoice.title,
          invoice_date: invoice.invoice_date,
          due_date: invoice.due_date,
          tax_percent: String(Number(invoice.tax_percent)),
          payment_terms: invoice.payment_terms,
          payment_instructions: invoice.payment_instructions,
          notes: invoice.notes,
          lines: lines.map((l) => ({
            description: l.description,
            quantity: String(Number(l.quantity)),
            unitRate: centsToInput(l.unit_rate_cents),
            taxable: l.taxable,
            sources: byLine.get(l.id),
            sourceLabel: sourcesLabel(byLine.get(l.id) ?? [], coNumbers),
          })),
        }}
      />
    </div>
  )
}
