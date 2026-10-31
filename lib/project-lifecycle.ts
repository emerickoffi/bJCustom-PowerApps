import type { ProjectStatus } from './domain.ts'

/**
 * Lifecycle stage grouping used for presentation only. It is deliberately separate from project health:
 * stage says where a job is in the build, health/risk says whether something is wrong.
 */
export type LifecycleGroup = 'pipeline' | 'active' | 'closed' | 'on_hold'

export const PROJECT_LIFECYCLE_GROUP: Record<ProjectStatus, LifecycleGroup> = {
  lead: 'pipeline',
  consultation: 'pipeline',
  planning: 'pipeline',
  estimating: 'pipeline',
  awaiting_approval: 'pipeline',
  preconstruction: 'active',
  under_construction: 'active',
  final_inspection: 'active',
  punch_list: 'active',
  substantially_complete: 'active',
  completed: 'closed',
  cancelled: 'closed',
  on_hold: 'on_hold',
}

export const LIFECYCLE_GROUP_LABELS: Record<LifecycleGroup, string> = {
  pipeline: 'Pipeline',
  active: 'Active build',
  closed: 'Closed',
  on_hold: 'On hold',
}

/** Solid fills; each pairs foreground and background at WCAG AA contrast. */
export const LIFECYCLE_GROUP_CLASSES: Record<LifecycleGroup, string> = {
  pipeline: 'bg-sky-800 text-white',
  active: 'bg-primary text-primary-foreground',
  closed: 'bg-stone-200 text-stone-800',
  on_hold: 'bg-amber-300 text-amber-950',
}

export function lifecycleGroup(status: string | null | undefined): LifecycleGroup {
  return PROJECT_LIFECYCLE_GROUP[status as ProjectStatus] ?? 'closed'
}

export const isPipelineStage = (status: string | null | undefined) => lifecycleGroup(status) === 'pipeline'
