import type { InvoiceLineInput, InvoiceLineSource } from './invoices.ts'

/** Builds invoice lines from approved change orders and approved crew time (Add from). Pure; no money floats. */

export type BillableChangeOrder = {
  id: string
  co_number: string | null
  title: string
  price_cents: number
  selection_name: string | null
  /** Invoice number already billing it (draft, issued or paid), or null. */
  billed_on: string | null
}

export type BillableTimeEntry = {
  id: string
  user_id: string
  worked_minutes: number
  hourly_cost_cents: number | null
  started_at: string
  billed_on: string | null
}

export type TimeGroup = {
  userId: string
  name: string
  minutes: number
  entryIds: string[]
  /** Average cost rate across the entries (cents/hour), used as the default bill rate. */
  costRateCents: number
  firstDate: string
  lastDate: string
}

export const centsToRate = (cents: number) => (cents / 100).toFixed(2)

/** Minutes → hours with up to 3 decimals, as the invoice quantity ("7.5", "12.25", "0.333"). */
export function minutesToHours(minutes: number): string {
  const thousandths = Math.round((minutes * 1000) / 60)
  const whole = Math.floor(thousandths / 1000)
  const frac = String(thousandths % 1000).padStart(3, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : String(whole)
}

export function changeOrderLine(co: BillableChangeOrder): InvoiceLineInput {
  const ref = co.co_number ?? 'Change order'
  return {
    description: `${ref}: ${co.title}${co.selection_name ? ` (selection: ${co.selection_name})` : ''}`.slice(0, 500),
    quantity: '1',
    unitRate: centsToRate(co.price_cents),
    taxable: false,
    sources: [{ type: 'change_order', id: co.id }],
    sourceLabel: `From ${ref}`,
  }
}

/** Unbilled approved time grouped per person, oldest first. */
export function groupTime(entries: BillableTimeEntry[], names: Map<string, string>): TimeGroup[] {
  const groups = new Map<string, TimeGroup & { costTotal: number }>()
  for (const e of entries) {
    if (e.billed_on || e.worked_minutes <= 0) continue
    const day = e.started_at.slice(0, 10)
    const g = groups.get(e.user_id) ?? {
      userId: e.user_id,
      name: names.get(e.user_id) ?? 'Team member',
      minutes: 0,
      entryIds: [],
      costRateCents: 0,
      costTotal: 0,
      firstDate: day,
      lastDate: day,
    }
    g.minutes += e.worked_minutes
    g.costTotal += (e.hourly_cost_cents ?? 0) * e.worked_minutes
    g.entryIds.push(e.id)
    if (day < g.firstDate) g.firstDate = day
    if (day > g.lastDate) g.lastDate = day
    groups.set(e.user_id, g)
  }
  return [...groups.values()]
    .map(({ costTotal, ...g }) => ({ ...g, costRateCents: g.minutes ? Math.round(costTotal / g.minutes) : 0 }))
    .sort((a, b) => a.firstDate.localeCompare(b.firstDate) || a.name.localeCompare(b.name))
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-').map(Number)
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${d}`
}

/** One line per person. Bill rate: the one typed in, else that person's cost rate. */
export function timeLine(g: TimeGroup, billRateCents: number | null): InvoiceLineInput {
  const range = g.firstDate === g.lastDate ? shortDate(g.firstDate) : `${shortDate(g.firstDate)}–${shortDate(g.lastDate)}`
  const sources: InvoiceLineSource[] = g.entryIds.map((id) => ({ type: 'time_entry', id }))
  return {
    description: `Labor: ${g.name} (${range})`.slice(0, 500),
    quantity: minutesToHours(g.minutes),
    unitRate: centsToRate(billRateCents ?? g.costRateCents),
    taxable: false,
    sources,
    sourceLabel: `From ${g.entryIds.length} approved time ${g.entryIds.length === 1 ? 'entry' : 'entries'}`,
  }
}

/** Label for a saved line's sources (edit page). */
export function sourcesLabel(sources: InvoiceLineSource[], coNumbers: Map<string, string>): string | undefined {
  if (!sources.length) return undefined
  const cos = sources.filter((s) => s.type === 'change_order').map((s) => coNumbers.get(s.id) ?? 'change order')
  const time = sources.filter((s) => s.type === 'time_entry').length
  const parts = [...cos, ...(time ? [`${time} approved time ${time === 1 ? 'entry' : 'entries'}`] : [])]
  return `From ${parts.join(', ')}`
}
