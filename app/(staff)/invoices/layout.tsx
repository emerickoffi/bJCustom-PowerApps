import { Archive } from 'lucide-react'
import { requireStaff } from '@/lib/session'
import { getInvoiceAccess } from '@/lib/invoice-access'

export default async function InvoicesLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const session = await requireStaff()
  const { archive } = await getInvoiceAccess(session)
  return (
    <div className="flex flex-col gap-6">
      {archive && (
        <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <Archive className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            The Invoices module is turned off. As an admin you can still view existing invoices and payments, read-only.
            Turn it back on in Settings → Features to make changes.
          </p>
        </div>
      )}
      {children}
      {modal}
    </div>
  )
}
