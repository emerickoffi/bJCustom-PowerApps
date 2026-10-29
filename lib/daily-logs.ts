import { z } from 'zod'
import { toFilenameSegment } from './estimate-pdf.ts'

export type DailyLogStatus = 'draft' | 'finalized'

export const DAILY_LOG_STATUS_LABELS: Record<DailyLogStatus, string> = {
  draft: 'Draft',
  finalized: 'Finalized',
}

export function isDailyLogStatus(value: unknown): value is DailyLogStatus {
  return value === 'draft' || value === 'finalized'
}

export const DAILY_LOG_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
export const DAILY_LOG_PHOTO_MAX_BYTES = 15 * 1024 * 1024
export const DAILY_LOG_PHOTO_LIMIT = 30
export const DAILY_LOG_CREW_LIMIT = 40
export const DAILY_LOG_ACTIVITY_LIMIT = 50
export const DAILY_LOG_PAGE_SIZE = 20

export function dailyLogsPath(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}/daily-logs`
}

export function dailyLogPath(projectId: string, logId: string) {
  return `${dailyLogsPath(projectId)}/${encodeURIComponent(logId)}`
}

export function dailyLogPrintPath(logId: string) {
  return `/print/daily-logs/${encodeURIComponent(logId)}`
}

/** Storage path inside the private project-media bucket; RLS keys access off the log id segment. */
export function dailyLogPhotoPath(logId: string, fileName: string) {
  return `daily-logs/${logId}/${fileName}`
}

export function isDailyLogPhotoPath(logId: string, path: string) {
  return path.startsWith(`daily-logs/${logId}/`) && !path.includes('..') && path.split('/').length === 3
}

/** `{ProjectNumber}_{ProjectName}_Daily-Log_{YYYY-MM-DD}` — browsers append `.pdf` to the print title. */
export function dailyLogPdfBaseName(input: { projectNumber: string | null | undefined; projectName: string | null | undefined; logDate: string }) {
  return [toFilenameSegment(input.projectNumber), toFilenameSegment(input.projectName), `Daily-Log_${input.logDate}`]
    .filter(Boolean)
    .join('_')
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** Calendar date in the organization's time zone, so "today" matches the job site rather than the server. */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const optionalInt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === '') return null
      const n = Number(v)
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `${label} must be a whole number from ${min} to ${max}` })
        return z.NEVER
      }
      return n
    })

const optionalHours = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === '') return null
    const n = Number(v)
    if (!Number.isFinite(n) || n < 0 || n > 5000 || Math.round(n * 100) !== n * 100) {
      ctx.addIssue({ code: 'custom', message: 'Hours must be between 0 and 5,000 with at most 2 decimals' })
      return z.NEVER
    }
    return n
  })

export const crewEntrySchema = z.object({
  trade: z.string().trim().min(1, 'Enter a trade or crew name').max(120, 'Trade must be 120 characters or fewer'),
  crew_size: optionalInt(0, 500, 'Crew size'),
  hours_worked: optionalHours,
  notes: z.string().trim().max(1000, 'Crew notes must be 1,000 characters or fewer').transform((v) => (v === '' ? null : v)),
})

export type CrewEntry = z.infer<typeof crewEntrySchema>

const text = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be ${max.toLocaleString()} characters or fewer`)
    .transform((v) => (v === '' ? null : v))

export const dailyLogHeaderSchema = z
  .object({
    log_date: z.string().refine(isIsoDate, 'Choose a valid log date'),
    weather_conditions: text(200, 'Weather conditions'),
    temperature_f: optionalInt(-60, 140, 'Temperature'),
    weather_impact: text(2000, 'Weather impact'),
    site_conditions: text(2000, 'Site conditions'),
    work_performed: text(8000, 'Work performed'),
    progress_notes: text(4000, 'Progress notes'),
    work_planned_next: text(4000, 'Planned next work'),
    materials_delivered: text(4000, 'Materials delivered'),
    equipment_used: text(4000, 'Equipment used'),
    delivery_notes: text(2000, 'Delivery notes'),
    delay_description: text(4000, 'Delay description'),
    delay_reason: text(1000, 'Delay reason'),
    delay_impact: text(1000, 'Delay impact'),
    corrective_actions: text(4000, 'Corrective actions'),
    safety_observations: text(4000, 'Safety observations'),
  })
  .superRefine((value, ctx) => {
    if (!value.delay_description && (value.delay_reason || value.delay_impact)) {
      ctx.addIssue({ code: 'custom', path: ['delay_description'], message: 'Describe the delay when recording a reason or impact' })
    }
  })

export type DailyLogHeader = z.infer<typeof dailyLogHeaderSchema>

export const DAILY_LOG_TEXT_FIELDS = [
  'weather_conditions',
  'weather_impact',
  'site_conditions',
  'work_performed',
  'progress_notes',
  'work_planned_next',
  'materials_delivered',
  'equipment_used',
  'delivery_notes',
  'delay_description',
  'delay_reason',
  'delay_impact',
  'corrective_actions',
  'safety_observations',
] as const

