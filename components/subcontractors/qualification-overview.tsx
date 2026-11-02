import Link from 'next/link'
import { ArrowRight, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/shared/page-header'
import { formatDate } from '@/lib/format'
import { nextRequiredAction, plural, progressSummary, vettingStatusOf, type QualificationSummary } from '@/lib/subcontractor-qualification'
import type { ChecklistItem, QualificationAvailability } from '@/lib/subcontractor-qualification-data'
import type { CompanyContact } from '@/lib/contacts-data'
import { QualificationBadge } from '@/components/subcontractors/qualification-badge'
import { RequestDocumentsButton, type LastRequest } from '@/components/subcontractors/request-documents-dialog'

/** Compact qualification status for the Overview tab. The full checklist lives in the Qualification tab. */
export function QualificationOverview({
  companyId,
  companyName,
  companyActive,
  availability,
  summary,
  items,
  lastUpdate,
  today,
  contacts,
  people,
  lastRequest,
  qualificationHref,
}: {
  companyId: string
  companyName: string
  companyActive: boolean
  availability: QualificationAvailability
  summary: QualificationSummary | null
  items: ChecklistItem[]
  lastUpdate: string | null
  today: string
  contacts: CompanyContact[]
  people: { id: string; label: string }[]
  lastRequest: LastRequest
  qualificationHref: string
}) {
  const vetting = vettingStatusOf(summary ?? undefined)
  const missingRequired = items.filter((i) => i.mandatory && i.effective !== 'satisfied')
  const nextAction = nextRequiredAction(summary, today)
  const canRequest = availability === 'ready' && vetting !== 'qualified' && vetting !== 'not_qualified'

  return (
    <Surface aria-labelledby="qual-overview-heading" className="gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="size-4 text-primary" aria-hidden="true" />
          <h2 id="qual-overview-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
            Qualification
          </h2>
        </div>
        {availability === 'ready' && <QualificationBadge summary={summary} />}
      </div>

      {availability !== 'ready' ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {availability === 'error'
            ? 'Qualification could not be loaded. Refresh the page to try again.'
            : 'Subcontractor vetting is not set up in this environment yet.'}
        </p>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t pt-4 md:grid-cols-4">
            <Stat label="Progress">{summary ? progressSummary(summary) : 'Not started'}</Stat>
            <Stat label="Missing required">
              {summary?.started_at ? (missingRequired.length ? plural(missingRequired.length, 'item') : 'None') : '—'}
            </Stat>
            <Stat label="Last update">{lastUpdate ? formatDate(lastUpdate) : 'No activity yet'}</Stat>
            <Stat label="Completion">{summary ? `${Math.round(summary.completion_percent ?? 0)}%` : '0%'}</Stat>
          </dl>

          {missingRequired.length > 0 && (
            <p className="text-sm text-muted-foreground text-pretty">
              <span className="font-medium text-foreground">Still needed: </span>
              {missingRequired
                .slice(0, 4)
                .map((i) => i.title)
                .join(', ')}
              {missingRequired.length > 4 ? `, and ${missingRequired.length - 4} more` : ''}
            </p>
          )}

          <div className="flex flex-col gap-3 rounded-lg bg-muted/40 px-4 py-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-foreground text-pretty">
              <span className="font-medium">Next: </span>
              {nextAction ?? 'No action needed right now.'}
            </p>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" variant="outline" render={<Link href={qualificationHref} scroll={false} />} nativeButton={false}>
                Review qualification
                <ArrowRight data-icon="inline-end" />
              </Button>
              {canRequest && (
                <RequestDocumentsButton
                  companyId={companyId}
                  companyName={companyName}
                  items={items}
                  contacts={contacts}
                  people={people}
                  companyInactive={!companyActive}
                  lastRequest={lastRequest}
                  size="sm"
                />
              )}
            </div>
          </div>
        </>
      )}
    </Surface>
  )
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}
