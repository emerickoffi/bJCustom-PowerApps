const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return currency.format(cents / 100)
}

/**
 * The organization's configured zone (organization_settings.timezone). Formatting must never
 * depend on the runtime's zone: Vercel renders in UTC while browsers hydrate in local time,
 * which shifted times by hours and caused React hydration error #418.
 */
export const APP_TIME_ZONE = 'America/Chicago'

const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string, withTime: boolean): Intl.DateTimeFormat {
  const key = `${timeZone}|${withTime}`
  let f = formatterCache.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      ...(withTime ? { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' } : {}),
    })
    formatterCache.set(key, f)
  }
  return f
}

/**
 * Date-only values (YYYY-MM-DD) are calendar dates and are rendered as-is in UTC so they never
 * shift a day. Full timestamps are rendered on the calendar of `timeZone`.
 */
export function formatDate(value: string | null | undefined, timeZone: string = APP_TIME_ZONE): string {
  if (!value) return '—'
  const dateOnly = DATE_ONLY_RE.exec(value)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    return formatter('UTC', false).format(new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))))
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatter(timeZone, false).format(date)
}

export function formatDateTime(value: string | null | undefined, timeZone: string = APP_TIME_ZONE): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return formatter(timeZone, true).format(date)
}

export function fullName(first?: string | null, last?: string | null): string {
  return [first, last].filter(Boolean).join(' ') || '—'
}

export function initials(name?: string | null): string {
  if (!name) return '?'
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export function formatAddress(parts: {
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
}): string {
  const street = [parts.address_line1, parts.address_line2].filter(Boolean).join(', ')
  const locality = [parts.city, [parts.state, parts.postal_code].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ')
  return [street, locality].filter(Boolean).join(', ') || '—'
}

/** Strips characters that carry meaning in PostgREST filter syntax. */
export function sanitizeSearch(raw: string | undefined | null): string {
  return (raw ?? '').replace(/[,()*%\\:."']/g, ' ').trim().slice(0, 80)
}
