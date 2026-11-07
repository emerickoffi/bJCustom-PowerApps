import { requireStaff } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getIssueReportOptions, type IssueSource } from '@/lib/field-issues'
import { ReportIssueDrawer } from '@/components/issues/report-issue-drawer'

export async function ReportIssueAction({
  projectId,
  projectLabel,
  source,
  triggerVariant,
}: {
  projectId: string
  projectLabel: string
  source?: IssueSource
  triggerVariant?: 'default' | 'outline'
}) {
  const session = await requireStaff()
  const features = await getOrgFeatures(session.organizationId)
  if (!features.issues) return null
  const { assignees, categories } = await getIssueReportOptions(session.organizationId, projectId)
  return (
    <ReportIssueDrawer
      projectId={projectId}
      projectLabel={projectLabel}
      organizationId={session.organizationId}
      userId={session.userId}
      assignees={assignees}
      categories={categories}
      source={source}
      triggerVariant={triggerVariant}
    />
  )
}
