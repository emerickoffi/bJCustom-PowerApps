/**
 * Company warranty report: claims that need action, coverage ending soon, and anniversary follow-ups to send.
 * Same rules as the Warranty page (builder-owned statuses, 14-day response target). Pure, so node --test can load it.
 */
import { BUILDER_OWNED_STATUSES, SERVICE_RESPONSE_DAYS, daysBetween, type ClaimStatus } from './warranty-coverage.ts'

export const COVERAGE_WINDOW_DAYS = 90
export const FOLLOWUP_WINDOW_DAYS = 30

export type ReportClaim = {
  id: string
  project_id: string
  project_name: string
  title: string
  category: string
  location: string
  status: string
  reported_at: string
  updated_at: string
  assignee: string | null
}
export type ClaimItem = ReportClaim & { daysOpen: number; daysSinceUpdate: number; pastTarget: boolean }

export type CoverageItem = { project_id: string; project_name: string; coverage_name: string; due_on: string; daysLeft: number }
export type FollowupItem = { id: string; project_id: string; project_name: string; coverage_name: string; due_on: string; status: string; daysUntil: number }

export type WarrantyReport = {
  today: string
  homes: number
  needsAction: ClaimItem[]
  waitingOnHomeowner: ClaimItem[]
  coverageEnding: CoverageItem[]
  followups: FollowupItem[]
}

export function buildWarrantyReport(input: {
  today: string
  homes: number
  claims: ReportClaim[]
  coverage: { project_id: string; project_name: string; coverage_name: string; due_on: string }[]
  followups: { id: string; project_id: string; project_name: string; coverage_name: string; due_on: string; status: string }[]
}): WarrantyReport {
  const { today } = input
  const open = input.claims
    .filter((c) => c.status !== 'closed')
    .map((c) => {
      const daysSinceUpdate = daysBetween(c.updated_at.slice(0, 10), today)
      const builderOwned = BUILDER_OWNED_STATUSES.includes(c.status as ClaimStatus)
      return {
        ...c,
        daysOpen: daysBetween(c.reported_at.slice(0, 10), today),
        daysSinceUpdate,
        pastTarget: builderOwned && daysSinceUpdate > SERVICE_RESPONSE_DAYS,
      }
    })
  const oldestFirst = (a: ClaimItem, b: ClaimItem) => b.daysSinceUpdate - a.daysSinceUpdate || b.daysOpen - a.daysOpen
  return {
    today,
    homes: input.homes,
    needsAction: open.filter((c) => BUILDER_OWNED_STATUSES.includes(c.status as ClaimStatus)).sort(oldestFirst),
    waitingOnHomeowner: open.filter((c) => !BUILDER_OWNED_STATUSES.includes(c.status as ClaimStatus)).sort(oldestFirst),
    coverageEnding: input.coverage
      .map((m) => ({ ...m, daysLeft: daysBetween(today, m.due_on) }))
      .filter((m) => m.daysLeft >= 0 && m.daysLeft <= COVERAGE_WINDOW_DAYS)
      .sort((a, b) => a.daysLeft - b.daysLeft || a.project_name.localeCompare(b.project_name)),
    followups: input.followups
      .filter((f) => f.status !== 'sent')
      .map((f) => ({ ...f, daysUntil: daysBetween(today, f.due_on) }))
      .filter((f) => f.daysUntil <= FOLLOWUP_WINDOW_DAYS)
      .sort((a, b) => a.daysUntil - b.daysUntil),
  }
}
