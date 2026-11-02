export type ClientOption = { value: string; label: string; detail?: string }

export function formatClientOptionLabel(c: {
  first_name: string
  last_name: string
  company_name: string | null
  client_number: string | number | null
}): string {
  const company = c.company_name ? ` (${c.company_name})` : ''
  const number = c.client_number != null ? ` — #${c.client_number}` : ''
  return `${c.last_name}, ${c.first_name}${company}${number}`
}

/** Secondary line that tells apart clients who share a name. */
export function formatClientOptionDetail(c: {
  email?: string | null
  phone?: string | null
  city?: string | null
  state?: string | null
}): string | undefined {
  const place = [c.city, c.state].filter(Boolean).join(', ')
  const parts = [c.email, c.phone, place].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}
