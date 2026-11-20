/**
 * Time tracking: pure helpers (no database). Times are stored in UTC; the company's time zone decides what
 * "today", "this week" and a typed-in 7:00 AM mean.
 */
import { ESTIMATE_CATEGORIES } from './estimates.ts'

export const TIME_STATUSES = ['open', 'pending', 'approved', 'rejected'] as const
export type TimeStatus = (typeof TIME_STATUSES)[number]

export const TIME_STATUS_LABELS: Record<TimeStatus, string> = {
  open: 'Clocked in',
  pending: 'Awaiting approval',
  approved: 'Approved',
  rejected: 'Needs changes',
}

/** Cost codes a worker can charge time to: the estimate categories job costing already uses. */
export const TIME_COST_CATEGORIES = ESTIMATE_CATEGORIES

export type TimeEntry = {
  id: string
  project_id: string
  user_id: string
  cost_category: string
  started_at: string
  ended_at: string | null
  break_minutes: number
  worked_minutes: number | null
  notes: string | null
  source: 'clock' | 'manual'
  status: TimeStatus
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  hourly_cost_cents: number | null
  cost_cents: number | null
}

export const TIME_ENTRY_COLUMNS =
  'id, project_id, user_id, cost_category, started_at, ended_at, break_minutes, worked_minutes, notes, source, status, review_note, reviewed_by, reviewed_at, hourly_cost_cents, cost_cents'

/** 450 → "7h 30m"; 0 → "0h". */
export function formatMinutes(minutes: number | null | undefined): string {
  const m = Math.max(0, Math.round(minutes ?? 0))
  const h = Math.floor(m / 60)
  const rest = m % 60
  return rest ? `${h}h ${String(rest).padStart(2, '0')}m` : `${h}h`
}

/** 450 → "7.50" (decimal hours, the way payroll wants them). */
export function decimalHours(minutes: number | null | undefined): string {
  return (Math.max(0, minutes ?? 0) / 60).toFixed(2)
}

/** Minutes worked so far on a running clock. */
export function elapsedMinutes(startedAt: string, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(startedAt)) / 60000))
}

function parts(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const out: Record<string, number> = {}
  for (const p of f.formatToParts(date)) if (p.type !== 'literal') out[p.type] = Number(p.value)
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** Offset of the zone from UTC at that instant, in minutes (e.g. -360 for Chicago in winter). */
function offsetMinutes(date: Date, timeZone: string): number {
  const p = parts(date, timeZone)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000)
}

/**
 * The instant at which the wall clock in `timeZone` reads `date` (YYYY-MM-DD) `time` (HH:MM).
 * Returns null for malformed input. During the spring-forward gap the later valid time is used.
 */
export function zonedToUtc(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const t = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!d || !t) return null
  const [y, mo, da, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])]
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null
  const wall = Date.UTC(y, mo - 1, da, h, mi)
  let guess = new Date(wall)
  try {
    for (let i = 0; i < 3; i++) guess = new Date(wall - offsetMinutes(guess, timeZone) * 60000)
  } catch {
    return null
  }
  const check = parts(guess, timeZone)
  if (check.year !== y || check.month !== mo || check.day !== da) return null
  return guess
}

/** YYYY-MM-DD and HH:MM of an instant in the zone. */
export function utcToZoned(iso: string, timeZone: string): { date: string; time: string } {
  const p = parts(new Date(iso), timeZone)
  const pad = (n: number) => String(n).padStart(2, '0')
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` }
}

/** Monday of the week containing `isoDate` (weeks run Monday to Sunday). */
export function weekStart(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`))
}

/** UTC bounds of [from, to] inclusive whole days in the zone. */
export function zonedDayRange(from: string, to: string, timeZone: string): { start: string; end: string } {
  const start = zonedToUtc(from, '00:00', timeZone) ?? new Date(`${from}T00:00:00Z`)
  const end = zonedToUtc(addDaysIso(to, 1), '00:00', timeZone) ?? new Date(`${addDaysIso(to, 1)}T00:00:00Z`)
  return { start: start.toISOString(), end: end.toISOString() }
}

