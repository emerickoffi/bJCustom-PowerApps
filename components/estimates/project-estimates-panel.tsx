import Link from 'next/link'
import { Calculator, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { formatCentsExact, type EstimateStatus } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'

type Row = {
  id: string
  family_id: string
  revision: number
  estimate_number: string
  name: string
  status: EstimateStatus
  construction_total_cents: number
  land_cost_cents: number | null
  decision_at: string | null
  created_at: string
}

export async function ProjectEstimatesPanel({
  projectId,
  budgetCents,
  canManage,
}: {
  projectId: string
  budgetCents: number | null
  canManage: boolean
}) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('estimates')
    .select('id, family_id, revision, estimate_number, name, status, construction_total_cents, land_cost_cents, decision_at, created_at')
    .eq('project_id', projectId)
    .order('revision', { ascending: false })
  const rows = (data ?? []) as Row[]

  const latest = new Map<string, Row>()
  for (const r of rows) if (!latest.has(r.family_id)) latest.set(r.family_id, r)
  const estimates = [...latest.values()].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const approved = rows
    .filter((r) => r.status === 'approved')
    .sort((a, b) => (b.decision_at ?? '').localeCompare(a.decision_at ?? ''))[0]
  const variance = approved && budgetCents !== null ? approved.construction_total_cents - budgetCents : null

  return (
    <section aria-labelledby="estimates-heading" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="estimates-heading" className="font-serif text-lg font-semibold text-foreground">
          Estimates &amp; Budget
        </h2>
        <div className="flex flex-wrap gap-2">
          {estimates.length ? (
            <Button variant="outline" render={<Link href={`/estimates?project=${projectId}`} />} nativeButton={false}>
              <Calculator data-icon="inline-start" />
              All estimates
            </Button>
          ) : null}
          {canManage ? (
            <Button render={<Link href={`/estimates/new?project=${projectId}`} />} nativeButton={false}>
              <Plus data-icon="inline-start" />
              Create estimate
            </Button>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Project budget</dt>
          <dd className="font-serif text-xl font-semibold tabular-nums text-foreground">
            {budgetCents !== null ? formatCentsExact(budgetCents) : 'Not set'}
          </dd>
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Approved construction estimate</dt>
          <dd className="font-serif text-xl font-semibold tabular-nums text-foreground">
            {approved ? formatCentsExact(approved.construction_total_cents) : 'None approved'}
          </dd>
          {approved ? (
            <p className="text-xs text-muted-foreground">
              {approved.estimate_number} rev {approved.revision}
              {approved.land_cost_cents !== null ? ` · land ${formatCentsExact(approved.land_cost_cents)} tracked separately` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estimate vs. budget</dt>
          <dd
            className={
              variance === null
                ? 'font-serif text-xl font-semibold text-muted-foreground'
                : variance > 0
                  ? 'font-serif text-xl font-semibold tabular-nums text-destructive'
                  : 'font-serif text-xl font-semibold tabular-nums text-primary'
            }
          >
            {variance === null ? '—' : `${variance > 0 ? '+' : ''}${formatCentsExact(variance)}`}
          </dd>
          <p className="text-xs text-muted-foreground">
            {variance === null
              ? 'Needs a budget and an approved estimate'
              : variance > 0
                ? 'Over budget'
                : 'Within budget'}
          </p>
        </div>
      </dl>

      {estimates.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No estimates for this project yet.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {estimates.slice(0, 5).map((e) => (
            <li key={e.id}>
              <Link href={`/estimates/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 p-4 hover:bg-muted/50">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium text-foreground">{e.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.estimate_number} · Rev {e.revision} · {formatDate(e.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-sm font-medium">{formatCentsExact(e.construction_total_cents)}</span>
                  <EstimateStatusBadge status={e.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
