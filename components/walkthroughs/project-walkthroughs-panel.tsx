import Link from 'next/link'
import { ClipboardCheck, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { IssueStatusBadge, WalkthroughStatusBadge } from '@/components/walkthroughs/badges'
import { WALKTHROUGH_TYPE_LABELS, type IssueStatus, type WalkthroughStatus } from '@/lib/walkthroughs'
import { formatDate } from '@/lib/format'

export async function ProjectWalkthroughsPanel({ projectId, canCreate }: { projectId: string; canCreate: boolean }) {
  const supabase = await createClient()
  const [walkthroughsRes, issuesRes] = await Promise.all([
    supabase
      .from('walkthroughs')
      .select('id, title, walkthrough_type, status, scheduled_date, submitted_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false }),
    supabase
      .from('project_issues')
      .select('id, category, item_label, status, reported_at')
      .eq('project_id', projectId)
      .neq('status', 'closed')
      .order('reported_at', { ascending: false })
      .limit(50),
  ])
  const walkthroughs = walkthroughsRes.data ?? []
  const openIssues = issuesRes.data ?? []

  return (
    <section aria-labelledby="walkthroughs-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="walkthroughs-heading" className="font-serif text-lg font-semibold text-foreground">
          Walkthroughs & issues
        </h2>
        {canCreate && (
          <Button variant="outline" render={<Link href={`/projects/${projectId}/walkthroughs/new`} />} nativeButton={false}>
            <Plus data-icon="inline-start" />
            New walkthrough
          </Button>
        )}
      </div>

      {walkthroughs.length ? (
        <ul className="flex flex-col divide-y rounded-xl border bg-card">
          {walkthroughs.map((w) => (
            <li key={w.id}>
              <Link href={`/projects/${projectId}/walkthroughs/${w.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{w.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {[WALKTHROUGH_TYPE_LABELS[w.walkthrough_type], w.submitted_at ? `Submitted ${formatDate(w.submitted_at)}` : w.scheduled_date ? `Scheduled ${formatDate(w.scheduled_date)}` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <WalkthroughStatusBadge status={w.status as WalkthroughStatus} />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
          <ClipboardCheck className="size-5 shrink-0" aria-hidden="true" />
          No walkthroughs yet. Create one when the home is ready for the homeowner&apos;s inspection.
        </div>
      )}

      {openIssues.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{`Open issues (${openIssues.length})`}</h3>
          <ul className="flex flex-col divide-y rounded-xl border bg-card">
            {openIssues.map((issue) => (
              <li key={issue.id}>
                <Link href={`/projects/${projectId}/issues/${issue.id}`} className="flex items-center justify-between gap-3 p-4 hover:bg-muted">
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium text-foreground">{issue.item_label}</span>
                    <span className="text-xs text-muted-foreground">{`${issue.category} · Reported ${formatDate(issue.reported_at)}`}</span>
                  </span>
                  <IssueStatusBadge status={issue.status as IssueStatus} />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
