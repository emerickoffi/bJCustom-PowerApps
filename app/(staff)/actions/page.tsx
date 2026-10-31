import type { Metadata } from 'next'
import { canManage, requireStaff } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getActionItems } from '@/lib/attention-data'
import { isActionCategory, type ActionCategory } from '@/lib/action-items'
import { ActionCenter } from '@/components/dashboard/action-center'

export const metadata: Metadata = {
  title: 'Action Center',
  description: 'Everything waiting on you, across your projects.',
}

const PAGE_SIZE = 20

function actionsHref(category: ActionCategory | null, page = 1) {
  const params = new URLSearchParams()
  if (category) params.set('category', category)
  if (page > 1) params.set('page', String(page))
  const qs = params.toString()
  return qs ? `/actions?${qs}` : '/actions'
}

export default async function ActionsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; page?: string }>
}) {
  const session = await requireStaff()
  const query = await searchParams
  const selected = isActionCategory(query.category) ? query.category : null
  const page = Number.parseInt(query.page ?? '1', 10)
  const features = await getOrgFeatures(session.organizationId)
  const data = await getActionItems(session.organizationId, session.userId, {
    manager: canManage(session.role),
    features,
  })

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <ActionCenter
        items={data.items}
        totalIsLowerBound={data.totalIsLowerBound}
        unavailable={data.unavailable}
        selected={selected}
        limit={PAGE_SIZE}
        page={Number.isFinite(page) ? page : 1}
        links={{ href: actionsHref }}
        headingLevel="h1"
      />
    </div>
  )
}
