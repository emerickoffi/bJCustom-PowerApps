import { redirect } from 'next/navigation'
import { getOrgFeatures } from '@/lib/features'
import { canManage, type StaffSession } from '@/lib/session'

export async function getInvoiceAccess(session: StaffSession) {
  const features = await getOrgFeatures(session.organizationId)
  const enabled = features.invoices
  const archive = !enabled && session.role === 'org_admin'
  if (!enabled && !archive) redirect('/dashboard')
  return { enabled, archive, canWrite: enabled && canManage(session.role) }
}
