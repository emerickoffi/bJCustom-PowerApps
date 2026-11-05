'use client'

import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { CircleAlert, CircleCheck, CircleHelp, FileQuestion, TriangleAlert, type LucideIcon } from 'lucide-react'
import { AT_RISK_OVERDUE_COUNT, AT_RISK_OVERDUE_DAYS, HEALTH_LABELS, type HealthLevel } from '@/lib/project-health'
import { cn } from '@/lib/utils'

export type HealthBadgeKey = HealthLevel | 'closed' | 'not_assessed'

type Treatment = { icon: LucideIcon; className: string; explanation: string }

/** Colors per the dashboard health palette; text and icon share the foreground color. */
const TREATMENTS: Record<HealthBadgeKey, Treatment> = {
  on_track: {
    icon: CircleCheck,
    className: 'bg-[#DCFCE7] text-[#166534]',
    explanation:
      'The schedule has planned dates and nothing is flagged: no delayed or overdue activities, open punch list issues, pending actions, or delays reported in Daily Logs this week.',
  },
  needs_attention: {
    icon: TriangleAlert,
    className: 'bg-[#FEF3C7] text-[#92400E]',
    explanation: `At least one open item needs follow-up, such as an overdue activity (fewer than ${AT_RISK_OVERDUE_COUNT}, none more than ${AT_RISK_OVERDUE_DAYS} days late), a start-readiness warning, an open punch list issue, a pending action, or a delay reported this week.`,
  },
  at_risk: {
    icon: CircleAlert,
    className: 'bg-[#FEE2E2] text-[#B91C1C]',
    explanation: `An activity is marked delayed, ${AT_RISK_OVERDUE_COUNT} or more activities are past their planned finish, or an activity is more than ${AT_RISK_OVERDUE_DAYS} days overdue.`,
  },
  insufficient_data: {
    icon: FileQuestion,
    className: 'bg-[#DBEAFE] text-[#1E40AF]',
    explanation:
      'Health was checked and nothing is flagged, but there is no schedule to measure progress against: the Schedule module is off, or the schedule has no activities or planned dates yet. This is not a sign of risk.',
  },
  not_assessed: {
    icon: CircleHelp,
    className: 'bg-[#F1F5F9] text-[#475569]',
    explanation:
      'No health check was run for this project in this view, so there is no result. This differs from Insufficient Data, where a check ran but the schedule had nothing to measure.',
  },
  closed: {
    icon: CircleCheck,
    className: 'bg-[#F3F4F6] text-[#4B5563]',
    explanation: 'This project is completed. Health is not assessed for closed jobs.',
  },
}

const UNKNOWN: Treatment = {
  icon: CircleHelp,
  className: 'bg-[#F3F4F6] text-[#4B5563]',
  explanation: 'This health status has no description yet.',
}

export function healthBadgeLabel(key: string): string {
  if (key === 'closed') return 'Closed'
  if (key === 'not_assessed') return 'Not assessed'
  return HEALTH_LABELS[key as HealthLevel] ?? key
}

export function HealthBadge({
  healthKey,
  reasons,
  label: labelOverride,
}: {
  healthKey: string
  reasons?: readonly string[]
  /** Display-only label; the health key, treatment, and assessment are unchanged. */
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const treatment = TREATMENTS[healthKey as HealthBadgeKey] ?? UNKNOWN
  const { icon: Icon } = treatment
  const label = labelOverride ?? healthBadgeLabel(healthKey)
  const shownReasons = healthKey === 'on_track' ? [] : (reasons ?? []).filter(Boolean)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={150}
        data-health={healthKey}
        aria-label={`Health: ${label}. Show explanation`}
        onFocus={(e) => {
          if (e.currentTarget.matches(':focus-visible')) setOpen(true)
        }}
        className={cn(
          'relative z-10 inline-flex max-w-full cursor-help items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold leading-4 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 @2xl:whitespace-nowrap',
          treatment.className,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0">{label}</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50 outline-none" side="top" align="end" sideOffset={6} collisionPadding={12}>
          <Popover.Popup className="flex w-[min(18rem,calc(100vw-1.5rem))] origin-(--transform-origin) flex-col gap-2 rounded-lg bg-popover px-3.5 py-3 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <Popover.Title className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full', treatment.className)} aria-hidden="true">
                <Icon className="size-3.5" />
              </span>
              {label}
            </Popover.Title>
            <Popover.Description className="text-xs leading-relaxed text-muted-foreground">{treatment.explanation}</Popover.Description>
            {shownReasons.length > 0 && (
              <div className="flex flex-col gap-1 border-t border-border/70 pt-2">
                <span className="text-xs font-medium text-foreground">For this project</span>
                <ul className="flex list-disc flex-col gap-0.5 pl-4 text-xs leading-relaxed text-foreground/80">
                  {shownReasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
