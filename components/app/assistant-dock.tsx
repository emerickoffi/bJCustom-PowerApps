'use client'

import {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
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
import {
  COMMON_LAUNCHER_ACTIONS,
  LAUNCHER_ALIASES,
  LAUNCHER_LABELS,
  LAUNCHER_MAX_ACTIONS,
  launcherPlanFor,
  pageButtonLauncherIds,
  type LauncherIcon,
} from '@/lib/launcher-actions'
import { projectPickerHref, type ProjectPickerAction, type QuickAction } from '@/lib/quick-actions'
import { PREVIEW_PARAM } from '@/lib/project-preview'
import { useLauncherRegistry, useRegisteredLauncherActions, type LauncherAction } from '@/components/app/floating-actions'
import { useProjectQuickActionsScope, useQuickActionDrawer } from '@/components/app/quick-actions'
import { LauncherProjectPicker } from '@/components/app/launcher-project-picker'
import { confirmLeave } from '@/components/app/navigation-guard'
import dynamic from 'next/dynamic'

// The chat sheet carries the markdown renderer and draft schemas; keep it out of every page's first load.
const loadAssistantSheet = () => import('@/components/assistant/assistant-launcher').then((m) => m.AssistantSheet)
const AssistantSheet = dynamic(loadAssistantSheet, { ssr: false })

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
/** Per-pill stagger: opening builds up from the launcher, closing folds down from the top a little faster. */
const OPEN_STAGGER_MS = 70
const CLOSE_STAGGER_MS = 45
const ASK_AI_ID = 'ask-ai'

/** How the pills were revealed: hover follows the pointer; touch and keyboard stay until dismissed. */
type Mode = 'hover' | 'touch' | 'keyboard'

type Sources = {
  plan: ReturnType<typeof launcherPlanFor>
  /** Launcher ids already offered by a visible button on this page. */
  pageButtonIds: string[]
  registered: LauncherAction[]
  scope: ReturnType<typeof useProjectQuickActionsScope>
  globals: QuickAction[]
  pickerActions: ProjectPickerAction[]
  openDrawer: ReturnType<typeof useQuickActionDrawer>
  askForProject: (action: ProjectPickerAction) => void
}

/** Collects every shortcut the viewer may use here, keyed by launcher id, and orders the page's own first. */
function resolveActions(sources: Sources, limit: number): LauncherAction[] {
  const { plan, registered, scope, globals, pickerActions, openDrawer, askForProject } = sources
  const available = new Map<string, LauncherAction>()
  const label = (id: string, fallback: string) => LAUNCHER_LABELS[id] ?? fallback

  const fromCatalog = (id: string, a: QuickAction, projectName?: string): LauncherAction => ({
    id,
    label: label(id, a.label),
    icon: a.icon,
    href: a.href,
    onSelect: a.drawer && openDrawer ? () => openDrawer(a, projectName) : undefined,
  })

  for (const a of globals) available.set(`global:${a.key}`, fromCatalog(`global:${a.key}`, a))

  const project = plan.project
  if (project?.source === 'route') {
    // Job actions only apply to the project the route shows, once its layout has published that project's catalog.
    if (scope?.projectId === project.id) {
      for (const a of scope.actions) available.set(`ctx:${a.key}`, fromCatalog(`ctx:${a.key}`, a, scope.projectName))
      const assign = pickerActions.find((a) => a.key === 'assign')
      if (assign) {
        available.set('ctx:assign', { id: 'ctx:assign', label: assign.label, icon: assign.icon, href: projectPickerHref('assign', project.id) })
      }
    }
  } else {
    for (const a of pickerActions) {
      const id = `ctx:${a.key}`
      if (project) {
        available.set(id, { id, label: label(id, a.label), icon: a.icon, href: projectPickerHref(a.key, project.id) })
      } else if (a.key === 'daily_log') {
        // The daily log flow has its own project chooser page.
        available.set(id, { id, label: label(id, a.label), icon: a.icon, href: '/daily-logs/new' })
      } else {
        available.set(id, { id, label: label(id, a.label), icon: a.icon, onSelect: () => askForProject(a) })
      }
    }
  }

  // A page's own registration replaces the catalog version of the same workflow (e.g. the in-page contact drawer).
  const extras: LauncherAction[] = []
  for (const a of registered) {
    const id = LAUNCHER_ALIASES[a.id] ?? a.id
    if (id === 'ctx:assign' && project?.source !== 'route') continue
    const action = { ...a, id }
    if (available.has(id) || plan.contextual.includes(id)) available.set(id, action)
    else extras.push(action)
  }
  extras.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))

  const ordered: LauncherAction[] = []
  // Ids the page's own header button covers are marked seen up front, so they never take a pill slot.
  const seen = new Set<string>(sources.pageButtonIds)
  const add = (a: LauncherAction | undefined) => {
    if (!a || seen.has(a.id)) return
    seen.add(a.id)
    ordered.push(a)
  }
  for (const id of plan.contextual) add(available.get(id))
  for (const a of extras) add(a)
  for (const id of COMMON_LAUNCHER_ACTIONS) add(available.get(id))
  return ordered.slice(0, limit)
}

