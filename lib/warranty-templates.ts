/** Builder-defined warranties: validation and formatting shared by Settings → Warranty and the database RPC. */

export const WARRANTY_LIMITS = {
  nameMin: 2,
  nameMax: 160,
  descriptionMax: 2000,
  disclaimerMin: 10,
  disclaimerMax: 4000,
  coveragesMax: 12,
  coverageNameMax: 80,
  categoriesMax: 30,
  categoryMax: 80,
  textMax: 2000,
  monthsMax: 600,
  remindersMax: 10,
  reminderDayMax: 365,
} as const

export type CoverageInput = {
  /** Stable key; kept when editing so existing records stay matched. Generated from the name when missing. */
  key?: string | null
  name: string
  durationMonths: number
  categories: string[]
  description?: string | null
  exclusions?: string | null
}

export type WarrantyTemplateInput = {
  name: string
  description?: string | null
  disclaimer: string
  reminderDays: number[]
  coverages: CoverageInput[]
}

export type CleanCoverage = {
  key: string
  name: string
  durationMonths: number
  categories: string[]
  description: string | null
  exclusions: string | null
}

export type CleanTemplate = {
  name: string
  description: string | null
  disclaimer: string
  reminderDays: number[]
  coverages: CleanCoverage[]
}

const squash = (v: string | null | undefined) => (v ?? '').replace(/\s+/g, ' ').trim()
const optional = (v: string | null | undefined) => {
  const t = (v ?? '').trim()
  return t ? t : null
}

/** "Roof leaks" → "roof_leaks"; unique within the template. */
export function coverageKey(name: string, used: Set<string>): string {
  let base = squash(name)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 34)
  if (base.length < 2) base = 'coverage'
  let key = base
  for (let i = 2; used.has(key); i++) key = `${base}_${i}`
  used.add(key)
  return key
}

/** One item per line or comma; trims, drops blanks and case-insensitive duplicates. */
export function parseCategories(text: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of text.split(/[\n,]/)) {
    const item = squash(raw)
    if (!item || seen.has(item.toLowerCase())) continue
    seen.add(item.toLowerCase())
    out.push(item)
  }
  return out
}

/** "30, 7, 0" → [30, 7, 0] (sorted high to low, duplicates removed). Returns null when anything is not a whole number. */
export function parseReminderDays(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (!parts.every((p) => /^\d+$/.test(p))) return null
  return [...new Set(parts.map(Number))].sort((a, b) => b - a)
}

export function toMonths(value: number, unit: 'months' | 'years'): number {
  return unit === 'years' ? Math.round(value * 12) : Math.round(value)
}

/** 12 → "1 year", 120 → "10 years", 18 → "18 months". */
export function formatDuration(months: number): string {
  if (months % 12 === 0) {
    const y = months / 12
    return `${y} ${y === 1 ? 'year' : 'years'}`
  }
  return `${months} ${months === 1 ? 'month' : 'months'}`
}

/** Splits months into the unit the editor should show. */
export function durationParts(months: number): { value: number; unit: 'months' | 'years' } {
  return months % 12 === 0 ? { value: months / 12, unit: 'years' } : { value: months, unit: 'months' }
}

export function validateWarrantyTemplate(input: WarrantyTemplateInput): { ok: true; value: CleanTemplate } | { ok: false; error: string } {
  const L = WARRANTY_LIMITS
  const name = squash(input.name)
  if (name.length < L.nameMin || name.length > L.nameMax) return { ok: false, error: `Give the warranty a name (${L.nameMin}–${L.nameMax} characters).` }
  const description = optional(input.description)
  if (description && description.length > L.descriptionMax) return { ok: false, error: 'The summary is too long.' }
  const disclaimer = (input.disclaimer ?? '').trim()
  if (disclaimer.length < L.disclaimerMin || disclaimer.length > L.disclaimerMax) {
    return { ok: false, error: 'Add the note homeowners see with their warranty (at least a sentence).' }
  }

  const reminderDays = [...new Set(input.reminderDays)].sort((a, b) => b - a)
  if (reminderDays.length < 1 || reminderDays.length > L.remindersMax) {
    return { ok: false, error: `Choose between 1 and ${L.remindersMax} reminder days.` }
  }
  if (reminderDays.some((d) => !Number.isInteger(d) || d < 0 || d > L.reminderDayMax)) {
    return { ok: false, error: `Reminder days must be whole numbers from 0 to ${L.reminderDayMax}.` }
  }

  if (input.coverages.length < 1) return { ok: false, error: 'Add at least one coverage.' }
  if (input.coverages.length > L.coveragesMax) return { ok: false, error: `A warranty can have up to ${L.coveragesMax} coverages.` }

  const used = new Set<string>()
  const keptKeys = input.coverages.map((c) => (c.key && /^[a-z0-9_]{2,40}$/.test(c.key) ? c.key : null))
  for (const k of keptKeys) if (k) used.add(k)
  if (new Set(keptKeys.filter(Boolean)).size !== keptKeys.filter(Boolean).length) return { ok: false, error: 'Two coverages share the same key.' }

  const names = new Set<string>()
  const coverages: CleanCoverage[] = []
  for (const [i, c] of input.coverages.entries()) {
    const label = `Coverage ${i + 1}`
    const cname = squash(c.name)
    if (cname.length < 2 || cname.length > L.coverageNameMax) return { ok: false, error: `${label}: enter a name (2–${L.coverageNameMax} characters).` }
    if (names.has(cname.toLowerCase())) return { ok: false, error: `Two coverages are named “${cname}”.` }
    names.add(cname.toLowerCase())
    if (!Number.isInteger(c.durationMonths) || c.durationMonths < 1 || c.durationMonths > L.monthsMax) {
      return { ok: false, error: `${cname}: the length must be between 1 month and ${L.monthsMax / 12} years.` }
    }
    const categories = c.categories.map(squash).filter(Boolean)
    if (categories.length < 1) return { ok: false, error: `${cname}: list at least one thing it covers.` }
    if (categories.length > L.categoriesMax) return { ok: false, error: `${cname}: list up to ${L.categoriesMax} items.` }
    if (categories.some((x) => x.length > L.categoryMax)) return { ok: false, error: `${cname}: each covered item must be under ${L.categoryMax} characters.` }
    const cdesc = optional(c.description)
    const excl = optional(c.exclusions)
    if ((cdesc?.length ?? 0) > L.textMax || (excl?.length ?? 0) > L.textMax) return { ok: false, error: `${cname}: the description or exclusions are too long.` }
    coverages.push({
      key: keptKeys[i] ?? coverageKey(cname, used),
      name: cname,
      durationMonths: c.durationMonths,
      categories,
      description: cdesc,
      exclusions: excl,
    })
  }

  return { ok: true, value: { name, description, disclaimer, reminderDays, coverages } }
}

/** Payload for public.save_warranty_template. */
export function toTemplatePayload(t: CleanTemplate) {
  return {
    name: t.name,
    description: t.description,
    disclaimer: t.disclaimer,
    reminder_days: t.reminderDays,
    coverages: t.coverages.map((c) => ({
      coverage_key: c.key,
      name: c.name,
      duration_months: c.durationMonths,
      categories: c.categories,
      description: c.description,
      exclusions: c.exclusions,
    })),
  }
}
