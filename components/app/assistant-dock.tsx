'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  Building2,
  CalendarPlus,
  Camera,
  ChevronUp,
  ClipboardPen,
  FilePlus2,
  FileSpreadsheet,
  FolderPlus,
  HardHat,
  ImagePlus,
  MessageCircleQuestion,
  Receipt,
  Save,
  Sparkles,
  Upload,
  UserPlus,
  UserRoundPlus,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FLOATING_ABOVE_TABLET_NAV, FLOATING_CORNER_BOTTOM, FLOATING_CORNER_RIGHT } from '@/lib/floating-actions'
import { LAUNCHER_LABELS, LAUNCHER_MAX_ACTIONS, launcherPlanFor, type LauncherIcon } from '@/lib/launcher-actions'
import type { QuickAction } from '@/lib/quick-actions'
import { useLauncherRegistry, useRegisteredLauncherActions, type LauncherAction } from '@/components/app/floating-actions'
import { useProjectQuickActionsScope } from '@/components/app/quick-actions'
import { AssistantSheet } from '@/components/assistant/assistant-launcher'

const ICONS: Record<LauncherIcon, LucideIcon> = {
  project: FolderPlus,
  client: UserRoundPlus,
  contact: UserPlus,
  company: Building2,
  subcontractor: HardHat,
  schedule: CalendarPlus,
  daily_log: ClipboardPen,
  document: Upload,
  estimate: FilePlus2,
  invoice: Receipt,
  rfi: MessageCircleQuestion,
  quote: FileSpreadsheet,
  camera: Camera,
  gallery: ImagePlus,
  save: Save,
  ai: Sparkles,
}

const OPEN_DELAY_MS = 150
const CLOSE_DELAY_MS = 250
const ASK_AI_ID = 'ask-ai'

/** How the pills were revealed: hover follows the pointer; touch and keyboard stay until dismissed. */
type Mode = 'hover' | 'touch' | 'keyboard'

function resolveActions(
  plan: ReturnType<typeof launcherPlanFor>,
  registered: LauncherAction[],
  scope: ReturnType<typeof useProjectQuickActionsScope>,
  limit: number,
  globals: QuickAction[] = [],
): LauncherAction[] {
  const fromCatalog = (prefix: string, a: QuickAction): LauncherAction => ({
    id: `${prefix}:${a.key}`,
    label: LAUNCHER_LABELS[`${prefix}:${a.key}`] ?? a.label,
    icon: a.icon,
    href: a.href,
  })
  const available = new Map<string, LauncherAction>()
  // Project actions only apply to the project the route shows, never a previously remembered one.
  if (plan.projectId && scope?.projectId === plan.projectId) {
    for (const a of scope.actions) available.set(`project:${a.key}`, fromCatalog('project', a))
  }
  for (const a of globals) available.set(`global:${a.key}`, fromCatalog('global', a))
  for (const a of registered) available.set(a.id, a)

  const planned = plan.order.flatMap((id) => available.get(id) ?? [])
  const rest = registered
    .filter((a) => !plan.order.includes(a.id))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  return [...planned, ...rest].slice(0, limit)
}

/**
 * The one bottom-right floating control. Hovering (fine pointers) reveals the page's quick actions as separate
 * pills; clicking, Enter or Space opens the AI assistant. Touch taps toggle the pills, which then include "Ask AI".
 * Keyboard users reach the pills through the discreet "Show quick actions" control beside the launcher.
 */
