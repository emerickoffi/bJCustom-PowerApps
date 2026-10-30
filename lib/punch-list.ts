export const ITEM_NUMBER_PATTERN = /^[1-9]\d{0,3}(\.\d{1,4}){0,3}$/
export const ITEM_NUMBER_HINT = 'Use numbers like 1, 1.1, or 10.5'
export const LOCATION_MAX = 120
export const BULK_LIMIT = 500

export function isValidItemNumber(value: string): boolean {
  return ITEM_NUMBER_PATTERN.test(value)
}

/** Natural ordering for hierarchical identifiers: 1 < 1.1 < 1.2 < 2 < 10 < 10.1. */
export function compareItemNumbers(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? -1
    const y = pb[i] ?? -1
    if (x !== y) return x - y
  }
  return 0
}

type NumberableItem = { item_number?: string | null; location?: string | null }

/**
 * Items must arrive in sort_order. Rows created before item numbers existed fall back to
 * their position, which matches the database backfill exactly.
 */
export function withItemNumbers<T extends NumberableItem>(items: T[]): (T & { number: string; place: string | null })[] {
  return items
    .map((item, index) => ({ ...item, number: item.item_number || String(index + 1), place: item.location?.trim() || null }))
    .sort((a, b) => compareItemNumbers(a.number, b.number))
}

/** Fills blank numbers after the highest manual top-level number, mirroring create_walkthrough. */
export function assignItemNumbers(numbers: (string | null | undefined)[]): string[] {
  const manual = numbers.map((n) => n?.trim() || null)
  let next = Math.max(0, ...manual.filter((n): n is string => !!n && isValidItemNumber(n)).map((n) => Number(n.split('.')[0])))
  return manual.map((n) => n ?? String(++next))
}

export function findDuplicateNumber(numbers: string[]): string | null {
  const seen = new Set<string>()
  for (const n of numbers) {
    if (seen.has(n)) return n
    seen.add(n)
  }
  return null
}
