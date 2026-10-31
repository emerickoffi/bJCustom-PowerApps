export const PERFORMANCE_CRITERIA = [
  { key: 'quality', label: 'Work Quality', hint: 'Workmanship and accuracy of the finished work.' },
  { key: 'timeliness', label: 'Timeliness', hint: 'Showed up and finished when scheduled.' },
  { key: 'communication', label: 'Communication', hint: 'Responsive, clear, and kept the team informed.' },
  { key: 'professionalism', label: 'Professionalism', hint: 'Conduct on site, cleanliness, and respect for the home.' },
  {
    key: 'issue_resolution',
    label: 'Issue Resolution',
    hint: 'How well corrections and punch list items were handled.',
    optional: true,
  },
] as const

export type CriterionKey = (typeof PERFORMANCE_CRITERIA)[number]['key']

export type PerformanceScores = {
  quality: number
  timeliness: number
  communication: number
  professionalism: number
  /** Null when not applicable. */
  issue_resolution: number | null
}

export type PerformanceReview = PerformanceScores & {
  id: string
  subcontractor_company_id: string
  project_id: string
  project_assignment_id: string
  submission_id: string | null
  overall_rating: number
  comments: string | null
  revision: number
  reviewed_by: string
  updated_at: string
}

export type PerformanceSummary = {
  count: number
  average: number | null
  criteria: Record<CriterionKey, number | null>
}

/** Mirrors the database's generated overall_rating column; used only for live previews. */
export function overallRating(s: PerformanceScores): number {
  const values = [s.quality, s.timeliness, s.communication, s.professionalism]
  if (s.issue_resolution !== null) values.push(s.issue_resolution)
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
}

export function formatRating(value: number | null | undefined): string {
  return value === null || value === undefined || Number.isNaN(value) ? '–' : value.toFixed(1)
}

export function ratingCountLabel(count: number) {
  return `${count} ${count === 1 ? 'rating' : 'ratings'}`
}

function mean(values: number[]): number | null {
  return values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100 : null
}

export function summarizePerformance(
  rows: Pick<PerformanceReview, 'overall_rating' | CriterionKey>[],
): PerformanceSummary {
  const criteria = {} as Record<CriterionKey, number | null>
  for (const c of PERFORMANCE_CRITERIA) {
    criteria[c.key] = mean(rows.map((r) => r[c.key]).filter((v): v is number => typeof v === 'number'))
  }
  return { count: rows.length, average: mean(rows.map((r) => Number(r.overall_rating))), criteria }
}

/** Rated companies first, highest average first; more ratings break ties. */
export function comparePerformance(a: PerformanceSummary | undefined, b: PerformanceSummary | undefined): number {
  const x = a?.average ?? null
  const y = b?.average ?? null
  if (x === null && y === null) return 0
  if (x === null) return 1
  if (y === null) return -1
  return y - x || (b?.count ?? 0) - (a?.count ?? 0)
}

export function parseStars(value: FormDataEntryValue | null, { allowNa = false } = {}): number | null | undefined {
  const raw = String(value ?? '')
  if (allowNa && raw === 'na') return null
  if (!/^[1-5]$/.test(raw)) return undefined
  return Number(raw)
}
