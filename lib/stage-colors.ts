import type { ProjectStatus } from './domain.ts'

export const STAGE_INDICATOR_FALLBACK = '#9CA3AF'

/**
 * Indicator colour per current project stage. Intermediate stages inherit the colour of the phase they belong to
 * (estimating/approval are planning work; inspection/punch/substantial completion are still the construction phase).
 * On Hold overrides any stage with red.
 */
export const STAGE_INDICATOR_COLORS: Record<ProjectStatus, string> = {
  lead: '#64748B',
  consultation: '#8B5CF6',
  planning: '#3B82F6',
  estimating: '#3B82F6',
  awaiting_approval: '#3B82F6',
  preconstruction: '#0D9488',
  under_construction: '#D97706',
  final_inspection: '#D97706',
  punch_list: '#D97706',
  substantially_complete: '#D97706',
  completed: '#15803D',
  on_hold: '#DC2626',
  cancelled: STAGE_INDICATOR_FALLBACK,
}

export function stageIndicatorColor(status: string | null | undefined): string {
  if (!status) return STAGE_INDICATOR_FALLBACK
  return STAGE_INDICATOR_COLORS[status as ProjectStatus] ?? STAGE_INDICATOR_FALLBACK
}
