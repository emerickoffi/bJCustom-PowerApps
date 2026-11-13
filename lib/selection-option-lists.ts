/**
 * Pure helpers behind the Category and Room / Location pickers on the selection forms.
 * Category names are company-wide records (selection_categories); locations stay free text.
 */

export const DEFAULT_SELECTION_CATEGORIES = [
  'Plumbing Fixtures',
  'Lighting & Electrical',
  'Cabinets & Countertops',
  'Flooring',
  'Appliances',
  'Doors & Hardware',
  'Paint & Finishes',
  'Tile & Backsplash',
  'Bathroom Fixtures',
  'Windows',
  'Exterior Finishes',
  'Landscaping',
  'Other',
] as const

export const DEFAULT_SELECTION_LOCATIONS = [
  'Kitchen',
  'Primary Bathroom',
  'Guest Bathroom',
  'Powder Room',
  'Primary Bedroom',
  'Bedroom',
  'Living Room',
  'Dining Room',
  'Laundry Room',
  'Garage',
  'Patio',
  'Exterior',
  'Whole House',
  'Other',
] as const

export const CATEGORY_NAME_MIN = 2
export const CATEGORY_NAME_MAX = 60

export type CategoryRecord = { id: string; name: string; archived: boolean }

/** Collapses internal whitespace and trims, so "  Tile   &  Backsplash " saves as "Tile & Backsplash". */
export function normalizeOptionName(raw: string): string {
  return raw.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Comparison key that ignores capitalization and spacing differences. */
export function optionKey(raw: string): string {
  return normalizeOptionName(raw).toLowerCase()
}

export function findOption<T extends string>(options: readonly T[], name: string): T | undefined {
  const key = optionKey(name)
  return key ? options.find((o) => optionKey(o) === key) : undefined
}

/** Dedupes case-insensitively (first spelling wins), sorts A–Z, and keeps "Other" last. */
export function mergeOptionLists(...lists: readonly (readonly (string | null | undefined)[])[]): string[] {
  const byKey = new Map<string, string>()
  for (const list of lists) {
    for (const raw of list) {
      if (!raw) continue
      const name = normalizeOptionName(raw)
      const key = name.toLowerCase()
      if (name && !byKey.has(key)) byKey.set(key, name)
    }
  }
  return [...byKey.values()].sort((a, b) => {
    const ao = a.toLowerCase() === 'other'
    const bo = b.toLowerCase() === 'other'
    if (ao !== bo) return ao ? 1 : -1
    return a.localeCompare(b)
  })
}

/**
 * Category choices for the picker. The company's saved active categories win; the built-in
 * defaults are offered only until the company has saved its own, so renaming or deactivating
 * a category never makes the old default spelling reappear.
 */
export function categoryChoices(records: readonly CategoryRecord[]): string[] {
  const active = records.filter((r) => !r.archived).map((r) => r.name)
  return records.length === 0 ? mergeOptionLists(DEFAULT_SELECTION_CATEGORIES) : mergeOptionLists(active)
}

/** Location choices: the defaults plus every custom location the company has already entered. */
export function locationChoices(previous: readonly (string | null | undefined)[]): string[] {
  return mergeOptionLists(DEFAULT_SELECTION_LOCATIONS, previous)
}

/** Matches anywhere in the name; names that start with the query rank first. */
export function filterOptions(options: readonly string[], query: string): string[] {
  const q = optionKey(query)
  if (!q) return [...options]
  const starts: string[] = []
  const contains: string[] = []
  for (const o of options) {
    const k = o.toLowerCase()
    if (k.startsWith(q)) starts.push(o)
    else if (k.includes(q)) contains.push(o)
  }
  return [...starts, ...contains]
}

export type CategoryNameCheck =
  | { ok: true; name: string; existing: CategoryRecord | null }
  | { ok: false; error: string }

/**
 * Validates a proposed category name against the company's records.
 * An exact (case/space-insensitive) active match is returned as `existing` so callers select it
 * instead of creating a duplicate; an archived match is rejected with a pointer to settings.
 */
export function checkCategoryName(raw: string, records: readonly CategoryRecord[], ignoreId?: string): CategoryNameCheck {
  const name = normalizeOptionName(raw)
  if (name.length < CATEGORY_NAME_MIN) return { ok: false, error: `Enter at least ${CATEGORY_NAME_MIN} characters.` }
  if (name.length > CATEGORY_NAME_MAX) return { ok: false, error: `Keep category names under ${CATEGORY_NAME_MAX} characters.` }
  const match = records.find((r) => r.id !== ignoreId && optionKey(r.name) === name.toLowerCase())
  if (match?.archived) return { ok: false, error: `“${match.name}” is deactivated. An admin can reactivate it in Company settings.` }
  return { ok: true, name, existing: match ?? null }
}
