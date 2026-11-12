import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, ListChecks } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { getPortalSelections } from '@/lib/selections-data'
import { PORTAL_STATUS_LABELS, STATUS_TONES, isOverdue, portalSelectionPath, type PortalSelectionListItem } from '@/lib/selections'
import { formatMoney } from '@/lib/financials'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Selections' }

const NEEDS_YOU = new Set(['awaiting_homeowner'])

function Row({ item, showProject }: { item: PortalSelectionListItem; showProject: boolean }) {
  const late = isOverdue(item.due_date, item.status)
  return (
    <Link href={portalSelectionPath(item.id)} className="surface group flex flex-wrap items-center justify-between gap-3 p-5 transition-colors hover:border-primary/40">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground">{[item.category, item.location].filter(Boolean).join(' · ')}</span>
        <span className="truncate font-medium text-foreground">{item.name}</span>
        <span className={late ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {[
            showProject ? item.project_name : null,
            item.selected_option_name ? `Chose ${item.selected_option_name}` : null,
            item.due_date && NEEDS_YOU.has(item.status) ? `${late ? 'Was due' : 'Due'} ${formatDate(item.due_date)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>
      <div className="flex items-center gap-3">
        {item.allowance_cents !== null && <span className="text-sm tabular-nums text-muted-foreground">Allowance {formatMoney(item.allowance_cents)}</span>}
        <SemanticBadge tone={STATUS_TONES[item.status]}>{PORTAL_STATUS_LABELS[item.status]}</SemanticBadge>
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </div>
    </Link>
  )
}

export default async function PortalSelectionsPage() {
  const items = await getPortalSelections()
  const pending = items.filter((i) => NEEDS_YOU.has(i.status))
  const rest = items.filter((i) => !NEEDS_YOU.has(i.status))
  const showProject = new Set(items.map((i) => i.project_id)).size > 1

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 md:gap-8">
      <PageHeader
        icon={ListChecks}
        title="Selections"
        count={{ value: pending.length, noun: 'waiting' }}
        backHref="/portal"
        backLabel="Your home"
        meta={<span>Choose finishes and fixtures for your project. Your builder reviews each choice before it&apos;s final.</span>}
      />
      <section aria-labelledby="sel-pending" className="flex flex-col gap-3">
        <h2 id="sel-pending" className="type-section-title text-foreground">
          Waiting for your choice
        </h2>
        {pending.length === 0 ? (
          <p className="surface p-6 text-sm text-muted-foreground">Nothing needs your choice right now.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((i) => (
              <li key={i.id}>
                <Row item={i} showProject={showProject} />
              </li>
            ))}
          </ul>
        )}
      </section>
      {rest.length > 0 && (
        <section aria-labelledby="sel-rest" className="flex flex-col gap-3">
          <h2 id="sel-rest" className="type-section-title text-foreground">
            Submitted and decided
          </h2>
          <ul className="flex flex-col gap-3">
            {rest.map((i) => (
              <li key={i.id}>
                <Row item={i} showProject={showProject} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
