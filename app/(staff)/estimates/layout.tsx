import { requireStaff } from '@/lib/session'
import { requireFeature } from '@/lib/features'

export default async function EstimatesLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const session = await requireStaff()
  await requireFeature(session.organizationId, 'estimates')
  return (
    <>
      {children}
      {modal}
    </>
  )
}
