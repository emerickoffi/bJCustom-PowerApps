'use client'

import Link from 'next/link'
import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { ArrowRight, Check, ChevronDown, FileDown, Loader2, Pencil, Save, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BackLink } from '@/components/shared/page-header'
import { EstimateSummary } from '@/components/estimates/estimate-summary'
import { sameSettings, useEstimateDraft } from '@/components/estimates/estimate-draft-context'
import { WORKSPACE_TABS, WORKSPACE_TAB_LABELS, type WorkspaceTab } from '@/lib/estimate-workspace'
import { formatCentsExact, type EstimateTotals } from '@/lib/estimates'
import { cn } from '@/lib/utils'
import { worksheetFillerClass, worksheetStripClass, worksheetTabClass } from '@/components/shared/worksheet-tabs'

export type NextAction = { label: string; href?: string }

function useSaveState() {
  const draft = useEstimateDraft()
  const sheet = draft?.sheet ?? null
  const dirty = Boolean(sheet?.dirty)
  const busy = Boolean(sheet?.saving || sheet?.refreshing)
  const text = sheet?.saving
    ? 'Saving...'
    : sheet?.refreshing
      ? 'Refreshing...'
      : sheet?.saveError
        ? 'Not saved'
        : dirty
          ? 'Unsaved changes'
          : 'All changes saved'
  const tone = sheet?.saveError ? 'text-destructive' : dirty ? 'text-warning' : 'text-muted-foreground'
  return { draft, sheet, dirty, busy, text, tone }
}

function focusWorkflow() {
  requestAnimationFrame(() => {
    const el = document.getElementById('workflow-heading')
    el?.scrollIntoView({ block: 'start' })
    el?.focus({ preventScroll: true })
  })
}

function PdfButton({ href }: { href: string }) {
  const draft = useEstimateDraft()
  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!draft?.sheet?.dirty) return
    e.preventDefault()
    void draft.ensureSaved('open the PDF', () => {
      // Opened inside the click so the browser treats it as user-initiated; filled in once the save lands.
      const win = window.open('', '_blank')
      return (ok) => {
        if (!ok) return win?.close()
        if (win) win.location.href = href
        else window.open(href, '_blank')
      }
    })
  }
  return (
    <Button
      variant="outline"
      render={<Link href={href} target="_blank" onClick={onClick} aria-label="Download PDF" />}
      nativeButton={false}
    >
      <FileDown data-icon="inline-start" />
      <span className="hidden sm:inline">Download PDF</span>
    </Button>
  )
}

function TabIndicator({ error, dirty }: { error: boolean; dirty: boolean }) {
  if (error)
    return (
      <>
        <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
        <span className="sr-only">(needs attention)</span>
      </>
    )
  if (dirty)
    return (
      <>
        <span className="size-2 rounded-full bg-warning" aria-hidden="true" />
        <span className="sr-only">(unsaved changes)</span>
      </>
    )
  return null
}

function WorkspaceTabs() {
  const draft = useEstimateDraft()
  const active = draft?.tab ?? 'items'
  const sheet = draft?.sheet
  const pricingDirty = !sameSettings(draft?.settings ?? null, draft?.baseline ?? null)
  const indicators: Record<WorkspaceTab, { error: boolean; dirty: boolean }> = {
    items: { error: Boolean(sheet?.itemErrors), dirty: Boolean(sheet?.itemsDirty) },
    pricing: { error: Object.keys(draft?.fieldErrors ?? {}).length > 0, dirty: pricingDirty },
    review: { error: false, dirty: false },
    history: { error: false, dirty: false },
  }

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = WORKSPACE_TABS.indexOf(active)
    const next =
      e.key === 'ArrowRight'
        ? WORKSPACE_TABS[(i + 1) % WORKSPACE_TABS.length]
        : e.key === 'ArrowLeft'
          ? WORKSPACE_TABS[(i - 1 + WORKSPACE_TABS.length) % WORKSPACE_TABS.length]
          : e.key === 'Home'
            ? WORKSPACE_TABS[0]
            : e.key === 'End'
              ? WORKSPACE_TABS[WORKSPACE_TABS.length - 1]
              : null
    if (!next) return
    e.preventDefault()
    draft?.setTab(next)
    document.getElementById(`estimate-tab-${next}`)?.focus()
  }

  return (
    <div className={worksheetStripClass}>
      <div role="tablist" aria-label="Estimate sections" className="flex w-max min-w-full items-end">
        {WORKSPACE_TABS.map((t, index) => {
          const selected = t === active
          return (
            <button
              key={t}
              id={`estimate-tab-${t}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`estimate-panel-${t}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => draft?.setTab(t)}
              onKeyDown={onKeyDown}
              className={worksheetTabClass(selected, index === 0)}
            >
              {WORKSPACE_TAB_LABELS[t]}
              <TabIndicator {...indicators[t]} />
            </button>
          )
        })}
        <span aria-hidden="true" className={worksheetFillerClass} />
      </div>
    </div>
  )
}

