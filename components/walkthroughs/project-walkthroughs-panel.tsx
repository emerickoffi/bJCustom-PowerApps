import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { IssueStatusBadge, WalkthroughStatusBadge } from '@/components/walkthroughs/badges'
import { WALKTHROUGH_TYPE_LABELS, type IssueStatus, type WalkthroughStatus } from '@/lib/walkthroughs'
import { PROJECT_SECTION_ANCHORS } from '@/lib/project-nav'
import { formatDate } from '@/lib/format'

const WALKTHROUGH_PREVIEW = 3
const ISSUE_PREVIEW = 5
const SECTION_HEADING = 'scroll-mt-36 font-serif text-lg font-semibold text-foreground'
const ROW = 'flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F3F4F6]'

function MoreToggle({ count, noun, children }: { count: number; noun: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-primary underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{`Show ${count} more ${noun}`}</span>
        <span className="hidden group-open:inline">{`Hide ${noun}`}</span>
      </summary>
      {children}
    </details>
  )
}

/** Body of the project Walkthroughs tab; the page supplies the heading and the New walkthrough action. */
export async function ProjectWalkthroughsPanel({ projectId }: { projectId: string }) {
  const supabase = await createClient()
  const [walkthroughsRes, issuesRes] = await Promise.all([
    supabase
      .from('walkthroughs')
      .select('id, title, walkthrough_type, status, scheduled_date, submitted_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_issues')
      .select('id, category, item_label, status, reported_at', { count: 'exact' })
      .eq('project_id', projectId)
      .neq('status', 'closed')
      .order('reported_at', { ascending: false })
      .limit(50),
  ])
  const walkthroughs = walkthroughsRes.data ?? []
  const openIssues = issuesRes.data ?? []
  const openIssueCount = issuesRes.count ?? openIssues.length
  const failed = Boolean(walkthroughsRes.error || issuesRes.error)

  const walkthroughRow = (w: (typeof walkthroughs)[number]) => (
    <li key={w.id}>
      <Link href={`/projects/${projectId}/walkthroughs/${w.id}`} className={ROW}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{w.title}</span>
          <span className="text-xs text-muted-foreground">
            {[
              WALKTHROUGH_TYPE_LABELS[w.walkthrough_type],
              w.submitted_at ? `Submitted ${formatDate(w.submitted_at)}` : w.scheduled_date ? `Scheduled ${formatDate(w.scheduled_date)}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
        </span>
        <WalkthroughStatusBadge status={w.status as WalkthroughStatus} />
      </Link>
    </li>
  )

  const issueRow = (issue: (typeof openIssues)[number]) => (
    <li key={issue.id}>
      <Link href={`/projects/${projectId}/issues/${issue.id}`} className={ROW}>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-medium text-foreground">{issue.item_label}</span>
          <span className="text-xs text-muted-foreground">{`${issue.category} · Reported ${formatDate(issue.reported_at)}`}</span>
        </span>
        <IssueStatusBadge status={issue.status as IssueStatus} />
      </Link>
    </li>
  )

  const empty = !failed && walkthroughs.length === 0 && openIssues.length === 0

  return (
    <div className="flex flex-col gap-6">
      {failed && (
        <p role="status" className="text-sm text-warning">
          Some walkthroughs or issues could not be loaded. Refresh the page to try again.
        </p>
      )}

      {empty && (
        <p className="rounded-xl border border-dashed px-4 py-3 text-sm text-muted-foreground">No walkthroughs or open issues yet.</p>
      )}

      {openIssues.length > 0 && (
        <section aria-labelledby="open-issues-heading" className="flex flex-col gap-2">
          <h2 id="open-issues-heading" className={SECTION_HEADING}>{`Open issues (${openIssueCount})`}</h2>
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">{openIssues.slice(0, ISSUE_PREVIEW).map(issueRow)}</ul>
          {openIssues.length > ISSUE_PREVIEW && (
            <MoreToggle count={openIssues.length - ISSUE_PREVIEW} noun="issues">
              <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">{openIssues.slice(ISSUE_PREVIEW).map(issueRow)}</ul>
            </MoreToggle>
          )}
          {openIssueCount > openIssues.length && (
            <p className="text-xs text-muted-foreground">{`Showing the ${openIssues.length} most recent open issues.`}</p>
          )}
        </section>
      )}

      {walkthroughs.length > 0 && (
        <section aria-labelledby={PROJECT_SECTION_ANCHORS.walkthroughs} className="flex flex-col gap-2">
          <h2 id={PROJECT_SECTION_ANCHORS.walkthroughs} className={SECTION_HEADING}>{`Walkthroughs (${walkthroughs.length})`}</h2>
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
            {walkthroughs.slice(0, WALKTHROUGH_PREVIEW).map(walkthroughRow)}
          </ul>
          {walkthroughs.length > WALKTHROUGH_PREVIEW && (
            <MoreToggle count={walkthroughs.length - WALKTHROUGH_PREVIEW} noun="walkthroughs">
              <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
                {walkthroughs.slice(WALKTHROUGH_PREVIEW).map(walkthroughRow)}
              </ul>
            </MoreToggle>
          )}
        </section>
      )}
    </div>
  )
}
