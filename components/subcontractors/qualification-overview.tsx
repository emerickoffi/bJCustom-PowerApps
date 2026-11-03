import Link from 'next/link'
import { ArrowRight, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/shared/page-header'
import { CardSectionHeader } from '@/components/shared/card-section-header'
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
  // "Missing" means required evidence not yet received; items awaiting review, rejected, or expired are not counted.
  const missingRequired = items.filter((i) => i.mandatory && i.effective === 'missing')
  const nextAction = nextRequiredAction(summary, today)
  const canRequest = availability === 'ready' && vetting !== 'qualified' && vetting !== 'not_qualified'
  const percent = Math.max(0, Math.min(100, Math.round(summary?.completion_percent ?? 0)))
  const started = Boolean(summary?.started_at)

  return (
    <Surface aria-labelledby="qual-overview-heading" className="gap-4">
      <CardSectionHeader
        id="qual-overview-heading"
        title="Qualification"
        icon={ClipboardCheck}
        tone="cobalt"
        action={availability === 'ready' && <QualificationBadge summary={summary} />}
      />

      {availability !== 'ready' ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          {availability === 'error'
            ? 'Qualification could not be loaded. Refresh the page to try again.'
            : 'Subcontractor vetting is not set up in this environment yet.'}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:gap-8">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{summary ? progressSummary(summary) : 'Not started'}</p>
                <span className="text-sm font-semibold tabular-nums text-foreground">{`${percent}%`}</span>
              </div>
              <div
                role="progressbar"
                aria-label="Required items approved"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
              </div>
            </div>
            <dl className="flex shrink-0 flex-wrap gap-x-8 gap-y-2">
              <Stat label="Missing required">
                {started ? (missingRequired.length ? plural(missingRequired.length, 'item') : 'None') : '—'}
              </Stat>
              <Stat label="Last updated">{lastUpdate ? formatDate(lastUpdate) : 'No activity yet'}</Stat>
            </dl>
          </div>

          {started && missingRequired.length > 0 && (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Still needed</span>
              <ul className="flex flex-wrap gap-1.5" aria-label="Missing required items">
                {missingRequired.slice(0, 3).map((i) => (
                  <li key={i.requirementId} className="rounded-md border border-border/80 px-2 py-0.5 text-xs font-medium text-foreground">
                    {i.title}
                  </li>
                ))}
              </ul>
              <Link
                href={qualificationHref}
                scroll={false}
                className="w-fit text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                {missingRequired.length > 3 ? `View all requirements (${missingRequired.length - 3} more)` : 'View all requirements'}
              </Link>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border/60 pt-4 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-foreground text-pretty">
              <span className="font-medium">Next: </span>
              <span className="text-muted-foreground">{nextAction ?? 'No action needed right now.'}</span>
            </p>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{children}</dd>
    </div>
  )
}