/** Compact, sticky estimate identity, saving controls and section tabs. */
export function EstimateWorkspaceHeader({
  backHref,
  backLabel,
  eyebrow,
  title,
  subtitle,
  editable,
  editHref,
  pdfHref,
  nextAction,
  moreMenu,
}: {
  backHref: string
  backLabel: string
  eyebrow: ReactNode
  title: string
  subtitle?: ReactNode
  editable: boolean
  editHref?: string
  pdfHref: string
  nextAction: NextAction | null
  moreMenu?: ReactNode
}) {
  const { draft, dirty, busy, text, tone } = useSaveState()
  const onReview = draft?.tab === 'review'
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const root = document.documentElement
    const appHeader = document.querySelector<HTMLElement>('[data-app-header]')
    const apply = () => {
      const app = appHeader?.offsetHeight ?? 0
      root.style.setProperty('--app-header-h', `${app}px`)
      root.style.setProperty('--estimate-sticky-top', `${app + el.offsetHeight}px`)
      // Keeps focused fields and scrolled-to sections clear of both sticky headers.
      root.style.scrollPaddingTop = `${app + el.offsetHeight + 16}px`
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    if (appHeader) observer.observe(appHeader)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--app-header-h')
      root.style.removeProperty('--estimate-sticky-top')
      root.style.scrollPaddingTop = ''
    }
  }, [])

  return (
    <div
      ref={ref}
      className="sticky top-[var(--app-header-h,3.5rem)] z-20 mx-[calc(var(--page-gutter-x)*-1)] mt-[calc(var(--page-gutter-top)*-1)] bg-background/95 px-(--page-gutter-x) pt-3 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:pt-4"
    >
      <div className="flex flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <BackLink href={backHref} label={backLabel} className="text-xs" />
          <span className="h-3.5 w-px bg-border" aria-hidden="true" />
          {eyebrow}
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-0.5 lg:flex-1">
            <h1 title={title} className="truncate font-serif text-xl font-semibold leading-tight tracking-tight text-foreground md:text-[26px]">{title}</h1>
            {subtitle && <div className="hidden truncate text-sm text-muted-foreground sm:block">{subtitle}</div>}
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:flex-nowrap">
            {editable && (
              <span role="status" aria-live="polite" className={cn('mr-1 text-xs font-medium', tone)}>
                {text}
              </span>
            )}
            {editable && (
              <Button
                type="button"
                onClick={() => void draft?.save()}
                disabled={!dirty || busy}
                variant={dirty ? 'default' : 'outline'}
                title={
                  dirty
                    ? 'Saves cost items, pricing, land cost, description and notes together. Shortcut: Ctrl or Cmd + S.'
                    : 'No unsaved changes'
                }
              >
                {busy ? (
                  <Loader2 data-icon="inline-start" className="animate-spin" />
                ) : dirty ? (
                  <Save data-icon="inline-start" />
                ) : (
                  <Check data-icon="inline-start" />
                )}
                {busy ? 'Saving...' : dirty ? 'Save draft' : 'Saved'}
              </Button>
            )}
            {nextAction &&
              !(onReview && !nextAction.href) &&
              (nextAction.href ? (
                <Button variant="outline" render={<Link href={nextAction.href} />} nativeButton={false}>
                  {nextAction.label}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant={editable ? 'outline' : 'default'}
                  onClick={() => {
                    draft?.setTab('review')
                    focusWorkflow()
                  }}
                >
                  {nextAction.label}
                  <ArrowRight data-icon="inline-end" />
                </Button>
              ))}
            <PdfButton href={pdfHref} />
            {editHref && (
              <Button
                variant="ghost"
                render={<Link href={editHref} aria-label="Edit details" title="Edit details" />}
                nativeButton={false}
              >
                <Pencil data-icon="inline-start" />
                <span className="hidden sm:inline lg:hidden 2xl:inline">Edit details</span>
              </Button>
            )}
            {moreMenu}
          </div>
        </div>
        <WorkspaceTabs />
      </div>
    </div>
  )
}

