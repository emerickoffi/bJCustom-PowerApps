'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  CalendarPlus,
  ClipboardPen,
  FilePlus2,
  FolderPlus,
  HardHat,
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
}

type QuickActionsContextValue = {
  scope: ProjectScope | null
  setScope: (scope: ProjectScope | null) => void
}

const QuickActionsContext = createContext<QuickActionsContextValue | null>(null)

export function QuickActionsProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScope] = useState<ProjectScope | null>(null)
  return <QuickActionsContext.Provider value={{ scope, setScope }}>{children}</QuickActionsContext.Provider>
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

function ActionItem({ action }: { action: QuickAction }) {
  const Icon = ICONS[action.icon]
  return (
    <DropdownMenuItem render={<Link href={action.href} />} className="min-h-11 gap-3 px-2.5 py-2 sm:min-h-0">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sage text-primary" aria-hidden="true">
        <Icon className="size-4" />
      </span>
      <span className="text-sm font-medium text-foreground">{action.label}</span>
    </DropdownMenuItem>
  )
}

/** Header "New" menu: actions for the current job first, then records that stand on their own. */
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
  if (jobActions.length === 0 && globalActions.length === 0) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Create new"
        className={cn(
          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-2.5 text-sm font-medium text-primary-foreground transition-colors sm:px-3',
          'hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
        )}
      >
        <Plus className="size-4" aria-hidden="true" />
        <span className="hidden sm:inline">New</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 max-w-[calc(100vw-1.5rem)] p-1.5">
        {jobActions.length > 0 && scope && (
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2.5 py-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">For this job</span>
              <span className="truncate text-sm font-medium text-foreground">{scope.projectName}</span>
            </DropdownMenuLabel>
            {jobActions.map((a) => (
              <ActionItem key={a.key} action={a} />
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
