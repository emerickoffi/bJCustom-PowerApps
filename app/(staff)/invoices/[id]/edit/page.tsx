import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Receipt } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { getInvoice } from '@/lib/invoice-queries'
import { getInvoiceFormOptions } from '@/lib/invoice-form-data'
import { centsToInput } from '@/lib/estimates'
import { PageHeader } from '@/components/shared/page-header'
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

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        icon={Receipt}
        title={`Edit ${invoice.invoice_number}`}
        description="Drafts can be changed freely until they are issued."
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
          })),
        }}
      />
    </div>
  )
}
