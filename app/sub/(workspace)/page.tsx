import Link from 'next/link'
import { ChevronRight, HardHat } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { formatDate, APP_TIME_ZONE } from '@/lib/format'
import { todayIn } from '@/lib/subcontractor-qualification'
import { isOverdue, isSubWorkSetupError, workStateFor, type WorkState } from '@/lib/subcontractor-work'
import { WorkCard } from '@/components/subcontractor-work/work-card'
import { responseState } from '@/lib/subcontract-quotes'
import type { SubQuoteRow } from './quotes/page'

type WorkRow = {
  assignment_id: string
  project_id: string
  project_name: string
  project_city: string | null
  activity_name: string
  planned_end: string | null
  latest_status: string | null
}
type CorrectionRow = {
  issue_id: string
  project_id: string
  project_name: string
  item_label: string | null
  category: string | null
  due_date: string | null
  latest_status: string | null
}
type Entry = { key: string; href: string; title: string; project: string; meta?: string; state: WorkState; overdue: boolean }

function Section({ id, title, entries, empty }: { id: string; title: string; entries: Entry[]; empty: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="flex items-center justify-between type-section-title text-foreground">
        {title}
        <span className="rounded-badge bg-sage/60 px-2 py-0.5 font-sans text-xs font-medium text-primary">{entries.length}</span>
      </h2>
      {entries.length ? (
        <ul className="flex flex-col gap-2">
          {entries.map(({ key, ...e }) => (
            <WorkCard key={key} {...e} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">{empty}</p>
      )}
    </section>
  )
}

export default async function SubWorkspacePage() {
  const session = await requireSubcontractor()
  const supabase = await createClient()
  const [work, corrections, quotes] = await Promise.all([
    supabase.rpc('sub_assigned_work'),
    supabase.rpc('sub_correction_requests'),
    supabase.rpc('sub_quote_requests'),
  ])
  // Quote requests are optional here: if they cannot be loaded, the link still works and simply shows no count.
  const quotesToAnswer = quotes.error
    ? 0
    : ((quotes.data ?? []) as SubQuoteRow[]).filter((q) => {
        const response = responseState(q.invitation_status, q.revision_requested_at, q.last_submitted_at)
        return q.status === 'open' && (response === 'awaiting' || response === 'revision_requested')
      }).length
  if (isSubWorkSetupError(work.error) || isSubWorkSetupError(corrections.error)) {
    return <p className="text-sm text-muted-foreground">The subcontractor workspace is not available yet.</p>
  }
  if (work.error || corrections.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Your work could not be loaded. Please refresh.
      </p>
    )
  }
  const today = todayIn(APP_TIME_ZONE)
  const workEntries: Entry[] = ((work.data ?? []) as WorkRow[]).map((w) => {
    const state = workStateFor(w.latest_status)
    return {
      key: `w-${w.assignment_id}`,
      href: `/sub/work/${w.assignment_id}`,
      title: w.activity_name,
      project: w.project_name,
      meta: w.planned_end ? `Due ${formatDate(w.planned_end)}` : undefined,
      state,
      overdue: isOverdue(w.planned_end, today, state),
    }
  })
  const correctionEntries: Entry[] = ((corrections.data ?? []) as CorrectionRow[]).map((c) => {
    const state = workStateFor(c.latest_status)
    return {
      key: `c-${c.issue_id}`,
      href: `/sub/corrections/${c.issue_id}`,
      title: c.item_label || c.category || 'Punch list item',
      project: c.project_name,
      meta: c.due_date ? `Due ${formatDate(c.due_date)}` : undefined,
      state,
      overdue: isOverdue(c.due_date, today, state),
    }
  })
  const open = (e: Entry) => e.state === 'in_progress' || e.state === 'correction_required'
  const all = [...workEntries, ...correctionEntries]
  const projects = new Map<string, { name: string; count: number }>()
  for (const row of [...((work.data ?? []) as WorkRow[]), ...((corrections.data ?? []) as CorrectionRow[])]) {
    const current = projects.get(row.project_id) ?? { name: row.project_name, count: 0 }
    projects.set(row.project_id, { ...current, count: current.count + 1 })
  }

  return (
    <>
      <PageHeader icon={HardHat} title={`Hi ${session.fullName.split(' ')[0]}`} />

      <Link
        href="/sub/quotes"
        className="flex min-h-11 items-center justify-between rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium text-foreground hover:bg-sage/30"
      >
        Quote requests
        <span className="flex shrink-0 items-center gap-2">
          {quotesToAnswer > 0 && (
            <span className="rounded-badge border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-900">
              {quotesToAnswer === 1 ? '1 needs a response' : `${quotesToAnswer} need a response`}
            </span>
          )}
          <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
        </span>
      </Link>

      <section aria-labelledby="projects-heading" className="flex flex-col gap-3">
        <h2 id="projects-heading" className="type-section-title text-foreground">
          My Assigned Projects
        </h2>
        {projects.size ? (
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {[...projects.entries()].map(([id, p]) => (
              <li key={id} className="flex shrink-0 flex-col rounded-xl border border-border bg-card px-4 py-3">
                <span className="text-sm font-medium text-foreground">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  {p.count} {p.count === 1 ? 'item' : 'items'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No projects have been assigned to your company yet.</p>
        )}
      </section>

      <Section id="work-heading" title="My Assigned Work" entries={workEntries.filter(open)} empty="No open work assignments." />
      <Section id="corrections-heading" title="Correction Requests" entries={correctionEntries.filter(open)} empty="No corrections requested." />
      <Section
        id="awaiting-heading"
        title="Awaiting Builder Verification"
        entries={all.filter((e) => e.state === 'submitted')}
        empty="Nothing is waiting on the builder."
      />
      <Section
        id="verified-heading"
        title="Verified / Completed"
        entries={all.filter((e) => e.state === 'accepted')}
        empty="Verified work will appear here."
      />
    </>
  )
}
