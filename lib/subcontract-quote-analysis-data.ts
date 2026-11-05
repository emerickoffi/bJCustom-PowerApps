import 'server-only'

import { createHash } from 'node:crypto'
import { qualificationBadge, vettingStatusOf, type QualificationSummary } from '@/lib/subcontractor-qualification'
import { canonicalJson, inputSnapshot, type AnalysisInput, type QualificationSnapshot } from '@/lib/ai/quote-analysis'

export function qualificationSnapshot(summary: QualificationSummary | undefined): QualificationSnapshot {
  return {
    label: qualificationBadge(summary ?? null).label,
    vetting: vettingStatusOf(summary),
    status: summary?.status ?? null,
    decision: summary?.decision_outcome ?? null,
    missing: summary?.missing_count ?? 0,
    expired: summary?.expired_count ?? 0,
    awaiting_review: summary?.awaiting_review_count ?? 0,
    next_expiration: summary?.next_expiration ?? null,
  }
}

export function fingerprintOf(input: AnalysisInput): string {
  return createHash('sha256').update(canonicalJson(inputSnapshot(input))).digest('hex')
}