export type ManualEntryInput = {
  date: string
  start: string
  end: string
  breakMinutes: string | number
}

export type ManualEntryResult =
  | { ok: true; startedAt: string; endedAt: string; breakMinutes: number }
  | { ok: false; error: string }

/**
 * Turns a typed entry (date, start, end, break) into UTC instants. An end time earlier than the start is read as
 * the next morning (night shift), so 10:00 PM – 6:00 AM works.
 */
export function parseManualEntry(input: ManualEntryInput, timeZone: string): ManualEntryResult {
  if (!isIsoDate(input.date)) return { ok: false, error: 'Choose a date.' }
  const start = zonedToUtc(input.date, input.start, timeZone)
  if (!start) return { ok: false, error: 'Enter a start time.' }
  let end = zonedToUtc(input.date, input.end, timeZone)
  if (!end) return { ok: false, error: 'Enter an end time.' }
  if (end.getTime() <= start.getTime()) end = zonedToUtc(addDaysIso(input.date, 1), input.end, timeZone)
  if (!end || end.getTime() <= start.getTime()) return { ok: false, error: 'The end time must be after the start time.' }
  const breakMinutes = Number(input.breakMinutes || 0)
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0 || breakMinutes > 720) {
    return { ok: false, error: 'Break must be between 0 and 720 minutes.' }
  }
  const span = (end.getTime() - start.getTime()) / 60000
  if (span > 24 * 60) return { ok: false, error: 'One entry can’t be longer than 24 hours.' }
  if (breakMinutes >= span) return { ok: false, error: 'The break is longer than the time worked.' }
  return { ok: true, startedAt: start.toISOString(), endedAt: end.toISOString(), breakMinutes }
}

export type TotalsByKey = Map<string, { minutes: number; costCents: number; entries: number }>

/** Sums worked minutes (and approved cost) by any key: person, project, day, cost code. */
export function totalsBy(entries: Pick<TimeEntry, 'worked_minutes' | 'cost_cents'>[], keyOf: (e: never) => string): TotalsByKey {
  const out: TotalsByKey = new Map()
  for (const e of entries) {
    const key = keyOf(e as never)
    const row = out.get(key) ?? { minutes: 0, costCents: 0, entries: 0 }
    row.minutes += e.worked_minutes ?? 0
    row.costCents += e.cost_cents ?? 0
    row.entries += 1
    out.set(key, row)
  }
  return out
}

/** Neutralises spreadsheet formulas and quotes a CSV cell. */
export function csvCell(value: string | number | null | undefined): string {
  let s = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export type CsvRow = {
  person: string
  project: string
  costCode: string
  entry: Pick<TimeEntry, 'started_at' | 'ended_at' | 'break_minutes' | 'worked_minutes' | 'status' | 'hourly_cost_cents' | 'cost_cents' | 'notes'>
}

/** Payroll / accounting export. Dates and times are in the company's zone. */
export function timeEntriesCsv(rows: CsvRow[], timeZone: string): string {
  const header = ['Date', 'Person', 'Project', 'Cost code', 'Start', 'End', 'Break (min)', 'Hours', 'Status', 'Hourly cost', 'Labor cost', 'Notes']
  const lines = [header.join(',')]
  for (const r of rows) {
    const start = utcToZoned(r.entry.started_at, timeZone)
    const end = r.entry.ended_at ? utcToZoned(r.entry.ended_at, timeZone) : null
    const money = (c: number | null) => (c === null ? '' : (c / 100).toFixed(2))
    lines.push(
      [
        start.date,
        r.person,
        r.project,
        r.costCode,
        start.time,
        end ? (end.date === start.date ? end.time : `${end.date} ${end.time}`) : '',
        r.entry.break_minutes,
        decimalHours(r.entry.worked_minutes),
        TIME_STATUS_LABELS[r.entry.status],
        money(r.entry.hourly_cost_cents),
        money(r.entry.cost_cents),
        r.entry.notes ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  return `${lines.join('\r\n')}\r\n`
}
