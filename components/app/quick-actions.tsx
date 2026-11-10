'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  CalendarPlus,
  ClipboardPen,
  FilePlus2,
  FolderPlus,
  HardHat,
  MessageCircleQuestion,
  Plus,
  Receipt,
  Upload,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { QuickCreateContactDrawer } from '@/components/contacts/quick-create-contact-drawer'
import { AskQuestionDrawer, type AskQuestionRequest } from '@/components/rfis/ask-question-drawer'
import type { QuickAction, QuickActionIcon } from '@/lib/quick-actions'

export type { QuickAction, QuickActionIcon } from '@/lib/quick-actions'

type ProjectScope = { projectName: string; actions: QuickAction[] }

const ICONS: Record<QuickActionIcon, LucideIcon> = {
  schedule: CalendarPlus,
  estimate: FilePlus2,
  document: Upload,
  project: FolderPlus,
  client: UserPlus,
  contact: Building2,
  subcontractor: HardHat,
  invoice: Receipt,
  daily_log: ClipboardPen,
  rfi: MessageCircleQuestion,
}

type OpenDrawer = { drawer: 'contact' } | { drawer: 'rfi'; request: AskQuestionRequest }

type QuickActionsContextValue = {
  scope: ProjectScope | null
  setScope: (scope: ProjectScope | null) => void
  openDrawer: (drawer: OpenDrawer) => void
}

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null)

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<ProjectScope | null>(null)
  const [drawer, setDrawer] = useState<OpenDrawer | null>(null)
  const closeDrawer = useCallback(() => setDrawer(null), [])
  const value = useMemo(() => ({ scope, setScope, openDrawer: setDrawer }), [scope])
  return (
    <QuickActionsContext.Provider value={value}>
      {children}
      <QuickCreateContactDrawer open={drawer?.drawer === 'contact'} onClose={closeDrawer} />
      <AskQuestionDrawer request={drawer?.drawer === 'rfi' ? drawer.request : null} onClose={closeDrawer} />
    </QuickActionsContext.Provider>
  )
}

/**
 * Opens the "Ask a question (RFI)" drawer over the current page, for callers outside the Quick Create menu.
 * Null when the page is not inside the staff shell.
 */
export function useAskQuestion(): ((request: AskQuestionRequest) => void) | null {
  const openDrawer = useContext(QuickActionsContext)?.openDrawer
  return useMemo(() => (openDrawer ? (request: AskQuestionRequest) => openDrawer({ drawer: 'rfi', request }) : null), [openDrawer])
}

/**
 * Rendered by the project layout with actions it already checked against the user's role,
 * enabled features, and project state. Takes priority over the remembered job while mounted.
 */
export function ProjectQuickActionsScope({ projectName, actions }: ProjectScope) {
  const setScope = useContext(QuickActionsContext)?.setScope
  const signature = JSON.stringify(actions)

  useEffect(() => {
    if (!setScope) return
    setScope({ projectName, actions: JSON.parse(signature) as QuickAction[] })
    return () => setScope(null)
  }, [setScope, projectName, signature])

  return null
}

function ActionItem({ action, projectName }: { action: QuickAction; projectName?: string }) {
  const Icon = ICONS[action.icon]
  const openDrawer = useContext(QuickActionsContext)?.openDrawer
  const drawer = openDrawer ? action.drawer : undefined
  // A job action carries its project; the standalone one leaves the project for the person to choose.
  const target: OpenDrawer | null =
    drawer === 'rfi'
      ? { drawer, request: action.projectId ? { projectId: action.projectId, projectName } : {} }
      : drawer
        ? { drawer }
        : null
  return (
    <DropdownMenuItem
      render={target ? undefined : <Link href={action.href} />}
      // The menu closes on click; the drawer opens on the next frame so focus moves into it, not back to the trigger.
      onClick={target ? () => requestAnimationFrame(() => openDrawer?.(target)) : undefined}
      className="min-h-11 gap-3 px-2.5 py-2 sm:min-h-0"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sage text-primary" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <span className="text-sm font-medium text-foreground">{action.label}</span>
    </DropdownMenuItem>
  )
}

/** Header "Quick Create" menu: actions for the current job first, then records that stand on their own. */
export function QuickCreateMenu({
  globalActions,
  jobScope,
}: {
  globalActions: QuickAction[]
  jobScope: ProjectScope | null
}) {
  const pageScope = useContext(QuickActionsContext)?.scope ?? null
  const scope = pageScope ?? jobScope
  const jobActions = scope?.actions ?? []
  // An action offered for the current job is not repeated in the standalone list.
  const jobKeys = new Set(jobActions.map((a) => a.key))
  globalActions = globalActions.filter((a) => !jobKeys.has(a.key))
  if (jobActions.length === 0 && globalActions.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Quick create"
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-action-border bg-action font-semibold text-action-foreground hover:bg-action-hover active:bg-action-pressed px-2.5 text-sm transition-colors aria-expanded:bg-action-pressed sm:px-3',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline md:hidden lg:inline">Quick Create</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-w-[calc(100vw-1.5rem)] p-1.5">
        {jobActions.length > 0 && scope && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2.5 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">For this job</span>
              <span className="truncate text-sm font-medium text-foreground">{scope.projectName}</span>
            </DropdownMenuLabel>
            {jobActions.map((a) => (
              <ActionItem key={a.key} action={a} projectName={scope.projectName} />
            ))}
          </DropdownMenuGroup>
        )}
        {jobActions.length > 0 && globalActions.length > 0 && <DropdownMenuSeparator />}
        {globalActions.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2.5 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Create
            </DropdownMenuLabel>
            {globalActions.map((a) => (
              <ActionItem key={a.key} action={a} />
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
