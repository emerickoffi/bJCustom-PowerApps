import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft, ShieldX } from 'lucide-react'
import { requireManager } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getStaffMembers } from '@/lib/queries'
import { allowedNextStatuses, type ProjectStatus } from '@/lib/domain'
import { loadCompletionReadiness } from '@/lib/completion-readiness-data'
import { ReadinessChecklist, ReadinessCounts } from '@/components/projects/completion-readiness-panel'
import { CompletionReviewForm } from '@/components/projects/completion-review-form'
import { todayIso } from '@/lib/schedule'

export const metadata: Metadata = { title: 'Completion review' }

export default async function CompletionReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireManager()
  const { id } = await params
  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, status, project_manager_id')
    .eq('id', id)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) notFound()
  if (project.status === 'completed') redirect(`/projects/${id}`)

  const features = await getOrgFeatures(session.organizationId)
  const [summary, staff] = await Promise.all([
    loadCompletionReadiness(supabase, id, features, true),
    getStaffMembers(session.organizationId, ['org_admin', 'project_manager', 'builder_staff']),
  ])
  const transitionAllowed = allowedNextStatuses(project.status as ProjectStatus).includes('completed')
  const isAdmin = session.role === 'org_admin'
  const today = todayIso()

  let blockedReason: string | null = null
  if (!transitionAllowed) blockedReason = 'Projects can only be completed from an active construction or closeout stage.'
  else if (summary.hardBlockers.length > 0)
    blockedReason = `${summary.hardBlockers.map((b) => b.label).join(', ')} must be verified before completion. These requirements cannot be waived.`
  else if (summary.blockers.length > 0 && !isAdmin)
    blockedReason = 'Resolve the outstanding requirements, or ask an administrator to approve completion with exceptions.'

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <Link href={`/projects/${id}`} className="flex items-center gap-1.5 self-start text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to overview
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="text-balance font-serif text-2xl font-semibold text-foreground">{`Complete ${project.name}`}</h1>
        <p className="text-sm text-muted-foreground">
          Readiness is evaluated from current project records and checked again when you submit. Physical completion is separate from financial settlement.
        </p>
      </header>

      <section aria-labelledby="review-readiness" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 id="review-readiness" className="sr-only">Readiness review</h2>
        <ReadinessCounts summary={summary} />
        <ReadinessChecklist items={summary.items} />
      </section>

      <section aria-labelledby="review-submit" className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
        <h2 id="review-submit" className="font-serif text-lg font-semibold text-foreground">Completion</h2>
        {blockedReason ? (
          <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
            <ShieldX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {blockedReason}
          </p>
        ) : (
          <CompletionReviewForm
            projectId={id}
            today={today}
            blockers={summary.blockers.map((b) => ({ key: b.key, label: b.label, detail: b.detail }))}
            staff={staff.map((s) => ({ value: s.user_id, label: s.full_name || s.email || 'Team member' }))}
            defaultFollowUp={project.project_manager_id ?? undefined}
          />
        )}
      </section>
    </div>
  )
}
