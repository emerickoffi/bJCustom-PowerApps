'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  PreviewDetail,
  PreviewDetails,
  PreviewEmpty,
  PreviewSection,
  RecordPreviewBody,
  RecordPreviewHeader,
  RecordPreviewLayout,
} from '@/components/shared/record-preview'
import { DailyLogStatusBadge } from '@/components/daily-logs/daily-log-report'
import { formatDate, formatDateTime } from '@/lib/format'
import { formatHours, type DailyLogStatus } from '@/lib/daily-logs'
import {
  DAILY_LOG_PREVIEW_PANEL_ID,
  DAILY_LOG_PREVIEW_PARAM,
  dailyLogPreviewApiPath,
  dailyLogPreviewErrorState,
  type DailyLogPreview as PreviewData,
} from '@/lib/daily-log-preview'

export type DailyLogPreviewRecord = {
  id: string
  /** The log date, formatted; doubles as the preview title. */
  name: string
  status: DailyLogStatus
  projectName: string
  href: string
}

/** The Daily Logs list with its on-demand preview, sharing the Projects and Estimates pattern. */
export function DailyLogPreviewLayout({ logs, children }: { logs: DailyLogPreviewRecord[]; children: React.ReactNode }) {
  return (
    <RecordPreviewLayout
      records={logs}
      param={DAILY_LOG_PREVIEW_PARAM}
      panelId={DAILY_LOG_PREVIEW_PANEL_ID}
      label="Daily log preview"
      renderPreview={(log) => <DailyLogPreview key={log.id} log={log} />}
    >
      {children}
    </RecordPreviewLayout>
  )
}

function DailyLogPreview({ log }: { log: DailyLogPreviewRecord }) {
  return (
    <>
      <RecordPreviewHeader
        title={log.name}
        closeLabel="Close daily log preview"
        meta={
          <span className="flex min-w-0 flex-wrap items-center gap-2">
            <DailyLogStatusBadge status={log.status} />
            <span className="min-w-0 truncate text-xs text-muted-foreground">{log.projectName}</span>
          </span>
        }
        actions={
          <Button variant="view" size="sm" render={<Link href={log.href} />} nativeButton={false}>
            Open daily log
            <ArrowRight data-icon="inline-end" />
          </Button>
        }
      />
      <RecordPreviewBody<PreviewData>
        url={dailyLogPreviewApiPath(log.id)}
        recordId={log.id}
        loadingLabel={`Loading daily log for ${log.name}`}
        errorState={dailyLogPreviewErrorState}
      >
        {(preview) => <PreviewSections preview={preview} />}
      </RecordPreviewBody>
    </>
  )
}

function Paragraph({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="line-clamp-4 whitespace-pre-line break-words text-sm text-foreground">{value}</p>
    </div>
  )
}

function PreviewSections({ preview }: { preview: PreviewData }) {
  const weather = [preview.weather, preview.temperatureF !== null ? `${preview.temperatureF}°F` : null].filter(Boolean).join(' · ')
  const hasWork = Boolean(preview.workPerformed || preview.progressNotes || preview.workPlannedNext)
  const crewSummary =
    preview.crews.length > 0
      ? [
          `${preview.crews.length} ${preview.crews.length === 1 ? 'crew' : 'crews'}`,
          preview.totalWorkers > 0 ? `${preview.totalWorkers} ${preview.totalWorkers === 1 ? 'worker' : 'workers'}` : null,
          preview.totalHours > 0 ? formatHours(preview.totalHours) : null,
        ]
          .filter(Boolean)
          .join(' · ')
      : null
  const companies = [...new Set(preview.crews.map((c) => c.company ?? c.trade).filter(Boolean))]
  const draft = preview.status === 'draft'

  return (
    <>
      <PreviewSection title="Overview">
        <PreviewDetails>
          <PreviewDetail label="Project">
            <Link
              href={`/projects/${preview.project.id}`}
              className="rounded-sm text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {preview.project.name}
            </Link>
            {preview.project.number && <span className="text-muted-foreground">{` · ${preview.project.number}`}</span>}
          </PreviewDetail>
          <PreviewDetail label="Log date">{formatDate(preview.logDate)}</PreviewDetail>
          {weather && <PreviewDetail label="Weather">{weather}</PreviewDetail>}
          {preview.siteConditions && <PreviewDetail label="Site conditions">{preview.siteConditions}</PreviewDetail>}
          {preview.finalizedAt && <PreviewDetail label="Finalized">{formatDateTime(preview.finalizedAt)}</PreviewDetail>}
        </PreviewDetails>
      </PreviewSection>

      <PreviewSection title="Work summary">
        {hasWork ? (
          <div className="flex flex-col gap-3">
            {preview.workPerformed && <Paragraph label="Work performed" value={preview.workPerformed} />}
            {preview.progressNotes && <Paragraph label="Progress notes" value={preview.progressNotes} />}
            {preview.workPlannedNext && <Paragraph label="Planned next" value={preview.workPlannedNext} />}
          </div>
        ) : (
          <PreviewEmpty>{draft ? 'No work recorded on this draft yet.' : 'No work was recorded for this day.'}</PreviewEmpty>
        )}
      </PreviewSection>

      <PreviewSection title="Jobsite">
        <PreviewDetails>
          <PreviewDetail label="Crew">
            {crewSummary ? (
              <>
                {crewSummary}
                {companies.length > 0 && <span className="block text-muted-foreground">{companies.join(', ')}</span>}
              </>
            ) : (
              <span className="text-muted-foreground">None recorded</span>
            )}
          </PreviewDetail>
          <PreviewDetail label="Photos">
            {preview.photoCount > 0 ? `${preview.photoCount} attached` : <span className="text-muted-foreground">None attached</span>}
          </PreviewDetail>
        </PreviewDetails>
        {(preview.hasDelays || preview.delay) && (
          <p className="flex items-start gap-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">
              <span className="font-medium">Delay reported</span>
              {preview.delay && <span className="line-clamp-3 text-foreground">{preview.delay}</span>}
            </span>
          </p>
        )}
        {preview.safety && <Paragraph label="Safety" value={preview.safety} />}
      </PreviewSection>
    </>
  )
}
