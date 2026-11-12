import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { PageHeader, Surface } from '@/components/shared/page-header'
import { SemanticBadge } from '@/components/shared/semantic-badge'
import { SelectionChoiceForm } from '@/components/portal/selection-choice-form'
import { SelectionHistory } from '@/components/selections/selection-history'
import { getPortalSelectionDetail } from '@/lib/selections-data'
import { PORTAL_STATUS_LABELS, STATUS_TONES } from '@/lib/selections'
import { formatMoney } from '@/lib/financials'
import { formatDate } from '@/lib/format'

export const metadata: Metadata = { title: 'Selection' }

export default async function PortalSelectionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const s = await getPortalSelectionDetail(id)
  if (!s) notFound()

  return (
    <div className="flex w-full min-w-0 flex-col gap-6 md:gap-8">
      <PageHeader
        icon={ListChecks}
        title={s.name}
        backHref="/portal/selections"
        backLabel="Selections"
        meta={
          <span className="flex flex-wrap items-center gap-2">
            <SemanticBadge tone={STATUS_TONES[s.status]}>{PORTAL_STATUS_LABELS[s.status]}</SemanticBadge>
            <span>{[s.project_name, s.category, s.location].filter(Boolean).join(' · ')}</span>
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-4">
          {(s.description || s.notes) && (
            <Surface>
              <div className="flex flex-col gap-2 text-sm leading-relaxed text-foreground">
                {s.description && <p className="whitespace-pre-line text-pretty">{s.description}</p>}
                {s.notes && <p className="whitespace-pre-line text-pretty text-muted-foreground">{s.notes}</p>}
              </div>
            </Surface>
          )}
          <SelectionChoiceForm selection={s} />
        </div>
        <aside className="flex flex-col gap-6">
          <Surface>
            <dl className="flex flex-col gap-3 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Allowance</dt>
                <dd className="font-medium tabular-nums text-foreground">{s.allowance_cents === null ? 'None' : formatMoney(s.allowance_cents)}</dd>
              </div>
              {s.due_date && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Decision due</dt>
                  <dd className="font-medium text-foreground">{formatDate(s.due_date)}</dd>
                </div>
              )}
            </dl>
          </Surface>
          <Surface>
            <div className="flex flex-col gap-3">
              <h2 className="type-section-title text-foreground">History</h2>
              <SelectionHistory events={s.history} showInternal={false} />
            </div>
          </Surface>
        </aside>
      </div>
    </div>
  )
}
