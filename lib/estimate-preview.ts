import type { EstimateStatus } from './estimates.ts'

/** Distinct from every other list's selection parameter, so a selection never crosses record types. */
export const ESTIMATE_PREVIEW_PARAM = 'previewEstimate'
export const ESTIMATE_PREVIEW_PANEL_ID = 'estimate-preview'

export function estimatePreviewApiPath(estimateId: string) {
  return `/api/estimates/${encodeURIComponent(estimateId)}/preview`
}

/** Builder-side figures, present only for roles that may see internal financials. */
export type EstimatePreviewInternal = {
  directCostCents: number
  markupCents: number
  markupPercent: number
  contingencyCents: number
  contingencyPercent: number
}

export type EstimatePreview = {
  id: string
  name: string
  estimateNumber: string
  revision: number
  revisionCount: number
  status: EstimateStatus
  isDemo: boolean
  project: { id: string; name: string; number: string | null } | null
  client: { id: string; name: string } | null
  constructionTotalCents: number
  /** Null when no land cost is recorded, so the land-inclusive total is never mistaken for the construction total. */
  landCostCents: number | null
  totalWithLandCents: number
  estimateDate: string | null
  expirationDate: string | null
  createdAt: string
  updatedAt: string | null
  submittedAt: string | null
  decisionAt: string | null
  decisionByName: string | null
  internal: EstimatePreviewInternal | null
  href: string
  pdfHref: string
}

/** What the panel says for a failed request, and whether trying again can help. */
export function estimatePreviewErrorState(status: number | null): { message: string; retry: boolean } {
  if (status === 401) return { message: 'Your session has ended. Sign in again to see this estimate.', retry: false }
  if (status === 403) return { message: 'You do not have access to this estimate.', retry: false }
  if (status === 404) return { message: 'This estimate is no longer available.', retry: false }
  return { message: 'Estimate details could not be loaded.', retry: true }
}
