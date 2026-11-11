import type { ProjectStatus } from './domain.ts'
import type { SubcontractorStatus } from './subcontractors.ts'
import type { QualificationSummary } from './subcontractor-qualification.ts'

/** Distinct from every other list's selection parameter, so a selection never crosses record types. */
export const SUBCONTRACTOR_PREVIEW_PARAM = 'previewSubcontractor'
export const SUBCONTRACTOR_PREVIEW_PANEL_ID = 'subcontractor-preview'

export function subcontractorPreviewApiPath(companyId: string) {
  return `/api/subcontractors/${encodeURIComponent(companyId)}/preview`
}

/** A section's own lookup. `error` is a failed query, never an empty list; `hidden` means the feature is off or not set up. */
type Section<T> = ({ state: 'ready' } & T) | { state: 'error' } | { state: 'hidden' }

export type SubcontractorPreviewContact = {
  /** Null when only the company's own email or phone is on file. */
  name: string | null
  role: string | null
  email: string | null
  phone: string | null
}

export type QualificationIssue = { key: string; title: string; problem: 'Missing' | 'Expired' | 'Rejected' }

export type SubcontractorPreviewProject = {
  id: string
  name: string
  number: string
  status: ProjectStatus
  href: string
}

export type AssignTarget = { id: string; name: string; number: string; status: ProjectStatus }

export type SubcontractorPreviewWork = {
  id: string
  activityName: string
  projectName: string
  status: string
  plannedEnd: string | null
  overdue: boolean
  href: string
}

export type SubcontractorPreview = {
  id: string
  name: string
  trade: string
  status: SubcontractorStatus
  href: string
  contact: { state: 'ready'; primary: SubcontractorPreviewContact | null } | { state: 'error' }
  qualification: Section<{ summary: QualificationSummary | null; issues: QualificationIssue[]; href: string }>
  projects: Section<{ items: SubcontractorPreviewProject[]; href: string }>
  /** What the Assign to project action may do. Only projects open to new associations are offered. */
  assign:
    | { state: 'ready'; directoryCompanyId: string; projects: AssignTarget[] }
    | { state: 'unavailable'; reason: string; href: string | null }
    | { state: 'hidden' }
  work: Section<{ items: SubcontractorPreviewWork[]; total: number; href: string }>
  performance: Section<{ average: number | null; count: number }>
}

/** What the panel says for a failed request, and whether trying again can help. */
export function subcontractorPreviewErrorState(status: number | null): { message: string; retry: boolean } {
  if (status === 401) return { message: 'Your session has ended. Sign in again to see this subcontractor.', retry: false }
  if (status === 403) return { message: 'You do not have access to this subcontractor.', retry: false }
  if (status === 404) return { message: 'This subcontractor is no longer available.', retry: false }
  return { message: 'Subcontractor details could not be loaded.', retry: true }
}
