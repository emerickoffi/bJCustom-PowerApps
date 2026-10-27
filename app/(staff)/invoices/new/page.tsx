import type { Metadata } from 'next'
import { Receipt } from 'lucide-react'
import { redirect } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { getInvoiceFormOptions } from '@/lib/invoice-form-data'
import { PageHeader } from '@/components/shared/page-header'
import { InvoiceForm } from '@/components/invoices/invoice-form'

export const metadata: Metadata = { title: 'New invoice' }

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; estimate?: string }>
}) {
  const session = await requireManager()
  if (!(await getInvoiceAccess(session)).canWrite) redirect('/invoices')
  const { project, estimate } = await searchParams
  const { projects, estimates } = await getInvoiceFormOptions(session.organizationId)
  const preselected = projects.find((p) => p.id === project)?.id
  const preEstimate = estimates.find((e) => e.id === estimate && e.project_id === preselected)?.id
  const back = preselected ? `/projects/${preselected}` : '/invoices'

  return (
    <div className="flex max-w-4xl flex-col gap-8">
      <PageHeader
        icon={Receipt}
        title="New invoice"
        description="Saved as a draft. Homeowners see it only after you issue and share it."
        backHref={back}
        backLabel={preselected ? 'Back to project' : 'Back to invoices'}
      />
      <InvoiceForm
        projects={projects}
        estimates={estimates}
        defaults={{ project_id: preselected, estimate_id: preEstimate }}
        cancelHref={back}
      />
    </div>
  )
}