type ParseResult =
  | { ok: true; header: DailyLogHeader; crews: CrewEntry[]; activityIds: string[] }
  | { ok: false; error: string; fieldErrors: Record<string, string> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Parses the daily log form. Crew rows arrive as parallel `crew_trade` / `crew_size` / `crew_hours` /
 * `crew_notes` fields; fully blank rows are dropped so an empty trailing row never blocks a save.
 */
export function parseDailyLogForm(
  formData: FormData,
  options: { today: string; allowedActivityIds: ReadonlySet<string> },
): ParseResult {
  const raw: Record<string, string> = {}
  for (const key of ['log_date', 'temperature_f', ...DAILY_LOG_TEXT_FIELDS]) {
    const v = formData.get(key)
    raw[key] = typeof v === 'string' ? v : ''
  }
  const fieldErrors: Record<string, string> = {}
  const header = dailyLogHeaderSchema.safeParse(raw)
  if (!header.success) {
    for (const issue of header.error.issues) {
      const key = issue.path.join('.')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
  } else if (header.data.log_date > addDays(options.today, 1)) {
    fieldErrors.log_date = 'A daily log cannot be dated in the future'
  }

  const strings = (key: string) => formData.getAll(key).map((v) => (typeof v === 'string' ? v : ''))
  const trades = strings('crew_trade')
  const sizes = strings('crew_size')
  const hours = strings('crew_hours')
  const notes = strings('crew_notes')
  const crews: CrewEntry[] = []
  trades.forEach((trade, i) => {
    const row = { trade, crew_size: sizes[i] ?? '', hours_worked: hours[i] ?? '', notes: notes[i] ?? '' }
    if (Object.values(row).every((v) => v.trim() === '')) return
    const parsed = crewEntrySchema.safeParse(row)
    if (!parsed.success) {
      if (!fieldErrors.crews) fieldErrors.crews = `Crew row ${i + 1}: ${parsed.error.issues[0]?.message ?? 'invalid entry'}`
      return
    }
    crews.push(parsed.data)
  })
  if (crews.length > DAILY_LOG_CREW_LIMIT) fieldErrors.crews = `Record at most ${DAILY_LOG_CREW_LIMIT} crew entries`

  const activityIds = [...new Set(strings('activity_ids'))]
  if (activityIds.some((id) => !UUID.test(id) || !options.allowedActivityIds.has(id))) {
    fieldErrors.activity_ids = 'One of the selected schedule activities is no longer on this project'
  } else if (activityIds.length > DAILY_LOG_ACTIVITY_LIMIT) {
    fieldErrors.activity_ids = `Link at most ${DAILY_LOG_ACTIVITY_LIMIT} schedule activities`
  }

  if (Object.keys(fieldErrors).length || !header.success) {
    return { ok: false, error: 'Please correct the highlighted fields.', fieldErrors }
  }
  return { ok: true, header: header.data, crews, activityIds }
}

export function crewTotals(crews: { crew_size: number | null; hours_worked: number | null }[]) {
  return crews.reduce(
    (t, c) => ({ workers: t.workers + (c.crew_size ?? 0), hours: t.hours + Number(c.hours_worked ?? 0) }),
    { workers: 0, hours: 0 },
  )
}

export function formatHours(hours: number) {
  return `${Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0$/, '')} h`
}

export function canEditDailyLog(status: DailyLogStatus, archived: boolean) {
  return status === 'draft' && !archived
}

export type DailyLogFilters = {
  from: string | null
  to: string | null
  status: DailyLogStatus | null
  delays: boolean
  page: number
}

export function parseDailyLogFilters(params: Record<string, string | string[] | undefined>): DailyLogFilters {
  const one = (k: string) => {
    const v = params[k]
    return typeof v === 'string' ? v : undefined
  }
  let from = isIsoDate(one('from')) ? one('from')! : null
  let to = isIsoDate(one('to')) ? one('to')! : null
  if (from && to && from > to) [from, to] = [to, from]
  const status = one('status')
  const page = Number.parseInt(one('page') ?? '1', 10)
  return {
    from,
    to,
    status: isDailyLogStatus(status) ? status : null,
    delays: one('delays') === '1',
    page: Number.isFinite(page) && page > 0 && page <= 10_000 ? page : 1,
  }
}

export function dailyLogFilterQuery(filters: DailyLogFilters, overrides: Partial<DailyLogFilters> = {}) {
  const f = { ...filters, ...overrides }
  const q = new URLSearchParams()
  if (f.from) q.set('from', f.from)
  if (f.to) q.set('to', f.to)
  if (f.status) q.set('status', f.status)
  if (f.delays) q.set('delays', '1')
  if (f.page > 1) q.set('page', String(f.page))
  const s = q.toString()
  return s ? `?${s}` : ''
}