type DockProps = {
  /** Null when the AI assistant is off for this workspace; the launcher then only offers quick actions. */
  assistant: { configured: boolean } | null
  globalActions: QuickAction[]
  /** Job actions the viewer's role and workspace features allow before a project is chosen. */
  pickerActions: ProjectPickerAction[]
}

/**
 * The one bottom-right floating control. Hovering (fine pointers) unfolds the shortcuts as separate pills;
 * clicking, Enter or Space opens the AI assistant. Touch taps toggle the pills, which then include "Ask AI".
 * Keyboard users reach the pills through the discreet "Show quick actions" control beside the launcher.
 */
export function AssistantDock(props: DockProps) {
  return (
    <Suspense fallback={null}>
      <Dock {...props} />
    </Suspense>
  )
}

function Dock({ assistant, globalActions, pickerActions }: DockProps) {
  const registry = useLauncherRegistry()
  const router = useRouter()
  const pathname = usePathname() ?? ''
  const searchParams = useSearchParams()
  const query = searchParams?.toString() ?? ''
  const previewId = pathname === '/projects' ? (searchParams?.get(PREVIEW_PARAM) ?? null) : null
  const registered = useRegisteredLauncherActions()
  const scope = useProjectQuickActionsScope()
  const openDrawer = useQuickActionDrawer()
  const [mode, setMode] = useState<Mode | null>(null)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiMounted, setAiMounted] = useState(false)
  const [pending, setPending] = useState<ProjectPickerAction | null>(null)
  const timer = useRef<number | null>(null)
  const lastPointer = useRef('')
  const focusFirstPill = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()

  const touch = mode === 'touch'
  const plan = launcherPlanFor(pathname, previewId)
  const pageButtonIds = pageButtonLauncherIds(pathname, searchParams)
  const sources: Sources = { plan, pageButtonIds, registered, scope, globals: globalActions, pickerActions, openDrawer, askForProject: setPending }
  const actions = resolveActions(sources, touch ? LAUNCHER_MAX_ACTIONS.touch : LAUNCHER_MAX_ACTIONS.pointer)
  const pills: LauncherAction[] =
    touch && assistant ? [...actions, { id: ASK_AI_ID, label: 'Ask AI', icon: 'ai' }] : actions
  const open = mode !== null && pills.length > 0
  const hasActions = actions.length > 0
  const pillKey = pills.map((p) => `${p.id}|${p.label}`).join(',')

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
    setAiMounted(true)
    setAiOpen(true)
  }, [dismiss])

  // Fetch the chat code (not any AI request) once the launcher is engaged so the sheet opens without a wait.
  const launcherEngaged = mode !== null
  useEffect(() => {
    if (launcherEngaged && assistant) void loadAssistantSheet()
  }, [launcherEngaged, assistant])

  // Route, query (filters, tabs, previewed project) or project changes close the pills and drop a pending pick.
  const projectKey = scope?.projectId ?? ''
  useEffect(() => {
    dismiss()
    setPending(null)
  }, [pathname, query, projectKey, dismiss])
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

  // Each pill starts with its right-center on the launcher's center, so every pill travels its own path
  // (right-to-left, bottom-to-top) out of the launcher. Offsets ignore transforms, so mid-flight pills measure true.
  useLayoutEffect(() => {
    const list = listRef.current
    const launcher = registry?.launcherRef.current
    if (!list || !launcher) return
    const measure = () => {
      const listBox = list.getBoundingClientRect()
      const launcherBox = launcher.getBoundingClientRect()
      const originX = launcherBox.left + launcherBox.width / 2 - listBox.left
      const originY = launcherBox.top + launcherBox.height / 2 - listBox.top
      for (const item of Array.from(list.children) as HTMLElement[]) {
        const pill = item.firstElementChild as HTMLElement | null
        if (!pill) continue
        const right = item.offsetLeft + pill.offsetLeft + pill.offsetWidth
        const centerY = item.offsetTop - list.scrollTop + pill.offsetTop + pill.offsetHeight / 2
        item.style.setProperty('--from-x', `${Math.round(originX - right)}px`)
        item.style.setProperty('--from-y', `${Math.round(originY - centerY)}px`)
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(list)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [registry, pillKey])

  if (!registry) return null
  if (!assistant && !hasActions) return null

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
          (aiOpen || pending) && 'pointer-events-none opacity-0',
        )}
      >
        {/* The list itself never takes the pointer; only the pills and their padding (the bridge across gaps) do. */}
        <ul
          ref={listRef}
          id={listId}
          aria-label="Quick actions"
          inert={!open}
          className={cn(
            'pointer-events-none absolute bottom-full right-0 flex max-h-[calc(100dvh-9rem)] flex-col-reverse items-end',
            '[@media(max-height:560px)]:overflow-y-auto [@media(max-height:560px)]:overscroll-contain [@media(max-height:560px)]:pl-3',
            open && '[@media(max-height:560px)]:pointer-events-auto',
          )}
        >
          {pills.map((action, index) => (
            <li
              key={action.id}
              style={
                {
                  '--pill-delay': `${open ? index * OPEN_STAGGER_MS : (pills.length - 1 - index) * CLOSE_STAGGER_MS}ms`,
                } as CSSProperties
              }
              className={cn(
                'flex w-max max-w-[calc(100vw-2.5rem)] shrink-0 justify-end py-[5px] first:pb-3',
                'origin-right transition-[opacity,transform] [transition-delay:var(--pill-delay)] motion-reduce:[transition-delay:0ms]',
                open
                  ? 'pointer-events-auto opacity-100 [transform:none] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
                  : 'opacity-0 [transform:translate(var(--from-x,0px),var(--from-y,0px))_scale(0.92)] duration-200 ease-[cubic-bezier(0.4,0,1,1)] motion-reduce:[transform:none]',
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
                'absolute right-full top-1/2 mr-2 flex min-h-11 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-[#A8D8DF] bg-sage px-3 text-sm font-medium text-[#17212B] shadow-sm',
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
              'relative flex size-14 touch-manipulation items-center justify-center rounded-2xl bg-primary text-primary-foreground [-webkit-tap-highlight-color:transparent]',
              'shadow-[0_8px_20px_-6px_rgb(0_88_103/0.55),0_2px_6px_-2px_rgb(23_33_43/0.2)] transition-[translate,box-shadow,background-color] duration-200 ease-out',
              'hover:bg-primary-hover hover:shadow-[0_0_0_4px_color-mix(in_oklab,var(--action)_30%,transparent),0_12px_26px_-8px_color-mix(in_oklab,var(--action)_70%,transparent)] motion-safe:hover:-translate-y-0.5',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
              open && 'shadow-[0_0_0_4px_color-mix(in_oklab,var(--action)_30%,transparent),0_8px_20px_-6px_rgb(0_88_103/0.55)]',
            )}
          >
            <Sparkles className="size-6" strokeWidth={2.25} aria-hidden="true" />
            <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-action ring-2 ring-primary" aria-hidden="true" />
          </button>
        </div>
      </div>

      {assistant && aiMounted && <AssistantSheet configured={assistant.configured} open={aiOpen} onOpenChange={setAiOpen} />}
      <LauncherProjectPicker
        actionLabel={pending?.label ?? null}
        onCancel={() => setPending(null)}
        onPick={(job) => {
          if (!pending) return
          const href = projectPickerHref(pending.key, job.id)
          setPending(null)
          if (confirmLeave()) router.push(href)
        }}
      />
    </>
  )
}

function Pill({ action, onSelect }: { action: LauncherAction; onSelect: () => void }) {
  const Icon = ICONS[action.icon]
  const className = cn(
    'flex min-h-11 w-max max-w-full items-center gap-2 rounded-full border border-[#A8D8DF] bg-sage py-2 pl-3.5 pr-4 text-left text-sm font-semibold leading-snug text-[#17212B]',
    'shadow-[0_6px_14px_-6px_rgb(0_88_103/0.35),0_1px_2px_rgb(23_33_43/0.08)] transition-[background-color,border-color,box-shadow,translate] duration-150',
    'hover:border-action hover:bg-[#FFF0D6] hover:shadow-[0_10px_20px_-8px_rgb(163_92_0/0.45),0_2px_4px_rgb(23_33_43/0.1)] motion-safe:hover:-translate-y-px',
    'focus-visible:border-action focus-visible:bg-[#FFF0D6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
  )
  const content = (
    <>
      <Icon className="size-4 shrink-0 text-[#00879A]" strokeWidth={2.25} aria-hidden="true" />
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
