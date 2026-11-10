'use client'

import {
  Fragment,
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { AlertTriangle, Loader2, Mail, Phone, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PreviewRequestError, fetchPreviewJson } from '@/components/shared/preview-request'
import { formatPhone } from '@/lib/format'
import { cn } from '@/lib/utils'

export type PreviewRecord = { id: string; name: string }

/**
 * Asked before the preview closes or shows another record. Returns true when that may happen now; otherwise the
 * open view holds unsaved entries, asks about them, and runs `proceed` itself if they are discarded.
 */
export type PreviewLeaveGuard = (proceed: () => void) => boolean

type Selection = { selectedId: string | null; select: (recordId: string) => void; panelId: string }

const SelectionContext = createContext<Selection | null>(null)

/** Whether the preview is the in-layout column or the modal drawer, and how to close it. */
type Chrome = { drawer: boolean; onClose: () => void }

const ChromeContext = createContext<Chrome | null>(null)

const WIDE_QUERY = '(min-width: 1280px)'
const MIN_PANEL_HEIGHT = 256
const ROW_CONTROLS =
  'a, button, input, select, textarea, label, summary, [role="button"], [role="menuitem"], [role="checkbox"], [contenteditable="true"]'

export const PREVIEW_SCROLL_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain'
export const PREVIEW_DRAWER_INSETS = 'pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)]'
export const PREVIEW_SECTION_CLASS = 'flex flex-col gap-2.5 px-4 py-3.5'
export const PREVIEW_HEADING_CLASS = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
export const PREVIEW_LINK_CLASS =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11'
export const PREVIEW_SHORTCUT_CLASS =
  'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:after:absolute pointer-coarse:after:-inset-1.5'

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** Null until the viewport is known (server render and hydration), where CSS alone decides whether the column shows. */
function useIsWide(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => null,
  )
}

/**
 * Replaces the current history entry, so browsing previews never adds Back steps and a refresh restores the selection.
 * A null state hands the URL to the Next.js router, which keeps useSearchParams in step without a server round trip.
 */
function writePreviewParam(param: string, recordId: string | null) {
  const url = new URL(window.location.href)
  if (recordId) url.searchParams.set(param, recordId)
  else url.searchParams.delete(param)
  window.history.replaceState(null, '', url)
}

/** A list can render the same record twice (cards and table rows); only the active view's trigger is laid out. */
export function findPreviewTrigger(recordId: string): HTMLElement | null {
  const triggers = document.querySelectorAll<HTMLElement>(`[data-preview-trigger="${CSS.escape(recordId)}"]`)
  return [...triggers].find((el) => el.offsetParent !== null) ?? null
}

function findPreviewItem(recordId: string) {
  return findPreviewTrigger(recordId)?.closest<HTMLElement>('[data-preview-item]') ?? null
}

