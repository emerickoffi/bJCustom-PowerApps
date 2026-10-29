import { cache } from 'react'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getDailyLog, getDailyLogChildren, getScheduleActivityOptions, requireDailyLogProject } from '@/lib/daily-logs-data'
import { DAILY_LOG_STATUS_LABELS, dailyLogPdfBaseName } from '@/lib/daily-logs'
import { formatDate, formatDateTime } from '@/lib/format'
import { DailyLogReport } from '@/components/daily-logs/daily-log-report'
import { PrintButton } from '@/components/estimates/print-button'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const loadLog = cache(async (id: string) => {
  const session = await requireStaff()
  if (!UUID.test(id)) notFound()
  const supabase = await createClient()
  const { data: ref } = await supabase.from('daily_logs').select('project_id').eq('id', id).eq('organization_id', session.organizationId).maybeSingle()
  if (!ref) notFound()
  const { project } = await requireDailyLogProject(ref.project_id as string)
  const log = await getDailyLog(project.id, id)
  if (!log) notFound()
  return { project, log }
})

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const { project, log } = await loadLog(id)
  return {
    title: { absolute: dailyLogPdfBaseName({ projectNumber: project.project_number, projectName: project.name, logDate: log.log_date }) },
    robots: { index: false },
  }
}

export default async function DailyLogPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { project, log } = await loadLog(id)
  const [children, activities] = await Promise.all([getDailyLogChildren(log.id), getScheduleActivityOptions(project.id)])
  const linked = activities.filter((a) => children.activityIds.includes(a.id))

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 bg-background px-6 py-10 print:max-w-none print:px-0 print:py-0">
      <div className="flex justify-end print:hidden">
        <PrintButton />
      </div>
      <header className="flex flex-col gap-1 border-b border-border pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Daily log</p>
        <h1 className="font-serif text-2xl font-semibold text-foreground">{formatDate(log.log_date)}</h1>
        <p className="text-sm text-muted-foreground">
          {[project.project_number, project.name].filter(Boolean).join(' · ')} · {DAILY_LOG_STATUS_LABELS[log.status]}
          {log.finalized_at ? ` ${formatDateTime(log.finalized_at)}` : ''}
        </p>
      </header>
      <DailyLogReport log={log} crews={children.crews} activities={linked} />
      {children.photos.length > 0 && (
        <section className="flex flex-col gap-3 border-t border-border/70 pt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Photos</h2>
          <ul className="grid grid-cols-2 gap-4">
            {children.photos.map((p) => (
              <li key={p.id} className="flex break-inside-avoid flex-col gap-1">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- signed storage URLs are short-lived
                  <img src={p.url} alt={p.caption || p.file_name} className="aspect-[4/3] w-full rounded-md object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">Preview unavailable</div>
                )}
                {p.caption && <p className="text-xs text-foreground">{p.caption}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {log.status === 'draft' && <p className="text-xs text-muted-foreground">Draft: this log has not been finalized and may still change.</p>}
    </main>
  )
}
