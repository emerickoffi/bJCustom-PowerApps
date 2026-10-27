import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { requireFeature } from '@/lib/features'

export default async function PortalInvoicesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session?.organizationId) redirect('/portal')
  await requireFeature(session.organizationId, 'invoices', '/portal')
  return children
}