export function AssistantDock({
  assistant,
  globalActions,
}: {
  /** Null when the AI assistant is off for this workspace; the launcher then only offers quick actions. */
  assistant: { configured: boolean } | null
  globalActions: QuickAction[]
}) {
  const registry = useLauncherRegistry()
  const pathname = usePathname() ?? ''
  const registered = useRegisteredLauncherActions()
  const scope = useProjectQuickActionsScope()
  const [mode, setMode] = useState<Mode | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const timer = useRef<number | null>(null)
  const lastPointer = useRef('')
  const focusFirstPill = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const touch = mode === 'touch'
  const plan = launcherPlanFor(pathname)
  const pointerActions = resolveActions(plan, registered, scope, LAUNCHER_MAX_ACTIONS.pointer, globalActions)
  const actions = touch ? pointerActions.slice(0, LAUNCHER_MAX_ACTIONS.touch) : pointerActions
  const pills: LauncherAction[] =
    touch && assistant ? [...actions, { id: ASK_AI_ID, label: 'Ask AI', icon: 'ai' }] : actions
  const open = mode !== null && pills.length > 0
  const hasActions = actions.length > 0

  const clearTimer = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = null
  }, [])

  const dismiss = useCallback(() => {
    clearTimer()
    setMode(null)
  }, [clearTimer])

  const openAi = useCallback(() => {
    dismiss()
    setAiOpen(true)
  }, [dismiss])

  // Route, query, project or workspace changes leave the pills closed with no hover timer pending.
  const projectKey = scope?.projectId ?? ''
  useEffect(() => dismiss(), [pathname, projectKey, dismiss])
  useEffect(() => clearTimer, [clearTimer])

  // Pills opened by touch or keyboard close on an interaction outside the launcher group.
  useEffect(() => {
    if (mode !== 'touch' && mode !== 'keyboard') return
    const onPointerDown = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) dismiss()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [mode, dismiss])

  useEffect(() => {
    if (!open || !focusFirstPill.current) return
    focusFirstPill.current = false
    listRef.current?.querySelector<HTMLElement>('[data-launcher-pill]')?.focus()
  }, [open])

  if (!registry) return null
  if (!assistant && pointerActions.length === 0) return null

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    clearTimer()
    if (mode === null && hasActions && !aiOpen) {
      timer.current = window.setTimeout(() => setMode((m) => m ?? 'hover'), OPEN_DELAY_MS)
    }
  }

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return
    clearTimer()
    if (mode === 'hover') {
      timer.current = window.setTimeout(() => setMode((m) => (m === 'hover' ? null : m)), CLOSE_DELAY_MS)
    }
  }

  const onLauncherClick = (detail: number) => {
    // A click with no pointer press behind it (detail 0) came from Enter or Space.
    const input = detail === 0 ? 'keyboard' : lastPointer.current
    clearTimer()
    if (input === 'touch' || input === 'pen') {
      if (open) dismiss()
      else if (hasActions) setMode('touch')
      else if (assistant) openAi()
      return
    }
    if (assistant) return openAi()
    // Without the assistant the launcher only holds quick actions.
    if (open) dismiss()
    else {
      focusFirstPill.current = input === 'keyboard'
      setMode(input === 'keyboard' ? 'keyboard' : 'touch')
    }
  }

  const showForKeyboard = () => {
    clearTimer()
    focusFirstPill.current = true
    setMode('keyboard')
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      dismiss()
      registry.launcherRef.current?.focus()
      return
    }
    if (!open || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    const items = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-launcher-pill]') ?? [])
    const at = items.indexOf(document.activeElement as HTMLElement)
    if (at === -1) return
    event.preventDefault()
    // The list runs from the launcher upward, so ArrowUp moves away from it.
    const next = event.key === 'ArrowUp' ? at + 1 : at - 1
    if (next < 0) registry.launcherRef.current?.focus()
    else items[Math.min(next, items.length - 1)]?.focus()
  }

  const select = (action: LauncherAction) => {
    const trigger = registry.launcherRef.current
    dismiss()
    if (action.id === ASK_AI_ID) return openAi()
    action.onSelect?.(trigger)
  }

  return (
    <>
      <div
        ref={rootRef}
        data-floating-stack
        data-floating-control
        data-yields-to-overlay
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
        onBlur={(event) => {
          if (mode === 'keyboard' && !event.currentTarget.contains(event.relatedTarget as Node | null)) dismiss()
        }}
        className={cn(
          'group fixed z-40 transition-opacity duration-150 print:hidden',
          FLOATING_CORNER_BOTTOM,
          FLOATING_CORNER_RIGHT,
          FLOATING_ABOVE_TABLET_NAV,
        )}
      >
        <ul
          ref={listRef}
          id={listId}
          aria-label="Quick actions"
          inert={!open}
          className={cn(
            'absolute bottom-full right-0 mb-3 flex flex-col-reverse items-end gap-2.5',
            !open && 'pointer-events-none',
          )}
        >
          {pills.map((action, index) => (
            <li
              key={action.id}
              style={{ '--pill-delay': `${open ? index * 50 : (pills.length - 1 - index) * 30}ms` } as CSSProperties}
              className={cn(
                // A transparent bridge across the gap keeps the pills open while the pointer travels between them.
                'relative flex justify-end before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-[""] first:before:-bottom-3',
                'transition-[opacity,translate] ease-out motion-safe:[transition-delay:var(--pill-delay)]',
                open ? 'opacity-100 duration-200' : 'opacity-0 duration-150 motion-safe:translate-y-2.5',
              )}
            >
              <Pill action={action} onSelect={() => select(action)} />
            </li>
          ))}
        </ul>

        <div className="relative">
          {hasActions && !open && (
            <button
              type="button"
              aria-controls={listId}
              aria-expanded={false}
              onClick={showForKeyboard}
              className={cn(
                'absolute right-full top-1/2 mr-2 flex min-h-11 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-white px-3 text-sm font-medium text-foreground shadow-sm',
                'pointer-events-none opacity-0 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              )}
            >
              <ChevronUp className="size-4 text-primary" aria-hidden="true" />
              Show quick actions
            </button>
          )}
          <button
            ref={registry.launcherRef}
            type="button"
            aria-label="Trefort assistant"
            aria-haspopup={assistant ? 'dialog' : undefined}
            aria-expanded={assistant ? aiOpen : open}
            aria-controls={assistant ? undefined : listId}
            onPointerDown={(event) => {
              lastPointer.current = event.pointerType
            }}
            onClick={(event) => onLauncherClick(event.detail)}
            className={cn(
              'flex size-14 touch-manipulation items-center justify-center rounded-2xl border border-border bg-white shadow-[0_6px_16px_-6px_rgb(23_33_43/0.22),0_2px_4px_-2px_rgb(23_33_43/0.12)] transition-[translate,box-shadow,border-color] duration-200 ease-out [-webkit-tap-highlight-color:transparent]',
              'hover:border-action/40 hover:shadow-[0_10px_24px_-8px_color-mix(in_oklab,var(--action)_55%,transparent),0_2px_6px_-2px_rgb(23_33_43/0.14)] motion-safe:hover:-translate-y-0.5',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              open && 'border-action/40',
            )}
          >
            <AssistantMark />
          </button>
        </div>

        <Suspense fallback={null}>
          <QueryChangeWatcher onChange={dismiss} />
        </Suspense>
      </div>

      {assistant && <AssistantSheet configured={assistant.configured} open={aiOpen} onOpenChange={setAiOpen} />}
    </>
  )
}

function Pill({ action, onSelect }: { action: LauncherAction; onSelect: () => void }) {
  const Icon = ICONS[action.icon]
  const className = cn(
    'group/pill flex min-h-11 w-max max-w-[calc(100vw-2.5rem)] items-center gap-2 rounded-full border border-border bg-white py-2 pl-3 pr-4 text-left text-sm font-medium leading-snug text-foreground',
    'shadow-[0_4px_12px_-4px_rgb(23_33_43/0.18),0_1px_2px_rgb(23_33_43/0.08)] transition-colors duration-150',
    'hover:border-primary/40 hover:bg-sage/40 hover:text-primary',
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  )
  const content = (
    <>
      <Icon className="size-4 shrink-0 text-primary transition-colors group-hover/pill:text-action" aria-hidden="true" />
      <span className="min-w-0">{action.label}</span>
    </>
  )
  if (action.href && !action.onSelect) {
    return (
      <Link data-launcher-pill href={action.href} scroll={action.scroll} onClick={onSelect} className={className}>
        {content}
      </Link>
    )
  }
  return (
    <button
      data-launcher-pill
      type="button"
      aria-haspopup={action.id === ASK_AI_ID ? 'dialog' : undefined}
      onClick={onSelect}
      className={className}
    >
      {content}
    </button>
  )
}

/** Dismisses the pills when the query string changes (filters, tabs, a selected project preview). */
function QueryChangeWatcher({ onChange }: { onChange: () => void }) {
  const query = useSearchParams()?.toString() ?? ''
  useEffect(() => onChange(), [query, onChange])
  return null
}

/** Trefort's flowing teal mark with an orange accent. */
function AssistantMark() {
  return (
    <svg viewBox="0 0 32 32" fill="none" className="size-8" aria-hidden="true">
      <path
        d="M5 13.5c3.6-4.2 8.2-4.6 11.6-1.6 3.1 2.8 6.6 2.9 10.4-.4"
        className="stroke-primary"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M5 20.5c3.6-4.2 8.2-4.6 11.6-1.6 3.1 2.8 6.6 2.9 10.4-.4"
        className="stroke-primary opacity-55"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="24.5" cy="6.5" r="2.5" className="fill-action" />
    </svg>
  )
}
