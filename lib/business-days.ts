export const MAX_BUSINESS_DAYS = 10_000

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

/** Parses a YYYY-MM-DD string as a UTC calendar day so DST and local offsets never shift it. */
function parseIsoDay(iso: string): number | null {
  const match = ISO_DATE.exec(iso)
  if (!match) return null
  const [, y, m, d] = match.map(Number)
  const time = Date.UTC(y, m - 1, d)
  const check = new Date(time)
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
  return time
}

function toIsoDay(time: number) {
  return new Date(time).toISOString().slice(0, 10)
}

/**
 * Returns the date of the Nth Monday–Friday working day. A weekday start counts as day 1;
 * a weekend start counts the following Monday as day 1. Holidays are not excluded.
 */
export function addBusinessDays(startIso: string, businessDays: number): string | null {
  if (!Number.isInteger(businessDays) || businessDays < 1 || businessDays > MAX_BUSINESS_DAYS) return null
  let time = parseIsoDay(startIso)
  if (time === null) return null

  const startDow = new Date(time).getUTCDay()
  if (startDow === 6) time += 2 * DAY_MS
  else if (startDow === 0) time += DAY_MS

  const fullWeeks = Math.floor((businessDays - 1) / 5)
  let remaining = (businessDays - 1) % 5
  time += fullWeeks * 7 * DAY_MS
  while (remaining > 0) {
    time += DAY_MS
    const dow = new Date(time).getUTCDay()
    if (dow !== 0 && dow !== 6) remaining -= 1
  }
  return toIsoDay(time)
}

export type BusinessDaysInput = { value: number | null; error: string | null }

/** Accepts blank (no duration) or a positive whole number. */
export function parseBusinessDays(raw: string): BusinessDaysInput {
  const text = raw.trim()
  if (text === '') return { value: null, error: null }
  if (!/^-?\d*\.?\d+$/.test(text)) return { value: null, error: 'Enter a whole number of business days' }
  const num = Number(text)
  if (num < 0) return { value: null, error: 'Business days cannot be negative' }
  if (!Number.isInteger(num)) return { value: null, error: 'Use whole business days, no fractions' }
  if (num === 0) return { value: null, error: 'Enter at least 1 business day' }
  if (num > MAX_BUSINESS_DAYS) return { value: null, error: `Enter ${MAX_BUSINESS_DAYS.toLocaleString('en-US')} business days or fewer` }
  return { value: num, error: null }
}

/** The calculated completion date, or null when either input is missing or invalid. */
export function calculateTargetCompletion(startIso: string | null | undefined, rawDays: string): string | null {
  if (!startIso) return null
  const { value } = parseBusinessDays(rawDays)
  return value === null ? null : addBusinessDays(startIso, value)
}
