import type { ProjectStatus } from './domain.ts'

export type StageColor = { bg: string; fg: string; badgeClass: string }

/**
 * Single source of truth for project stage/status colours, keyed by the stored status identifier.
 * `fg` doubles as the solid colour for stage dots, lines, and pipeline accents.
 * Tailwind classes are written out literally so the scanner picks them up.
 */
export const STAGE_COLORS: Record<ProjectStatus, StageColor> = {
  lead: { bg: '#DBEAFE', fg: '#2563EB', badgeClass: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  consultation: { bg: '#FFEDD5', fg: '#F58A3C', badgeClass: 'bg-[#FFEDD5] text-[#9A3412]' },
  planning: { bg: '#EFF6FF', fg: '#3B82F6', badgeClass: 'bg-[#EFF6FF] text-[#1E40AF]' },
  estimating: { bg: '#E0E7FF', fg: '#4338CA', badgeClass: 'bg-[#E0E7FF] text-[#4338CA]' },
  awaiting_approval: { bg: '#FFF1E6', fg: '#C2410C', badgeClass: 'bg-[#FFF1E6] text-[#C2410C]' },
  preconstruction: { bg: '#E0F4F7', fg: '#007F95', badgeClass: 'bg-[#E0F4F7] text-[#00687A]' },
  under_construction: { bg: '#E0F2FE', fg: '#0284C7', badgeClass: 'bg-[#E0F2FE] text-[#075985]' },
  final_inspection: { bg: '#EDE9FE', fg: '#6D28D9', badgeClass: 'bg-[#EDE9FE] text-[#6D28D9]' },
  punch_list: { bg: '#FFEDD5', fg: '#EA580C', badgeClass: 'bg-[#FFEDD5] text-[#C2410C]' },
  substantially_complete: { bg: '#D1FAE5', fg: '#047857', badgeClass: 'bg-[#D1FAE5] text-[#047857]' },
  completed: { bg: '#DCFCE7', fg: '#166534', badgeClass: 'bg-[#DCFCE7] text-[#166534]' },
  on_hold: { bg: '#FEE2E2', fg: '#B91C1C', badgeClass: 'bg-[#FEE2E2] text-[#B91C1C]' },
  cancelled: { bg: '#F3F4F6', fg: '#4B5563', badgeClass: 'bg-[#F3F4F6] text-[#4B5563]' },
}

export const STAGE_COLOR_FALLBACK: StageColor = {
  bg: '#F3F4F6',
  fg: '#6B7280',
  badgeClass: 'bg-[#F3F4F6] text-[#6B7280]',
}

export const STAGE_INDICATOR_FALLBACK = STAGE_COLOR_FALLBACK.fg

export function stageColor(status: string | null | undefined): StageColor {
  if (!status) return STAGE_COLOR_FALLBACK
  return STAGE_COLORS[status as ProjectStatus] ?? STAGE_COLOR_FALLBACK
}

/** Solid colour for dots, lines, and pipeline accents. Unknown values fall back to neutral gray. */
export function stageIndicatorColor(status: string | null | undefined): string {
  return stageColor(status).fg
}
