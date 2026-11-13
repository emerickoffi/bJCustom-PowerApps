import type { ProjectStatus } from './domain.ts'

/**
 * Marker colors group the existing lifecycle statuses; they are not new statuses. Schedule health overrides the
 * lifecycle color only when it is actually known to be behind, so an unassessed project is never shown as on track.
 */
export type MarkerTone = 'complete' | 'active' | 'early' | 'attention' | 'inactive'

const STATUS_TONE: Record<ProjectStatus, MarkerTone> = {
  lead: 'early',
  consultation: 'early',
  planning: 'early',
  estimating: 'early',
  awaiting_approval: 'early',
  preconstruction: 'active',
  under_construction: 'active',
  final_inspection: 'active',
  punch_list: 'active',
  substantially_complete: 'complete',
  completed: 'complete',
  on_hold: 'attention',
  cancelled: 'inactive',
}

export function markerTone(status: ProjectStatus, behindSchedule: boolean): MarkerTone {
  const tone = STATUS_TONE[status]
  return behindSchedule && tone === 'active' ? 'attention' : tone
}

export const MARKER_TONE_LABELS: Record<MarkerTone, string> = {
  complete: 'Complete',
  active: 'Active',
  early: 'Pre-construction',
  attention: 'Needs attention',
  inactive: 'Cancelled',
}

/** Full class strings so Tailwind picks them up from source. */
export const MARKER_TONE_CLASSES: Record<MarkerTone, string> = {
  complete: 'bg-primary',
  active: 'bg-info',
  early: 'bg-warning',
  attention: 'bg-destructive',
  inactive: 'bg-muted-foreground',
}