/** The keyboard and screen-reader control for a record's preview. It selects; it never navigates. */
export function RecordPreviewTrigger({
  recordId,
  name,
  className,
  labelClassName,
}: {
  recordId: string
  name: string
  className?: string
  labelClassName?: string
}) {
  const preview = useContext(SelectionContext)
  const selected = preview?.selectedId === recordId
  return (
    <button
      type="button"
      data-preview-trigger={recordId}
      aria-current={selected ? 'true' : undefined}
      aria-controls={selected ? preview?.panelId : undefined}
      onClick={() => preview?.select(recordId)}
      className={cn(
        'cursor-pointer rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
    >
      <span className="sr-only">Preview </span>
      <span className={labelClassName}>{name}</span>
    </button>
  )
}

/**
 * The card or row body. A plain click anywhere that is not a control of its own selects the record;
 * links, buttons, checkboxes, and menus inside keep their behavior, and dragging to select text does nothing.
 */
export function RecordPreviewSurface({
  as = 'article',
  recordId,
  className,
  children,
  ...rest
}: {
  as?: 'article' | 'tr' | 'li'
  recordId: string
  className?: string
  children: React.ReactNode
  'data-state'?: string
  'data-slot'?: string
}) {
  const preview = useContext(SelectionContext)
  const selected = preview?.selectedId === recordId

  return createElement(
    as,
    {
      ...rest,
      'data-preview-item': recordId,
      // The `data-selected` variant matches the value "true", not mere presence.
      'data-selected': selected ? 'true' : undefined,
      className: cn(preview && 'cursor-pointer', className),
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (!preview || event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const control = (event.target as Element).closest(ROW_CONTROLS)
        if (control && event.currentTarget.contains(control)) return
        if (window.getSelection()?.toString()) return
        preview.select(recordId)
      },
    },
    children,
  )
}

/**
 * A list with its on-demand preview. With nothing selected the list has the full width and no preview is rendered.
 * A selection opens one preview: an in-layout column at desktop width, a modal drawer below it.
 */
export function RecordPreviewLayout<T extends PreviewRecord>({
  records,
  param,
  panelId,
  label,
  suspended = false,
  renderPreview,
  children,
}: {
  /** The records on screen. Only these can be previewed, so unknown or malformed IDs never reach the server. */
  records: readonly T[]
  /** The URL parameter that holds the selection. */
  param: string
  panelId: string
  /** Names the desktop region, for example "Project preview". */
  label: string
  /** A form overlay is open over the list. The preview drawer steps aside so two overlays never stack. */
  suspended?: boolean
  renderPreview: (record: T, options: { guardRef: React.RefObject<PreviewLeaveGuard | null>; drawer: boolean }) => React.ReactNode
  children: React.ReactNode
}) {
  // The list only ever mounts on its own route. While another route is shown over it (an intercepted form drawer),
  // the selection is held rather than read from that route's URL.
  const pathname = usePathname()
  const [listPath] = useState(pathname)
  const onList = pathname === listPath
  const liveId = useSearchParams().get(param)
  const [heldId, setHeldId] = useState(liveId)
  if (onList && heldId !== liveId) setHeldId(liveId)
  const urlId = onList ? liveId : heldId

  // A click applies immediately; the URL takes over again as soon as it reflects any change.
  const [pending, setPending] = useState<{ id: string | null; from: string | null } | null>(null)
  const [seenUrlId, setSeenUrlId] = useState(urlId)
  if (seenUrlId !== urlId) {
    setSeenUrlId(urlId)
    setPending(null)
  }
  const requestedId = pending && pending.from === urlId ? pending.id : urlId
  const selected = requestedId ? (records.find((r) => r.id === requestedId) ?? null) : null
  const selectedId = selected?.id ?? null
  const isWide = useIsWide()
  const inlineOpen = Boolean(selected) && isWide === true

  // A selection that filtering, sorting, or paging has taken off the screen is dropped from the URL.
  useEffect(() => {
    if (onList && urlId && !records.some((r) => r.id === urlId)) writePreviewParam(param, null)
  }, [onList, urlId, records, param])

  const lastSelectedId = useRef<string | null>(null)
  useEffect(() => {
    if (selectedId) lastSelectedId.current = selectedId
  }, [selectedId])

  // Opening or closing the column can reflow the list (fewer or more cards per row). The record that was acted on
  // is held at the same spot on screen across that reflow, before paint, so the page never appears to jump.
  const anchor = useRef<{ id: string; top: number } | null>(null)
  const holdInPlace = useCallback((recordId: string) => {
    const rect = findPreviewItem(recordId)?.getBoundingClientRect()
    anchor.current = rect && rect.bottom > 0 && rect.top < window.innerHeight ? { id: recordId, top: rect.top } : null
  }, [])
  useLayoutEffect(() => {
    const held = anchor.current
    anchor.current = null
    const item = held ? findPreviewItem(held.id) : null
    if (!held || !item) return
    const shift = item.getBoundingClientRect().top - held.top
    if (Math.abs(shift) >= 1) window.scrollBy({ top: shift, behavior: 'instant' })
  }, [inlineOpen, selectedId])

  // A view inside the preview can hold unsaved entries. Closing the preview or choosing another record asks that
  // view first, and happens only once it has nothing to lose or the entries are discarded.
  const leaveGuard = useRef<PreviewLeaveGuard | null>(null)
  const whenClear = useCallback((proceed: () => void) => {
    const guard = leaveGuard.current
    if (!guard || guard(proceed)) proceed()
  }, [])

  const select = useCallback(
    (recordId: string) => {
      if (recordId === selectedId) return
      whenClear(() => {
        holdInPlace(recordId)
        setPending({ id: recordId, from: urlId })
        writePreviewParam(param, recordId)
      })
    },
    [holdInPlace, param, selectedId, urlId, whenClear],
  )
  const close = useCallback(() => {
    whenClear(() => {
      setPending({ id: null, from: urlId })
      writePreviewParam(param, null)
    })
  }, [param, urlId, whenClear])
  const closeInline = useCallback(() => {
    whenClear(() => {
      const trigger = selectedId ? findPreviewTrigger(selectedId) : null
      if (selectedId) holdInPlace(selectedId)
      setPending({ id: null, from: urlId })
      writePreviewParam(param, null)
      trigger?.focus({ preventScroll: true })
    })
  }, [holdInPlace, param, selectedId, urlId, whenClear])

  const context = useMemo(() => ({ selectedId, select, panelId }), [selectedId, select, panelId])

  return (
    <SelectionContext.Provider value={context}>
      <div data-preview-open={selected ? '' : undefined} className="group/preview flex min-w-0 items-start gap-5">
        <div className="@container min-w-0 flex-1">{children}</div>
        {selected && isWide !== false && (
          <RecordPreviewPanel panelId={panelId} label={label} onClose={closeInline} className={isWide === null ? 'hidden xl:flex' : 'flex'}>
            <Fragment key={selected.id}>{renderPreview(selected, { guardRef: leaveGuard, drawer: false })}</Fragment>
          </RecordPreviewPanel>
        )}
      </div>
      {isWide === false && (
        <RecordPreviewDrawer
          panelId={panelId}
          record={suspended || !onList ? null : selected}
          onClose={close}
          finalFocus={() => (lastSelectedId.current ? findPreviewTrigger(lastSelectedId.current) : null) ?? true}
        >
          {(record) => <Fragment key={record.id}>{renderPreview(record, { guardRef: leaveGuard, drawer: true })}</Fragment>}
        </RecordPreviewDrawer>
      )}
    </SelectionContext.Provider>
  )
}

/** Desktop preview: an in-layout column beside the list. A labeled region, never a modal, so focus is not trapped. */
function RecordPreviewPanel({
  panelId,
  label,
  onClose,
  className,
  children,
}: {
  panelId: string
  label: string
  onClose: () => void
  className?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const chrome = useMemo(() => ({ drawer: false, onClose }), [onClose])

  // The panel starts level with the list and only sticks below the header once the page scrolls, so the room beneath
  // it changes. Its height follows that room, ending above the floating actions in the bottom-right corner.
  useLayoutEffect(() => {
    const panel = ref.current
    if (!panel) return
    let frame = 0
    const fit = () => {
      frame = 0
      const stack = document.querySelector('[data-floating-stack]')?.getBoundingClientRect()
      const floor = stack && stack.height > 0 ? stack.top - 12 : window.innerHeight - 16
      const top = Math.max(panel.getBoundingClientRect().top, 0)
      panel.style.maxHeight = `${Math.max(MIN_PANEL_HEIGHT, floor - top)}px`
    }
    const schedule = () => {
      frame ||= requestAnimationFrame(fit)
    }
    fit()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    // A floating action that joins or leaves the stack moves the floor the panel ends above.
    const stack = document.querySelector('[data-floating-stack]')
    const observer = stack && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    if (stack) observer?.observe(stack)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
    // The display class changes once the viewport is known, which is when the panel first has a measurable position.
  }, [className])

  return (
    <section
      ref={ref}
      id={panelId}
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        event.stopPropagation()
        onClose()
      }}
      className={cn(
        // The max-height here is the first-paint value for the stuck position; the effect above refines it.
        // `duration-200` times the entrance animation but also enables a transition on every property, so transitions
        // are turned off: an eased max-height would let the panel run under the floating actions on each refit.
        'sticky top-[calc(5rem+env(safe-area-inset-top))] max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top))] w-[25rem] shrink-0 flex-col overflow-hidden rounded-xl border border-[#D6DDE5] bg-card shadow-xs transition-none animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none',
        className,
      )}
    >
      <ChromeContext.Provider value={chrome}>{children}</ChromeContext.Provider>
    </section>
  )
}

/** Below desktop width the same content opens as a modal drawer: right-side on tablets, a full-width sheet on phones. */
function RecordPreviewDrawer<T extends PreviewRecord>({
  panelId,
  record,
  onClose,
  finalFocus,
  children,
}: {
  panelId: string
  record: T | null
  onClose: () => void
  finalFocus?: React.ComponentProps<typeof DialogPrimitive.Popup>['finalFocus']
  children: (record: T) => React.ReactNode
}) {
  // The last record stays rendered through the closing transition.
  const [shown, setShown] = useState(record)
  if (record && record !== shown) setShown(record)
  const current = record ?? shown
  const chrome = useMemo(() => ({ drawer: true, onClose }), [onClose])

  return (
    <DialogPrimitive.Root open={Boolean(record)} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-foreground/20 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <DialogPrimitive.Popup
          id={panelId}
          finalFocus={finalFocus}
          className="fixed inset-0 z-50 flex h-screen max-h-dvh w-full flex-col overflow-hidden bg-card text-sm text-foreground shadow-xl outline-none transition duration-200 ease-out data-ending-style:translate-x-6 data-ending-style:opacity-0 data-starting-style:translate-x-6 data-starting-style:opacity-0 motion-reduce:transition-none sm:left-auto sm:max-w-md sm:border-l sm:border-[#D6DDE5]"
        >
          {current && <ChromeContext.Provider value={chrome}>{children(current)}</ChromeContext.Provider>}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** The record's name with Close beside it, then its identifying detail and its actions. */
export function RecordPreviewHeader({
  title,
  closeLabel,
  meta,
  actions,
}: {
  title: string
  closeLabel: string
  meta?: React.ReactNode
  actions?: React.ReactNode
}) {
  const chrome = useContext(ChromeContext)
  const titleClass = 'min-w-0 flex-1 text-pretty break-words font-serif text-lg font-semibold leading-snug text-foreground'
  return (
    <header
      className={cn(
        'flex shrink-0 flex-col gap-2.5 border-b border-[#D6DDE5] px-4 py-3.5',
        chrome?.drawer && 'pt-[max(0.875rem,env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))]',
      )}
    >
      <div className="flex items-start gap-2">
        {chrome?.drawer ? (
          <DialogPrimitive.Title className={titleClass}>{title}</DialogPrimitive.Title>
        ) : (
          <h2 className={titleClass}>{title}</h2>
        )}
        <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0" aria-label={closeLabel} onClick={chrome?.onClose}>
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        {meta}
        {actions && <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function PreviewSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="flex flex-col gap-5 px-4 py-4">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((block) => (
        <div key={block} className="flex animate-pulse flex-col gap-2 motion-reduce:animate-none" aria-hidden="true">
          <div className="h-3 w-24 rounded bg-muted" />
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-2/3 rounded bg-muted" />
        </div>
      ))}
    </div>
  )
}

export function PreviewRetryButton({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" className="pointer-coarse:h-11" disabled={retrying} onClick={onRetry}>
      {retrying ? <Loader2 data-icon="inline-start" className="animate-spin motion-reduce:animate-none" /> : <RefreshCw data-icon="inline-start" />}
      {retrying ? 'Loading' : 'Try again'}
    </Button>
  )
}

export function PreviewFailure({
  failure,
  retrying,
  onRetry,
}: {
  failure: { message: string; retry: boolean }
  retrying: boolean
  onRetry: () => void
}) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 px-4 py-4">
      <p className="flex items-start gap-2 text-sm text-warning">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        {failure.message}
      </p>
      {failure.retry && <PreviewRetryButton retrying={retrying} onRetry={onRetry} />}
    </div>
  )
}

/**
 * Loads one record's details and shows them, or an accurate loading or failure state. A response is only ever
 * shown under the record it was loaded for.
 */
export function RecordPreviewBody<T extends { id: string }>({
  url,
  recordId,
  loadingLabel,
  errorState,
  children,
}: {
  url: string
  recordId: string
  loadingLabel: string
  errorState: (status: number | null) => { message: string; retry: boolean }
  children: (preview: T) => React.ReactNode
}) {
  const chrome = useContext(ChromeContext)
  const { data, error, isValidating, mutate } = useSWR(url, fetchPreviewJson<T>, {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
  })
  const preview = data?.id === recordId ? data : null
  const failure = error ? errorState(error instanceof PreviewRequestError ? error.status : null) : null
  const blocked = failure && (!preview || !failure.retry)

  return (
    <div className={cn(PREVIEW_SCROLL_CLASS, chrome?.drawer && PREVIEW_DRAWER_INSETS)}>
      {blocked ? (
        <PreviewFailure failure={failure} retrying={isValidating} onRetry={() => mutate()} />
      ) : preview ? (
        <div className="flex flex-col divide-y divide-[#D6DDE5]/70">{children(preview)}</div>
      ) : (
        <PreviewSkeleton label={loadingLabel} />
      )}
    </div>
  )
}

export function PreviewSection({
  title,
  count,
  action,
  children,
}: {
  title: string
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
}) {
  const headingId = useId()
  return (
    <section aria-labelledby={headingId} className={PREVIEW_SECTION_CLASS}>
      <div className="flex min-h-6 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h3 id={headingId} className={PREVIEW_HEADING_CLASS}>
          {title}
          {count !== undefined && count > 0 && <span className="tabular-nums font-normal">{` (${count})`}</span>}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

/** A section whose own lookup failed. It says so, rather than reading as an empty list. */
export function PreviewSectionError({ children }: { children: React.ReactNode }) {
  return (
    <p role="status" className="text-sm text-warning">
      {children}
    </p>
  )
}

export function PreviewEmpty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

/** Call and email icons for one person. Each renders only when there is something to call or write to. */
export function PreviewShortcuts({ name, phone, email }: { name: string; phone: string | null; email: string | null }) {
  const phoneHref = phone ? phone.replace(/[^0-9+]/g, '') : ''
  return (
    <>
      {phoneHref.length >= 7 && (
        <a href={`tel:${phoneHref}`} className={PREVIEW_SHORTCUT_CLASS} aria-label={`Call ${name}`} title={phone ?? undefined}>
          <Phone className="size-4" aria-hidden="true" />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} className={PREVIEW_SHORTCUT_CLASS} aria-label={`Email ${name}`} title={email}>
          <Mail className="size-4" aria-hidden="true" />
        </a>
      )}
    </>
  )
}

/** The first few rows, with "View all" revealing the rest in place. */
export function PreviewList<T>({
  items,
  limit,
  itemKey,
  children,
}: {
  items: readonly T[]
  limit: number
  itemKey: (item: T) => string
  children: (item: T) => React.ReactNode
}) {
  const listId = useId()
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? items : items.slice(0, limit)
  return (
    <>
      <ul id={listId} className="flex flex-col gap-2.5">
        {shown.map((item) => (
          <li key={itemKey(item)} className="flex min-w-0 items-center gap-1">
            {children(item)}
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((open) => !open)}
          className={cn(PREVIEW_LINK_CLASS, 'cursor-pointer')}
        >
          {expanded ? 'Show fewer' : `View all (${items.length})`}
        </button>
      )}
    </>
  )
}

const INLINE_LINK_CLASS =
  'rounded-sm underline-offset-4 outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring'

/** Compact label-and-value rows, for a record's own fields. */
export function PreviewDetails({ children }: { children: React.ReactNode }) {
  return <dl className="flex flex-col gap-1.5">{children}</dl>
}

export function PreviewDetail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-baseline gap-3 text-sm">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words text-foreground">{children}</dd>
    </div>
  )
}

export function PreviewPhone({ value }: { value: string }) {
  const digits = value.replace(/[^0-9+]/g, '')
  const shown = formatPhone(value) || value
  if (digits.length < 7) return <>{shown}</>
  return (
    <a href={`tel:${digits}`} className={cn(INLINE_LINK_CLASS, 'tabular-nums')}>
      {shown}
    </a>
  )
}

export function PreviewEmail({ value }: { value: string }) {
  return (
    <a href={`mailto:${value}`} className={cn(INLINE_LINK_CLASS, 'break-all')}>
      {value}
    </a>
  )
}

/** A related record inside a list: its name opens it, with one line of supporting detail beneath. */
export function PreviewRecordLink({ href, name, detail }: { href: string; name: string; detail?: string | null }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Link
        href={href}
        className="max-w-full self-start truncate rounded-sm text-sm font-medium text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        {name}
      </Link>
      {detail && <span className="break-words text-xs text-muted-foreground">{detail}</span>}
    </div>
  )
}

export function PreviewNotes({ notes }: { notes: string | null }) {
  if (!notes) return null
  return (
    <PreviewSection title="Notes">
      <p className="whitespace-pre-line break-words text-sm leading-relaxed text-foreground">{notes}</p>
    </PreviewSection>
  )
}
