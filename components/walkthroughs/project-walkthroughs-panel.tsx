import Link from 'next/link'
import { ClipboardCheck, ClipboardList, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { IssueStatusBadge, WalkthroughStatusBadge } from '@/components/walkthroughs/badges'
import { OverviewNotice, OverviewSection } from '@/components/projects/overview-section'
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
    <OverviewSection
      id="walkthroughs-heading"
      icon={ClipboardCheck}
      title="Walkthroughs & issues"
      subtitle="Homeowner inspections and punch-list follow-up."
      actions={
        canCreate ? (
          <Button variant="outline" render={<Link href={`/projects/${projectId}/walkthroughs/new`} />} nativeButton={false}>
            <Plus data-icon="inline-start" />
            New walkthrough
          </Button>
        ) : null
      }
    >
      {walkthroughs.length ? (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {walkthroughs.map((w) => (
            <li key={w.id}>
              <Link
                href={`/projects/${projectId}/walkthroughs/${w.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F8F7F3]"
              >
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
          ))}
        </ul>
      ) : (
        <OverviewNotice
          icon={ClipboardList}
          title="No walkthroughs recorded"
          body="Create a walkthrough when the home is ready for inspection."
        />
      )}

      {openIssues.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{`Open issues (${openIssues.length})`}</h3>
          <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
            {openIssues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={`/projects/${projectId}/issues/${issue.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F8F7F3]"
                >
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
    </OverviewSection>
  )
}
