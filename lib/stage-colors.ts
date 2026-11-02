import type { ProjectStatus } from './domain.ts'

export type StageColor = { bg: string; fg: string; badgeClass: string }

/**
 * Single source of truth for project stage/status colours, keyed by the stored status identifier.
 * `fg` doubles as the solid colour for stage dots, lines, and pipeline accents.
 * Tailwind classes are written out literally so the scanner picks them up.
 */
export const STAGE_COLORS: Record<ProjectStatus, StageColor> = {
  lead: { bg: '#F1F5F9', fg: '#475569', badgeClass: 'bg-[#F1F5F9] text-[#475569]' },
  consultation: { bg: '#F3E8FF', fg: '#7E22CE', badgeClass: 'bg-[#F3E8FF] text-[#7E22CE]' },
  planning: { bg: '#DBEAFE', fg: '#1D4ED8', badgeClass: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  estimating: { bg: '#E0E7FF', fg: '#4338CA', badgeClass: 'bg-[#E0E7FF] text-[#4338CA]' },
  awaiting_approval: { bg: '#FEF3C7', fg: '#92400E', badgeClass: 'bg-[#FEF3C7] text-[#92400E]' },
  preconstruction: { bg: '#CCFBF1', fg: '#0F766E', badgeClass: 'bg-[#CCFBF1] text-[#0F766E]' },
  under_construction: { bg: '#E0F2FE', fg: '#075985', badgeClass: 'bg-[#E0F2FE] text-[#075985]' },
  final_inspection: { bg: '#EDE9FE', fg: '#6D28D9', badgeClass: 'bg-[#EDE9FE] text-[#6D28D9]' },
  punch_list: { bg: '#F3E8DC', fg: '#805B2A', badgeClass: 'bg-[#F3E8DC] text-[#805B2A]' },
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
