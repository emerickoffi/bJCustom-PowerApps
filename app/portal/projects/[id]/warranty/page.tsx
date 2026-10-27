import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ShieldCheck } from 'lucide-react'
import { PageHeader, EmptyState } from '@/components/shared/page-header'
import { z } from 'zod'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { daysUntil } from '@/components/warranty/stage'
import { SubmitClaimForm, type CoverageOption } from '@/components/warranty/claim-forms'
import { ClaimList } from '@/components/warranty/claim-list'

export const metadata: Metadata = { title: 'Your home warranty' }

type PortalProject = { id: string; name: string }
type Coverage = { coverage_key: string; name: string; description: string | null; exclusions: string | null }
type Milestone = {
  id: string
  coverage_key: string
  coverage_name: string
  categories: string[]
  due_on: string
  reached_at: string | null
}

export default async function HomeownerWarrantyPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.organizationId) redirect('/portal')
  const features = await getOrgFeatures(session.organizationId)
  if (!features.warranty) redirect('/portal')
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()

  const supabase = await createClient()
  const { data: projects } = await supabase.rpc('get_portal_projects')
  const project = ((projects ?? []) as PortalProject[]).find((p) => p.id === id)
  if (!project) notFound()

  const [{ data: warranty }, { data: today }] = await Promise.all([
    supabase.from('project_warranties').select('id, stage, start_date, terms_snapshot').eq('project_id', id).maybeSingle(),
    supabase.rpc('org_today', { p_org: session.organizationId }),
  ])
  const todayIso = (today as string | null) ?? new Date().toISOString().slice(0, 10)

  const { data: milestoneRows } = warranty
    ? await supabase
        .from('warranty_milestones')
        .select('id, coverage_key, coverage_name, categories, due_on, reached_at')
        .eq('warranty_id', warranty.id)
        .order('sort_order')
    : { data: [] }
  const milestones = (milestoneRows ?? []) as Milestone[]
  const snapshot = warranty?.terms_snapshot as { disclaimer?: string; coverages?: Coverage[] } | undefined
  const coverageDetails = new Map((snapshot?.coverages ?? []).map((c) => [c.coverage_key, c]))
  const coverageNames = Object.fromEntries(milestones.map((m) => [m.coverage_key, m.coverage_name]))
  const coverageOptions: CoverageOption[] = milestones.map((m) => ({
    coverage_key: m.coverage_key,
    name: m.coverage_name,
    categories: m.categories,
    ended: Boolean(m.reached_at) || m.due_on < todayIso,
  }))

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={ShieldCheck}
        backHref="/portal"
        backLabel="Your home"
        title="Your home warranty"
        description={project.name}
      />

      {!warranty ? (
        <EmptyState
          icon={ShieldCheck}
          title="Your warranty hasn't started yet"
          description="Coverage begins automatically when your builder marks your home complete. Your coverage periods and how to report a concern will appear here."
        />
      ) : (
        <>
          <section aria-labelledby="coverage" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="coverage" className="font-serif text-xl font-semibold">
                Coverage
              </h2>
              <p className="text-sm text-muted-foreground">Started {formatDate(warranty.start_date)}</p>
            </div>
            <ul className="grid gap-4 md:grid-cols-3">
              {milestones.map((m) => {
                const ended = Boolean(m.reached_at) || m.due_on < todayIso
                const days = daysUntil(m.due_on)
                const detail = coverageDetails.get(m.coverage_key)
                return (
                  <li key={m.id} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
                    <div className="flex items-start justify-between gap-2">
                      <ShieldCheck className={cn('size-5', ended ? 'text-muted-foreground' : 'text-primary')} aria-hidden="true" />
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-0.5 text-xs font-medium',
                          ended ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
                        )}
                      >
                        {ended ? 'Ended' : `${days} days left`}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-medium">{m.coverage_name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {ended ? 'Ended' : 'Covered through'} {formatDate(m.due_on)}
                      </p>
                    </div>
                    {detail?.description && <p className="text-sm">{detail.description}</p>}
                    {m.categories.length > 0 && <p className="text-xs text-muted-foreground">Includes {m.categories.join(', ')}</p>}
                    {detail?.exclusions && <p className="text-xs text-muted-foreground">Not included: {detail.exclusions}</p>}
                  </li>
                )
              })}
            </ul>
            {snapshot?.disclaimer && <p className="text-xs text-muted-foreground">{snapshot.disclaimer}</p>}
          </section>

          {warranty.stage !== 'archived' && (
            <section aria-labelledby="new-claim" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
              <div className="flex flex-col gap-1">
                <h2 id="new-claim" className="font-serif text-xl font-semibold">
                  Report a warranty item
                </h2>
                <p className="text-sm text-muted-foreground">
                  Describe what you noticed and where. Your builder will review it and let you know the next step.
                </p>
              </div>
              <SubmitClaimForm projectId={id} coverages={coverageOptions} />
            </section>
          )}

          <section aria-labelledby="claims" className="flex flex-col gap-3">
            <h2 id="claims" className="font-serif text-xl font-semibold">
              Your claims
            </h2>
            <ClaimList projectId={id} audience="homeowner" coverageNames={coverageNames} />
          </section>
        </>
      )}
    </div>
  )
}
