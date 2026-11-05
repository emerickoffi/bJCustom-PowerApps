'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import { TAX_LABELS, formatMoney, payableCents, type QuoteDecision, type QuoteRevision } from '@/lib/subcontract-quotes'
import { DecisionBadge } from './status-badges'

export type CompareEntry = {
  invitationId: string
  company: string
  qualification: string
  revision: QuoteRevision
  outdatedScope: boolean
  expired: boolean
  revisionOutstanding: boolean
  draftOutstanding: boolean
  decision: QuoteDecision | null
}

type Cell = { text: string; unknown?: boolean; warn?: boolean }
type RowDef = { label: string; cell: (e: CompareEntry) => Cell; compare?: boolean }

const NOT_STATED = 'Not stated'

function text(v: string | null | undefined, unknownLabel = NOT_STATED): Cell {
  const t = v?.trim()
  return t ? { text: t } : { text: unknownLabel, unknown: true }
}

function rows(currency: string | null, currentScope: number): RowDef[] {
  return [
    { label: 'Base amount', compare: true, cell: (e) => (e.revision.amount_cents === null ? { text: NOT_STATED, unknown: true } : { text: formatMoney(e.revision.amount_cents, currency) }) },
    { label: 'Tax basis', compare: true, cell: (e) => (e.revision.tax_treatment ? { text: TAX_LABELS[e.revision.tax_treatment] } : { text: NOT_STATED, unknown: true }) },
    {
      label: 'Tax amount',
      cell: (e) =>
        e.revision.tax_treatment === 'excluded'
          ? e.revision.tax_amount_cents === null
            ? { text: 'Unknown — not zero', unknown: true }
            : { text: formatMoney(e.revision.tax_amount_cents, currency) }
          : { text: e.revision.tax_treatment ? 'Not separate' : NOT_STATED, unknown: !e.revision.tax_treatment },
    },
    {
      label: 'Total payable',
      compare: true,
      cell: (e) => {
        const p = payableCents(e.revision)
        return p === null ? { text: 'Not determinable', unknown: true } : { text: formatMoney(p, currency) }
      },
    },
    { label: 'Inclusions', cell: (e) => text(e.revision.inclusions, 'Not stated — do not assume anything is included') },
    { label: 'Exclusions', cell: (e) => text(e.revision.exclusions, 'None listed') },
    { label: 'Allowances', cell: (e) => text(e.revision.allowances, 'None stated') },
    { label: 'Assumptions', cell: (e) => text(e.revision.assumptions) },
    {
      label: 'Alternates (separate, not in totals)',
      cell: (e) =>
        e.revision.alternates?.length
          ? {
              text: e.revision.alternates
                .map((a) => `${a.description}: ${a.amount_cents === null ? 'price unknown' : formatMoney(a.amount_cents, currency)}`)
                .join('\n'),
              unknown: e.revision.alternates.some((a) => a.amount_cents === null),
            }
          : { text: 'None offered' },
    },
    { label: 'Availability', cell: (e) => text(e.revision.availability) },
    {
      label: 'Duration',
      compare: true,
      cell: (e) => (e.revision.estimated_duration_days === null ? { text: NOT_STATED, unknown: true } : { text: `${e.revision.estimated_duration_days} days` }),
    },
    {
      label: 'Valid until',
      cell: (e) =>
        e.revision.valid_until
          ? { text: `${formatDate(e.revision.valid_until)}${e.expired ? ' (expired)' : ''}`, warn: e.expired }
          : { text: NOT_STATED, unknown: true },
    },
    { label: 'Qualification', compare: true, cell: (e) => ({ text: e.qualification, warn: e.qualification !== 'Qualified' }) },
    {
      label: 'Scope acknowledged',
      compare: true,
      cell: (e) =>
        e.revision.scope_version === null
          ? { text: NOT_STATED, unknown: true }
          : { text: `v${e.revision.scope_version}${e.outdatedScope ? ` (current is v${currentScope})` : ''}`, warn: e.outdatedScope },
    },
    { label: 'Revision', cell: (e) => ({ text: `Revision ${e.revision.revision_number}` }) },
  ]
}

