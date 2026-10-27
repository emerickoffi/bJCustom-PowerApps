import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronRight, ClipboardCheck as ClipboardCheckIcon } from 'lucide-react'
import { canManage, requireStaff } from '@/lib/session'
import { StaffReportsSection } from '@/components/reports/staff-reports-section'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, DetailList } from '@/components/shared/page-header'
import { IssueStatusBadge, ResponseBadge, WalkthroughStatusBadge } from '@/components/walkthroughs/badges'
import { WALKTHROUGH_TYPE_LABELS, type IssueStatus, type ResponseValue, type WalkthroughStatus } from '@/lib/walkthroughs'
import { formatDate, formatDateTime } from '@/lib/format'

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

  const [itemsRes, responsesRes, issuesRes] = await Promise.all([
    supabase.from('walkthrough_items').select('id, category, label').eq('walkthrough_id', walkthroughId).order('sort_order'),
    supabase.from('walkthrough_responses').select('item_id, response').eq('walkthrough_id', walkthroughId),
    supabase.from('project_issues').select('id, item_id, status').eq('walkthrough_id', walkthroughId),
  ])

  const status = walkthrough.status as WalkthroughStatus
  const responses = new Map((responsesRes.data ?? []).map((r) => [r.item_id, r.response as ResponseValue | null]))
  const issues = new Map((issuesRes.data ?? []).map((i) => [i.item_id, i]))
  const items = itemsRes.data ?? []
  const answered = items.filter((i) => responses.get(i.id)).length
  const grouped = items.reduce<Record<string, typeof items>>((acc, item) => {
    ;(acc[item.category] ??= []).push(item)
    return acc
  }, {})
  const project = walkthrough.project as { id: string; name: string; project_number: string }

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
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          The homeowner&apos;s draft notes stay private until they submit. Issues will appear here once the walkthrough is submitted.
        </p>
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
                    <span className="text-sm text-foreground">{item.label}</span>
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
