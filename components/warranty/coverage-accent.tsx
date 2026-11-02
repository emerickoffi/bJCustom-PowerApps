import { Building2, Paintbrush, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type CoverageAccent = { color: string; soft: string; icon: LucideIcon }

/** Identity colors per coverage type. They distinguish coverage, never urgency; status keeps its own badge tones. */
export const COVERAGE_ACCENTS: Record<string, CoverageAccent> = {
  workmanship: { color: '#925C20', soft: '#FBF1E3', icon: Paintbrush },
  systems: { color: '#1D4ED8', soft: '#EFF6FF', icon: Wrench },
  structural: { color: '#6D28D9', soft: '#F5F3FF', icon: Building2 },
}

const FALLBACK_ACCENT: CoverageAccent = { color: '#526174', soft: '#F1F3F5', icon: ShieldCheck }

export function coverageAccent(coverageKey: string): CoverageAccent {
  return COVERAGE_ACCENTS[coverageKey] ?? FALLBACK_ACCENT
}

export function CoverageIconTile({ coverageKey, size = 'md' }: { coverageKey: string; size?: 'sm' | 'md' }) {
  const { color, soft, icon: Icon } = coverageAccent(coverageKey)
  return (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-lg', size === 'md' ? 'size-8' : 'size-5 rounded-md')}
      style={{ backgroundColor: soft, color }}
    >
      <Icon className={size === 'md' ? 'size-4' : 'size-3'} />
    </span>
  )
}

/** Compact coverage label for claim forms and lists: accent icon plus the readable coverage name. */
export function CoverageTag({ coverageKey, name, className }: { coverageKey: string; name: string; className?: string }) {
  const { color } = coverageAccent(coverageKey)
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 font-medium', className)} style={{ color }}>
      <CoverageIconTile coverageKey={coverageKey} size="sm" />
      <span className="truncate">{name}</span>
    </span>
  )
}
