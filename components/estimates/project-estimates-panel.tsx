import Link from 'next/link'
import { Calculator, Plus, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import { formatCentsExact, type EstimateStatus } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { EstimateStatusBadge } from '@/components/estimates/estimate-status-badge'
import { OverviewSection } from '@/components/projects/overview-section'
import { cn } from '@/lib/utils'

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

function varianceMessage(hasBudget: boolean, hasApproved: boolean, variance: number | null) {
  if (variance !== null) return variance > 0 ? 'Over budget' : variance < 0 ? 'Within budget' : 'On budget'
  if (hasBudget) return 'An approved construction estimate is required to calculate the budget variance.'
  if (hasApproved) return 'A project budget is required to calculate the budget variance.'
  return 'A project budget and an approved construction estimate are required to calculate the budget variance.'
}

function SummaryCard({
  label,
  value,
  note,
  unavailable = false,
  valueClassName,
}: {
  label: string
  value: string
  note?: string
  /** Missing data renders as a quiet label so it is never mistaken for a $0 value. */
  unavailable?: boolean
  valueClassName?: string
}) {
  return (
    <div className="flex h-full min-w-0 flex-col gap-2 rounded-xl border border-[#E2E8E2] bg-[#F8F7F3] p-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'flex min-h-8 items-center break-words',
          unavailable
            ? 'text-sm font-medium italic text-muted-foreground'
            : 'font-serif text-2xl font-semibold leading-tight tabular-nums text-foreground',
          valueClassName,
        )}
      >
        {value}
      </dd>
      {note && <p className="mt-auto text-xs leading-relaxed text-muted-foreground">{note}</p>}
    </div>
  )
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
  const hasBudget = budgetCents !== null
  const variance = approved && hasBudget ? approved.construction_total_cents - budgetCents : null

  return (
    <OverviewSection
      id="estimates-heading"
      icon={Wallet}
      title="Estimates & Budget"
      subtitle="Approved construction cost compared with the project budget."
      actions={
        <>
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
        </>
      }
    >
      <dl className="grid gap-3 md:grid-cols-3">
        <SummaryCard label="Project budget" value={hasBudget ? formatCentsExact(budgetCents) : 'Not set'} unavailable={!hasBudget} />
        <SummaryCard
          label="Approved construction estimate"
          value={approved ? formatCentsExact(approved.construction_total_cents) : 'None approved'}
          unavailable={!approved}
          note={
            approved
              ? `${approved.estimate_number} rev ${approved.revision}${approved.land_cost_cents !== null ? ` · land ${formatCentsExact(approved.land_cost_cents)} tracked separately` : ''}`
              : undefined
          }
        />
        <SummaryCard
          label="Estimate vs. budget"
          value={variance === null ? 'Not available' : `${variance > 0 ? '+' : ''}${formatCentsExact(variance)}`}
          unavailable={variance === null}
          valueClassName={variance === null ? undefined : variance > 0 ? 'text-destructive' : 'text-primary'}
          note={varianceMessage(hasBudget, Boolean(approved), variance)}
        />
      </dl>

      {estimates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No estimates for this project yet.</p>
      ) : (
        <ul className="flex flex-col divide-y overflow-hidden rounded-xl border">
          {estimates.slice(0, 5).map((e) => (
            <li key={e.id}>
              <Link href={`/estimates/${e.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#F8F7F3]">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-sm font-medium text-foreground">{e.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {e.estimate_number} · Rev {e.revision} · {formatDate(e.created_at)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium tabular-nums">{formatCentsExact(e.construction_total_cents)}</span>
                  <EstimateStatusBadge status={e.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </OverviewSection>
  )
}
