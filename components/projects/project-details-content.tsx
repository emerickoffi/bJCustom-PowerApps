import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowRight, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PROJECT_STATUS_LABELS, type ProjectStatus } from '@/lib/domain'
import { formatDateTime } from '@/lib/format'

export type DetailsHistoryEntry = {
  id: string
  from_status: string | null
  to_status: string
  note: string | null
  created_at: string
  byName: string
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  )
}

export function ProjectDetailsContent({
  statusCard,
  editHref,
  facts,
  description,
  legalDescription,
  internalNotes,
  setupAction,
  history,
  historyError,
}: {
  statusCard?: ReactNode
  editHref: string | null
  facts: { label: string; value: string | null }[]
  description: string | null
  legalDescription: string | null
  internalNotes: string | null
  setupAction?: ReactNode
  history: DetailsHistoryEntry[]
  historyError: boolean
}) {
  return (
    <>
      {statusCard}
      {editHref && (
        <Button variant="outline" className="self-start" render={<Link href={editHref} />} nativeButton={false}>
          <Pencil data-icon="inline-start" />
          Edit project
        </Button>
      )}
      <Section title="Details">
        <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{f.label}</dt>
              <dd className={f.value ? 'break-words text-sm font-medium text-foreground' : 'text-sm text-muted-foreground'}>
                {f.value ?? 'Not provided'}
              </dd>
            </div>
          ))}
        </dl>
      </Section>
      {description && (
        <Section title="Description">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{description}</p>
        </Section>
      )}
      {legalDescription && (
        <Section title="Legal description">
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{legalDescription}</p>
        </Section>
      )}
      {internalNotes && (
        <div className="flex flex-col gap-1 rounded-xl bg-champagne-soft p-3">
          <h3 className="text-xs font-medium text-warning">Internal notes · staff only</h3>
          <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{internalNotes}</p>
        </div>
      )}
      {setupAction}
      <Section title={`Status history${history.length === 30 ? ' (most recent)' : ''}`}>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {historyError ? 'Status history could not be loaded. Refresh the page to try again.' : 'No status changes recorded yet.'}
          </p>
        ) : (
          <ol className="flex flex-col divide-y rounded-xl border">
            {history.map((entry) => (
              <li key={entry.id} className="flex flex-col gap-1 px-3 py-2.5">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                  {entry.from_status ? (
                    <>
                      <span className="text-muted-foreground">{PROJECT_STATUS_LABELS[entry.from_status as ProjectStatus]}</span>
                      <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" />
                      <span>{PROJECT_STATUS_LABELS[entry.to_status as ProjectStatus]}</span>
                    </>
                  ) : (
                    `Created as ${PROJECT_STATUS_LABELS[entry.to_status as ProjectStatus]}`
                  )}
                </p>
                {entry.note && <p className="rounded-lg bg-[#F3F4F6] px-2.5 py-1.5 text-sm text-foreground/80">{entry.note}</p>}
                <p className="text-xs text-muted-foreground">
                  <time dateTime={entry.created_at}>{formatDateTime(entry.created_at)}</time>
                  {` · By ${entry.byName}`}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  )
}
