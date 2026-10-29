import { StatusPill } from '@/components/shared/status-badge'
import { DAILY_LOG_STATUS_LABELS, crewTotals, formatHours, type DailyLogStatus } from '@/lib/daily-logs'
import type { DailyLogCrew, DailyLogRecord, ScheduleActivityOption } from '@/lib/daily-logs-data'

export function DailyLogStatusBadge({ status, className }: { status: DailyLogStatus; className?: string }) {
  return (
    <StatusPill tone={status === 'finalized' ? 'primary' : 'warning'} className={className}>
      {DAILY_LOG_STATUS_LABELS[status]}
    </StatusPill>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex break-inside-avoid flex-col gap-3 border-t border-border/70 pt-5 first:border-t-0 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Field({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === '') return null
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{value}</dd>
    </div>
  )
}

function Fields({ items }: { items: [string, string | number | null][] }) {
  const shown = items.filter(([, v]) => v !== null && v !== '')
  if (!shown.length) return <p className="text-sm text-muted-foreground">Not recorded.</p>
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {shown.map(([label, value]) => (
        <Field key={label} label={label} value={value} />
      ))}
    </dl>
  )
}

/** Read-only body of a daily log, shared by the detail page and the printable PDF view. */
export function DailyLogReport({ log, crews, activities }: { log: DailyLogRecord; crews: DailyLogCrew[]; activities: ScheduleActivityOption[] }) {
  const totals = crewTotals(crews)
  return (
    <div className="flex flex-col gap-6">
      <Block title="Weather and site">
        <Fields
          items={[
            ['Conditions', log.weather_conditions],
            ['Temperature', log.temperature_f === null ? null : `${log.temperature_f}°F`],
            ['Weather impact', log.weather_impact],
            ['Site conditions', log.site_conditions],
          ]}
        />
        {(log.weather_conditions || log.temperature_f !== null) && <p className="text-xs text-muted-foreground">Weather recorded manually by staff.</p>}
      </Block>

      <Block title="Crews on site">
        {crews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No crews recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-4 font-medium">Trade or crew</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Crew size</th>
                  <th scope="col" className="py-2 pr-4 text-right font-medium">Hours</th>
                  <th scope="col" className="py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {crews.map((c) => (
                  <tr key={c.id} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-4 font-medium text-foreground">{c.trade}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.crew_size ?? '—'}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c.hours_worked === null ? '—' : formatHours(c.hours_worked)}</td>
                    <td className="whitespace-pre-wrap py-2 text-muted-foreground">{c.notes ?? ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="text-xs text-muted-foreground">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{totals.workers}</td>
                  <td className="py-2 pr-4 text-right tabular-nums">{formatHours(totals.hours)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Block>

      <Block title="Work">
        <Fields
          items={[
            ['Work performed', log.work_performed],
            ['Progress notes', log.progress_notes],
            ['Planned next work', log.work_planned_next],
          ]}
        />
        {activities.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Related schedule activities</p>
            <ul className="flex flex-wrap gap-2">
              {activities.map((a) => (
                <li key={a.id} className="rounded-md bg-muted px-2 py-1 text-xs text-foreground">
                  {a.name}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Block>

      <Block title="Materials and equipment">
        <Fields
          items={[
            ['Materials delivered', log.materials_delivered],
            ['Equipment on site', log.equipment_used],
            ['Delivery notes', log.delivery_notes],
          ]}
        />
      </Block>

      <Block title="Delays and safety">
        <Fields
          items={[
            ['Delay', log.delay_description],
            ['Delay reason', log.delay_reason],
            ['Delay impact', log.delay_impact],
            ['Corrective actions', log.corrective_actions],
            ['Safety observations', log.safety_observations],
          ]}
        />
      </Block>
    </div>
  )
}
