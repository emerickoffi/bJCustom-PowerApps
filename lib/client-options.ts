export type ClientOption = { value: string; label: string }

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
