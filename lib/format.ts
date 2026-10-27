const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})

export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—'
  return currency.format(cents / 100)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = value.length === 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
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