const WIDE_QUERY = '(min-width: 96rem)'
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(WIDE_QUERY)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  )
}

function useLiveTotals(serverTotals: EstimateTotals, editable: boolean) {
  const draft = useEstimateDraft()
  const totals = draft?.sheet?.totals ?? serverTotals
  const preview = editable && Boolean(draft?.sheet?.dirty)
  const note = !editable
    ? 'Excludes land. Saved estimate.'
    : preview
      ? 'Live preview of unsaved edits. Excludes land.'
      : 'Excludes land. Matches the saved estimate.'
  return { totals, preview, note }
}

function CompactTotals({ serverTotals, editable }: { serverTotals: EstimateTotals; editable: boolean }) {
  const { totals, preview, note } = useLiveTotals(serverTotals, editable)
  return (
    <details className="surface group overflow-hidden">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="flex items-baseline gap-2">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Construction total</span>
          <span className="font-serif text-lg font-semibold tabular-nums text-foreground">
            {formatCentsExact(totals.construction_total_cents)}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">
          {totals.land_cost_cents === null ? 'Land not included' : `Land ${formatCentsExact(totals.land_cost_cents)} separate`}
        </span>
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            preview ? 'bg-champagne-soft text-warning' : 'bg-muted text-muted-foreground',
          )}
        >
          {preview ? 'Unsaved preview' : 'Saved'}
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs font-medium text-primary">
          <span className="group-open:hidden">Show breakdown</span>
          <span className="hidden group-open:inline">Hide breakdown</span>
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="border-t p-3">
        <EstimateSummary totals={totals} note={note} headingId="compact-totals-heading" className="border-0 p-2 shadow-none md:p-2" />
      </div>
    </details>
  )
}

const PANEL_TABS = WORKSPACE_TABS

/** Section panels. All stay mounted so switching tabs never discards unsaved edits. */
export function EstimateWorkspaceBody({
  panels,
  serverTotals,
  editable,
}: {
  panels: Record<WorkspaceTab, ReactNode>
  serverTotals: EstimateTotals
  editable: boolean
}) {
  const draft = useEstimateDraft()
  const tab = draft?.tab ?? 'items'
  const showTotals = tab === 'items' || tab === 'pricing'
  const wide = useWide()
  const live = useLiveTotals(serverTotals, editable)

  return (
    <div
      className={cn(
        'grid min-w-0 gap-6 rounded-b-xl border border-t-0 border-border bg-card p-4 sm:p-6',
        showTotals && '2xl:grid-cols-[minmax(0,1fr)_22rem]',
      )}
    >
      <div className="flex min-w-0 flex-col gap-4">
        {showTotals && !wide && <CompactTotals serverTotals={serverTotals} editable={editable} />}
        {PANEL_TABS.map((t) => (
          <div
            key={t}
            id={`estimate-panel-${t}`}
            role="tabpanel"
            aria-labelledby={`estimate-tab-${t}`}
            hidden={t !== tab}
            className="min-w-0"
          >
            {panels[t]}
          </div>
        ))}
      </div>
      {showTotals && wide && (
        <aside aria-label="Estimate totals" className="min-w-0">
          <div className="sticky top-[calc(var(--estimate-sticky-top,9rem)+1.5rem)]">
            <EstimateSummary totals={live.totals} note={live.note} headingId="rail-totals-heading" />
          </div>
        </aside>
      )}
    </div>
  )
}

/** Shown on Review & send so it is clear the saved summary and PDF do not yet include unsaved edits. */
export function EstimateUnsavedNotice() {
  const { draft, dirty, busy } = useSaveState()
  if (!dirty) return null
  return (
    <div role="status" className="flex flex-col gap-3 rounded-xl border border-warning/30 bg-champagne-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-sm text-foreground">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
        You have unsaved edits. The saved summary, PDF and workflow steps below use the last saved draft.
      </p>
      <Button type="button" size="sm" onClick={() => void draft?.save()} disabled={busy} className="shrink-0">
        <Save data-icon="inline-start" />
        Save draft
      </Button>
    </div>
  )
}
