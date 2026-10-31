import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ClipboardCheck as ClipboardCheckIcon } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { StaffReportsSection } from '@/components/reports/staff-reports-section'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, DetailList } from '@/components/shared/page-header'
import { IssueStatusBadge, ResponseBadge, WalkthroughStatusBadge } from '@/components/walkthroughs/badges'
import { WALKTHROUGH_TYPE_LABELS, type IssuePriority, type IssueStatus, type ResponseValue, type WalkthroughStatus } from '@/lib/walkthroughs'
import { withItemNumbers } from '@/lib/punch-list'
import { getStaffMembers } from '@/lib/queries'
import { PunchListTable, type PunchListRow } from '@/components/walkthroughs/punch-list-table'
import { formatDate, formatDateTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { StartWalkthroughButton } from '@/components/walkthroughs/start-walkthrough-button'

export const metadata: Metadata = { title: 'Walkthrough' }

export default async function StaffWalkthroughPage({ params }: { params: Promise<{ id: string; walkthroughId: string }> }) {
  const session = await requireStaff()
  const { id, walkthroughId } = await params
  const supabase = await createClient()

  const { data: walkthrough } = await supabase
    .from('walkthroughs')
    .select('*, project:projects(id, name, project_number)')
    .eq('id', walkthroughId)
    .eq('project_id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!walkthrough) notFound()

  const [itemsRes, responsesRes, issuesRes, staff, draftFilesRes] = await Promise.all([
    // select('*') keeps this page working before and after the item_number/location migration.
    supabase.from('walkthrough_items').select('*').eq('walkthrough_id', walkthroughId).order('sort_order'),
    supabase.from('walkthrough_responses').select('item_id, response').eq('walkthrough_id', walkthroughId),
    supabase
      .from('project_issues')
      .select('id, item_id, status, priority, due_date, responsible_user_id, updated_at')
      .eq('walkthrough_id', walkthroughId),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
    supabase.from('walkthrough_attachments').select('id', { count: 'exact', head: true }).eq('walkthrough_id', walkthroughId),
  ])

  const status = walkthrough.status as WalkthroughStatus
  const responses = new Map((responsesRes.data ?? []).map((r) => [r.item_id, r.response as ResponseValue | null]))
  const issues = new Map((issuesRes.data ?? []).map((i) => [i.item_id, i]))
  const items = withItemNumbers(
    (itemsRes.data ?? []) as { id: string; category: string; label: string; item_number?: string | null; location?: string | null }[],
  )
  const staffName = new Map(staff.map((s) => [s.user_id, s.full_name || s.email || 'Team member']))
  const punchRows: PunchListRow[] = items.flatMap((item) => {
    const issue = issues.get(item.id)
    if (!issue) return []
    return [{
      issueId: issue.id,
      number: item.number,
      label: item.label,
      category: item.category,
      location: item.place,
      status: issue.status as IssueStatus,
      priority: issue.priority as IssuePriority,
      dueDate: issue.due_date,
      responsibleId: issue.responsible_user_id,
      responsibleName: issue.responsible_user_id ? staffName.get(issue.responsible_user_id) ?? 'Former team member' : null,
      updatedAt: issue.updated_at,
    }]
  })
  const answered = items.filter((i) => responses.get(i.id)).length
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    ;(acc[item.category] ??= []).push(item)
    return acc
  }, {})
  const project = walkthrough.project as { id: string; name: string; project_number: string }
  const staffLed = walkthrough.conducted_by === 'staff'
  const isLead = staffLed && walkthrough.conducted_by_user === session.userId
  const leadName = staffLed
    ? isLead
      ? 'You'
      : (walkthrough.conducted_by_user && staffName.get(walkthrough.conducted_by_user)) || 'A team member'
    : 'Homeowner'
  const homeownerStarted = !staffLed && ((responsesRes.data?.length ?? 0) > 0 || (draftFilesRes.count ?? 0) > 0)
  const canConduct = ['org_admin', 'project_manager', 'builder_staff'].includes(session.role)

  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={ClipboardCheckIcon}
        backHref={`/projects/${project.id}`}
        backLabel={project.name}
        eyebrow={
          <span className="flex items-center gap-2 normal-case tracking-normal">
            <span className="font-mono">{project.project_number}</span>
            <WalkthroughStatusBadge status={status} />
          </span>
        }
        title={walkthrough.title}
        description={WALKTHROUGH_TYPE_LABELS[walkthrough.walkthrough_type] ?? walkthrough.walkthrough_type}
      />

      <section className="rounded-xl border bg-card p-5">
        <DetailList
          items={[
            { label: 'Conducted by', value: staffLed ? `${leadName} · Builder-led` : 'Homeowner' },
            { label: 'Scheduled', value: formatDate(walkthrough.scheduled_date) },
            { label: 'Progress', value: `${answered} of ${items.length} items answered` },
            { label: 'Submitted', value: formatDateTime(walkthrough.submitted_at) },
            { label: 'Issues reported', value: status === 'submitted' ? String(issues.size) : 'Not yet submitted' },
          ]}
        />
        {walkthrough.instructions && (
          <p className="mt-4 whitespace-pre-line border-t pt-4 text-sm leading-relaxed text-muted-foreground">{walkthrough.instructions}</p>
        )}
      </section>

      {status !== 'submitted' && (
        <section aria-labelledby="conduct-heading" className="flex flex-col gap-4 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1">
            <h2 id="conduct-heading" className="font-medium text-foreground">
              {staffLed ? (isLead ? 'You are leading this walkthrough' : `${leadName} is leading this walkthrough`) : 'Homeowner-led walkthrough'}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {staffLed
                ? 'Findings stay a draft until the lead submits. The homeowner sees them as builder observations afterwards.'
                : homeownerStarted
                  ? 'The homeowner has started this checklist. Their draft notes stay private until they submit, and cannot be replaced.'
                  : 'The homeowner has not started yet. You can conduct it on site instead; the homeowner will no longer be able to fill it in.'}
            </p>
          </div>
          {canConduct && (
            <div className="shrink-0">
              {isLead ? (
                <Button size="lg" className="h-11" render={<Link href={`/projects/${project.id}/walkthroughs/${walkthroughId}/conduct`} />} nativeButton={false}>
                  Continue walkthrough
                </Button>
              ) : staffLed ? (
                canManage(session.role) && (
                  <StartWalkthroughButton projectId={project.id} walkthroughId={walkthroughId} label="Take over as lead" takeOver variant="outline" />
                )
              ) : (
                !homeownerStarted && <StartWalkthroughButton projectId={project.id} walkthroughId={walkthroughId} label="Conduct walkthrough" />
              )}
            </div>
          )}
        </section>
      )}

      {punchRows.length > 0 && (
        <PunchListTable
          projectId={project.id}
          walkthroughId={walkthroughId}
          rows={punchRows}
          staffOptions={staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))}
        />
      )}

      <div className="flex flex-col gap-6">
        {Object.entries(grouped).map(([category, list]) => (
          <section key={category} aria-labelledby={`cat-${category}`} className="flex flex-col gap-3">
            <h2 id={`cat-${category}`} className="font-serif text-lg font-semibold text-foreground">
              {category}
            </h2>
            <ul className="flex flex-col divide-y rounded-xl border bg-card">
              {list.map((item) => {
                const issue = issues.get(item.id)
                const content = (
                  <>
                    <span className="flex min-w-0 items-baseline gap-3">
                      <span className="w-10 shrink-0 font-mono text-xs font-semibold text-muted-foreground">{item.number}</span>
                      <span className="min-w-0">
                        <span className="text-sm text-foreground">{item.label}</span>
                        {item.place && <span className="block text-xs text-muted-foreground">{item.place}</span>}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      {issue && <IssueStatusBadge status={issue.status as IssueStatus} />}
                      <ResponseBadge response={responses.get(item.id) ?? null} />
                      {issue && <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />}
                    </span>
                  </>
                )
                return (
                  <li key={item.id}>
                    {issue ? (
                      <Link href={`/projects/${project.id}/issues/${issue.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
                        {content}
                      </Link>
                    ) : (
                      <div className="flex items-center justify-between gap-3 px-4 py-3">{content}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>

      <StaffReportsSection walkthroughId={walkthroughId} submitted={status === 'submitted'} canManage={canManage(session.role)} />
    </div>
  )
}
