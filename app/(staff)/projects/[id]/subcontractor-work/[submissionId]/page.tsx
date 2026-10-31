import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ClipboardCheck } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { requireFeature } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { workStateFor } from '@/lib/subcontractor-work'
import { loadProfileNames, loadSubmissionCycles } from '@/lib/subcontractor-work-data'
import { isUuid } from '@/lib/subcontractor-projects'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { WorkStateBadge } from '@/components/subcontractor-work/work-state-badge'
import { SubmissionHistory } from '@/components/subcontractor-work/submission-history'
import { ReviewForm, type LinkableIssue } from '@/components/subcontractor-work/review-form'

export const metadata: Metadata = { title: 'Verify subcontractor work' }

export default async function ReviewSubmissionPage({ params }: { params: Promise<{ id: string; submissionId: string }> }) {
  const session = await requireManager()
  await requireFeature(session.organizationId, 'subcontractors')
  const { id, submissionId } = await params
  if (!isUuid(id) || !isUuid(submissionId)) notFound()
  const supabase = await createClient()

  const { cycles: [current] } = await loadSubmissionCycles({ column: 'id', value: submissionId })
  if (!current || current.projectId !== id || current.organizationId !== session.organizationId) notFound()

  const target =
    current.kind === 'work'
      ? { column: 'assignment_id' as const, value: current.assignmentId as string }
      : { column: 'issue_id' as const, value: current.issueId as string }

  const [{ cycles }, { data: company }, targetRes, { data: issues }] = await Promise.all([
    loadSubmissionCycles(target),
    supabase.from('subcontractor_companies').select('company_name').eq('id', current.companyId).maybeSingle(),
    current.kind === 'work'
      ? supabase
          .from('schedule_activity_assignments')
          .select('scope_of_work, activity:schedule_activities(name, planned_start, planned_end)')
          .eq('id', current.assignmentId as string)
          .maybeSingle()
      : supabase
          .from('project_issues')
          .select('item_label, category, homeowner_description, corrective_action, due_date')
          .eq('id', current.issueId as string)
          .maybeSingle(),
    supabase
      .from('project_issues')
      .select('id, item_label, category, responsible_subcontractor_company_id')
      .eq('project_id', id)
      .eq('organization_id', session.organizationId)
      .neq('status', 'closed')
      .order('reported_at', { ascending: false })
      .limit(200),
  ])

  const names = await loadProfileNames(cycles.flatMap((c) => [c.submittedBy, c.reviewedBy]))
  const issueRows = (issues ?? []) as { id: string; item_label: string | null; category: string | null; responsible_subcontractor_company_id: string | null }[]
  const issueLabels = new Map(issueRows.map((i) => [i.id, i.item_label || i.category || 'Punch list item']))
  const linkable: LinkableIssue[] = issueRows
    .filter((i) => i.id !== current.issueId)
    .map((i) => ({
      id: i.id,
      label: issueLabels.get(i.id) as string,
      assignedElsewhere: Boolean(i.responsible_subcontractor_company_id && i.responsible_subcontractor_company_id !== current.companyId),
    }))

  const detail = targetRes.data as Record<string, unknown> | null
  const activity = (detail?.activity ?? null) as { name: string; planned_start: string | null; planned_end: string | null } | null
  const title =
    current.kind === 'work'
      ? activity?.name ?? 'Schedule activity'
      : (detail?.item_label as string) || (detail?.category as string) || 'Punch list item'
  const scope = current.kind === 'work' ? (detail?.scope_of_work as string | null) : (detail?.corrective_action as string | null)
  const awaiting = current.status === 'submitted'

  return (
    <div className="flex w-full max-w-5xl flex-col gap-5">
      <PageHeader
        icon={ClipboardCheck}
        backHref={`/projects/${id}/subcontractor-work`}
        backLabel="Subcontractor work"
        title={title}
        titleAddon={<WorkStateBadge state={workStateFor(current.status)} audience="builder" />}
        description={`${company?.company_name ?? 'Subcontractor'} · ${current.kind === 'work' ? 'Work completion' : 'Correction'}${current.cycle > 1 ? ` · Resubmission ${current.cycle}` : ''}`}
      />

      <Surface aria-labelledby="scope-heading" className="gap-3">
        <h2 id="scope-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
          {current.kind === 'work' ? 'Assigned scope' : 'Requested correction'}
        </h2>
        <p className="whitespace-pre-wrap text-sm text-foreground">{scope || 'No scope details recorded.'}</p>
        {current.kind === 'work' && activity?.planned_end && (
          <p className="text-xs text-muted-foreground">
            Planned {activity.planned_start ? `${formatDate(activity.planned_start)} – ` : ''}
            {formatDate(activity.planned_end)}
          </p>
        )}
        {current.kind === 'correction' && current.issueId && (
          <Link href={`/projects/${id}/issues/${current.issueId}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            Open punch list item
          </Link>
        )}
      </Surface>

      {awaiting && (
        <Surface aria-labelledby="verify-heading" className="gap-4">
          <div className="flex flex-col gap-0.5">
            <h2 id="verify-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
              Verify this submission
            </h2>
            <p className="text-sm text-muted-foreground">
              Work is not complete until you accept it. Corrections and returns require a reason the subcontractor will see.
            </p>
          </div>
          <ReviewForm
            submissionId={current.id}
            projectId={id}
            organizationId={session.organizationId}
            kind={current.kind}
            inspection={current.inspection}
            issues={linkable}
          />
        </Surface>
      )}

      <Surface aria-labelledby="history-heading" className="gap-4">
        <h2 id="history-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
          Submission history
        </h2>
        <SubmissionHistory cycles={cycles} names={names} audience="builder" issueLabels={issueLabels} />
      </Surface>
    </div>
  )
}
