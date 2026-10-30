import { redirect } from 'next/navigation'
import { requireManager } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'
import { getInvoiceFormOptions } from '@/lib/invoice-form-data'
import { InvoiceForm } from '@/components/invoices/invoice-form'
import { RouteFormDrawer } from '@/components/shared/route-form-drawer'

export default async function NewInvoiceDrawer({
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

  return (
    <RouteFormDrawer
      kind="invoice"
      size="xl"
      title="New invoice"
      description="Saved as a draft. Homeowners see it only after you issue and share it."
    >
      <InvoiceForm
        projects={projects}
        estimates={estimates}
        defaults={{ project_id: preselected, estimate_id: preEstimate }}
        cancelHref={preselected ? `/projects/${preselected}` : '/invoices'}
      />
    </RouteFormDrawer>
  )
}
