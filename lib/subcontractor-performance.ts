export const PERFORMANCE_CRITERIA = [
  { key: 'quality', label: 'Quality of work', hint: 'Workmanship and accuracy of the finished work.' },
  { key: 'schedule_reliability', label: 'Schedule reliability', hint: 'Showed up and finished when scheduled.' },
  { key: 'communication', label: 'Communication', hint: 'Responsive, clear, and kept the team informed.' },
  { key: 'cleanliness', label: 'Jobsite cleanliness', hint: 'Kept the site and the home clean and orderly.' },
  { key: 'safety', label: 'Safety', hint: 'Followed safe work practices on site.' },
] as const

export type CriterionKey = (typeof PERFORMANCE_CRITERIA)[number]['key']

export const RATING_GUIDANCE: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: 'Poor',
  2: 'Below expectations',
  3: 'Meets expectations',
  4: 'Very good',
  5: 'Excellent',
}

export function ratingLabel(value: number | null | undefined): string {
  return value && value >= 1 && value <= 5 ? RATING_GUIDANCE[value as 1 | 2 | 3 | 4 | 5] : 'Not assessed'
}

/** Null means "Not assessed". */
export type CategoryScores = Record<CriterionKey, number | null>

export type PerformanceReview = CategoryScores & {
  id: string
  subcontractor_company_id: string
  project_id: string
  project_assignment_id: string | null
  reviewer_id: string
  overall_rating: number
  comments: string | null
  revision: number
  created_at: string
  updated_at: string
  project: { name: string; project_number: string } | null
}

export type PerformanceSummary = {
  count: number
  /** Arithmetic mean of submitted Overall ratings. */
  average: number | null
  /** Each category averages only the reviews that assessed it. */
  criteria: Record<CriterionKey, { average: number | null; count: number }>
}

export function formatRating(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '–' : value.toFixed(1)
}

export function reviewCountLabel(count: number) {
  return `${count} ${count === 1 ? 'review' : 'reviews'}`
}

function mean(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null
}

export function summarizePerformance(rows: Pick<PerformanceReview, 'overall_rating' | CriterionKey>[]): PerformanceSummary {
  const criteria = {} as PerformanceSummary['criteria']
  for (const c of PERFORMANCE_CRITERIA) {
    const scored = rows.map((r) => r[c.key]).filter((v): v is number => typeof v === 'number')
    criteria[c.key] = { average: mean(scored), count: scored.length }
  }
  return { count: rows.length, average: mean(rows.map((r) => Number(r.overall_rating))), criteria }
}

/** Used only when a user explicitly sorts the directory by rating. Rated companies first; more reviews break ties. */
export function comparePerformance(a: PerformanceSummary | undefined, b: PerformanceSummary | undefined): number {
  const x = a?.average ?? null
  const y = b?.average ?? null
  if (x === null && y === null) return 0
  if (x === null) return 1
  if (y === null) return -1
  return y - x || (b?.count ?? 0) - (a?.count ?? 0)
}

/** 1-5 → number, "na"/empty (when allowed) → null, anything else → undefined (invalid). */
export function parseStars(value: FormDataEntryValue | null, { allowNa = false } = {}): number | null | undefined {
  const raw = String(value ?? '')
  if (allowNa && (raw === 'na' || raw === '')) return null
  if (!/^[1-5]$/.test(raw)) return undefined
  return Number(raw)
}
