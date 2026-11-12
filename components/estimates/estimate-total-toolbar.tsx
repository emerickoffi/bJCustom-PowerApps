'use client'

import { useEffect, useRef } from 'react'
import { Check, ChevronDown, Loader2, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEstimateDraft } from '@/components/estimates/estimate-draft-context'
import { formatCentsExact, type EstimateTotals } from '@/lib/estimates'
import { estimateFinancials } from '@/lib/estimate-financials'
import { cn } from '@/lib/utils'

export const BREAKDOWN_PANEL_ID = 'estimate-cost-breakdown'

export type TotalStatus = 'saved' | 'unsaved' | 'saving' | 'refreshing' | 'failed' | 'read-only'

const STATUS: Record<TotalStatus, { label: string; className: string }> = {
  saved: { label: 'Saved', className: 'bg-muted text-muted-foreground' },
  unsaved: { label: 'Unsaved changes', className: 'bg-champagne-soft text-warning' },
  saving: { label: 'Saving...', className: 'bg-muted text-muted-foreground' },
  refreshing: { label: 'Refreshing...', className: 'bg-muted text-muted-foreground' },
  failed: { label: 'Not saved', className: 'bg-destructive/10 text-destructive' },
  'read-only': { label: 'Saved estimate', className: 'bg-muted text-muted-foreground' },
}

function StatusIcon({ status }: { status: TotalStatus }) {
  if (status === 'saving' || status === 'refreshing') return <Loader2 className="size-3 animate-spin" aria-hidden="true" />
  if (status === 'failed') return <TriangleAlert className="size-3" aria-hidden="true" />
  if (status === 'saved' || status === 'read-only') return <Check className="size-3" aria-hidden="true" />
  return <span className="size-1.5 rounded-full bg-warning" aria-hidden="true" />
}

/**
 * Sticky bar above the line items that always shows the estimate total. Sits just below the sticky
 * workspace header and publishes its height so focused fields scroll clear of it.
 */
export function EstimateTotalToolbar({ totals, status }: { totals: EstimateTotals; status: TotalStatus }) {
  const draft = useEstimateDraft()
  const open = Boolean(draft?.breakdownOpen)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const apply = () => root.style.setProperty('--estimate-toolbar-h', `${el.offsetHeight}px`)
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--estimate-toolbar-h')
    }
  }, [])

  const toggle = () => {
    const next = !open
    draft?.setBreakdownOpen(next)
    if (!next) return
    requestAnimationFrame(() => {
      const panel = document.getElementById(BREAKDOWN_PANEL_ID)
      panel?.scrollIntoView({ block: 'start' })
      panel?.focus({ preventScroll: true })
    })
  }

  const land =
    totals.land_cost_cents === null || totals.land_cost_cents === 0
      ? 'Construction total, excludes land'
      : `Excludes land (${formatCentsExact(totals.land_cost_cents)} tracked separately)`
  const s = STATUS[status]
  const f = estimateFinancials(totals)

  return (
    <div
      ref={ref}
      className="sticky top-[var(--estimate-sticky-top,0px)] z-10 border-b bg-card/95 px-4 py-2.5 backdrop-blur supports-[backdrop-filter]:bg-card/85 md:px-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-medium text-muted-foreground">Client price:</span>
            <span className="type-financial tabular-nums text-foreground">{formatCentsExact(totals.construction_total_cents)}</span>
          </p>
          <dl className="hidden items-baseline gap-x-3 text-xs sm:flex">
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Builder cost</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatCentsExact(f.builderCostCents)}</dd>
            </div>
            <div className="flex gap-1">
              <dt className="text-muted-foreground">Profit</dt>
              <dd className="font-medium tabular-nums text-foreground">{formatCentsExact(f.profitCents)}</dd>
            </div>
          </dl>
          <span className="text-xs text-muted-foreground">{land}</span>
          <span className={cn('inline-flex items-center gap-1 rounded-badge px-2 py-0.5 text-xs font-medium', s.className)}>
            <StatusIcon status={status} />
            {s.label}
          </span>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={BREAKDOWN_PANEL_ID}
          className="2xl:hidden"
        >
          {open ? 'Hide cost breakdown' : 'View cost breakdown'}
          <ChevronDown data-icon="inline-end" className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      </div>
    </div>
  )
}