function CellView({ cell }: { cell: Cell }) {
  return (
    <span
      className={cn(
        'whitespace-pre-wrap text-sm',
        cell.unknown && 'italic text-muted-foreground',
        cell.warn && 'font-medium text-warning',
        !cell.unknown && !cell.warn && 'text-foreground',
      )}
    >
      {cell.text}
    </span>
  )
}

function Flags({ e }: { e: CompareEntry }) {
  const flags = [
    e.revisionOutstanding && 'Revision requested — awaiting revised quote',
    e.draftOutstanding && 'Company is editing a newer draft (not submitted)',
    e.outdatedScope && 'Priced against an outdated scope',
  ].filter(Boolean) as string[]
  if (!flags.length) return null
  return (
    <ul className="flex flex-col gap-1">
      {flags.map((f) => (
        <li key={f} className="flex items-start gap-1.5 text-xs text-warning">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          {f}
        </li>
      ))}
    </ul>
  )
}

export function QuoteComparison({ entries, currency, currentScope }: { entries: CompareEntry[]; currency: string | null; currentScope: number }) {
  const [picked, setPicked] = useState<string[]>(() => entries.slice(0, 3).map((e) => e.invitationId))
  const defs = useMemo(() => rows(currency, currentScope), [currency, currentScope])
  const shown = entries.filter((e) => picked.includes(e.invitationId))
  const scopes = new Set(shown.map((e) => e.revision.scope_version))

  if (entries.length < 2) {
    return <p className="text-sm text-muted-foreground">Comparison needs at least two submitted quotes.</p>
  }

  function toggle(id: string, on: boolean) {
    setPicked((p) => (on ? [...p, id] : p.filter((x) => x !== id)))
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium text-foreground">Companies to compare (latest submitted revision)</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {entries.map((e) => (
            <label key={e.invitationId} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={picked.includes(e.invitationId)}
                onChange={(ev) => toggle(e.invitationId, ev.target.checked)}
              />
              {e.company}
            </label>
          ))}
        </div>
      </fieldset>

      <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
        <li>All amounts are in {currency ?? 'the request currency'} exactly as submitted. Unknown values are not treated as zero.</li>
        <li>Lowest price is not ranked as best. Review scope, exclusions and qualification before deciding.</li>
        {scopes.size > 1 ? (
          <li className="font-medium text-warning">These quotes were priced against different scope versions and are not directly equivalent.</li>
        ) : null}
      </ul>

      {shown.length < 2 ? (
        <p className="text-sm text-muted-foreground">Select two or more companies to compare.</p>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Side-by-side comparison of submitted quotes</caption>
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th scope="col" className="w-44 p-3 text-xs font-medium text-muted-foreground">
                    Item
                  </th>
                  {shown.map((e) => (
                    <th key={e.invitationId} scope="col" className="min-w-56 p-3 align-top">
                      <div className="flex flex-col gap-1.5">
                        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
                          {e.company}
                          {e.decision ? <DecisionBadge decision={e.decision} /> : null}
                        </span>
                        <Flags e={e} />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {defs.map((d) => {
                  const cells = shown.map((e) => d.cell(e))
                  const differs = d.compare && new Set(cells.map((c) => c.text)).size > 1
                  return (
                    <tr key={d.label} className={cn('border-b border-border last:border-0', differs && 'bg-accent/40')}>
                      <th scope="row" className="p-3 align-top text-xs font-medium text-muted-foreground">
                        {d.label}
                        {differs ? <span className="block font-normal text-foreground">Differs</span> : null}
                      </th>
                      {cells.map((c, i) => (
                        <td key={shown[i].invitationId} className="p-3 align-top">
                          <CellView cell={c} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <ul className="grid gap-4 md:grid-cols-2 lg:hidden">
            {shown.map((e) => (
              <li key={e.invitationId} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                <div className="flex flex-col gap-1.5">
                  <span className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
                    {e.company}
                    {e.decision ? <DecisionBadge decision={e.decision} /> : null}
                  </span>
                  <Flags e={e} />
                </div>
                <dl className="flex flex-col gap-2.5">
                  {defs.map((d) => (
                    <div key={d.label} className="flex flex-col gap-0.5">
                      <dt className="text-xs font-medium text-muted-foreground">{d.label}</dt>
                      <dd>
                        <CellView cell={d.cell(e)} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
