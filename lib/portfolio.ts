import { ACTIVE_PROJECT_STATUSES, ALL_PROJECT_STATUSES, type ProjectStatus } from './domain.ts'

export const PORTFOLIO_LIMIT = 6

export type PortfolioRow = { id: string; status: ProjectStatus; updated_at: string }

export type PortfolioSignals = {
  /** Projects with real unresolved items: overdue or delayed activities, or action-required notifications. */
  attention: Set<string>
  /** Earliest open, dated activity due today or later, per project. */
  upcoming: Map<string, string>
}

export type PortfolioStatusCount = { status: ProjectStatus; count: number }

const CLOSED = new Set<ProjectStatus>(['completed', 'cancelled'])
const ACTIVE = new Set<ProjectStatus>(ACTIVE_PROJECT_STATUSES)

export function parsePortfolioStatus(value: string | undefined): ProjectStatus | null {
  return ALL_PROJECT_STATUSES.includes(value as ProjectStatus) ? (value as ProjectStatus) : null
}

/** Omits `page` so the directory always opens on page 1; view, sort, and other filters keep their defaults. */
export function portfolioViewAllHref(status: ProjectStatus | null): string {
  return status ? `/projects?status=${encodeURIComponent(status)}` : '/projects'
}

/** Lower tiers sort first. Only real records move a project up; nothing is inferred. */
export function portfolioTier(row: PortfolioRow, signals: PortfolioSignals): number {
  const open = !CLOSED.has(row.status)
  if (open && signals.attention.has(row.id)) return 0
  if (open && row.status !== 'on_hold' && signals.upcoming.has(row.id)) return 1
  if (ACTIVE.has(row.status)) return 2
  if (open) return 3
  if (row.status === 'completed') return 4
  return 5
}

/** Authorized rows in → optional status filter → prioritize → limit. Returns ranked project ids. */
export function rankPortfolio(
  rows: PortfolioRow[],
  signals: PortfolioSignals,
  status: ProjectStatus | null,
  limit = PORTFOLIO_LIMIT,
): string[] {
  return rows
    .filter((r) => !status || r.status === status)
    .map((r) => ({ row: r, tier: portfolioTier(r, signals) }))
    .sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier
      if (a.tier === 1) {
        const da = signals.upcoming.get(a.row.id)!
        const db = signals.upcoming.get(b.row.id)!
        if (da !== db) return da < db ? -1 : 1
      }
      if (a.row.updated_at !== b.row.updated_at) return a.row.updated_at > b.row.updated_at ? -1 : 1
      return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0
    })
    .slice(0, limit)
    .map((x) => x.row.id)
}

/** Statuses that actually have authorized projects, in canonical lifecycle order. */
export function portfolioStatusCounts(rows: Pick<PortfolioRow, 'status'>[]): PortfolioStatusCount[] {
  const counts = new Map<ProjectStatus, number>()
  for (const r of rows) counts.set(r.status, (counts.get(r.status) ?? 0) + 1)
  return ALL_PROJECT_STATUSES.filter((s) => counts.has(s)).map((s) => ({ status: s, count: counts.get(s)! }))
}
