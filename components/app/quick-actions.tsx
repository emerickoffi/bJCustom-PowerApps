'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import Link from 'next/link'
import { CalendarPlus, FilePlus2, FolderPlus, Plus, Upload, UserPlus, type LucideIcon } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

export type QuickActionIcon = 'schedule' | 'estimate' | 'document' | 'project' | 'client'

export type QuickAction = { key: string; label: string; href: string; icon: QuickActionIcon }

type ProjectScope = { projectName: string; actions: QuickAction[] }

const ICONS: Record<QuickActionIcon, LucideIcon> = {
  schedule: CalendarPlus,
  estimate: FilePlus2,
  document: Upload,
  project: FolderPlus,
  client: UserPlus,
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
 * enabled features, and project state. Replaces the global actions while mounted.
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

/**
 * One floating control. When the AI Assistant launcher is shown it sits directly above it,
 * centred on the same column, so the two never overlap.
 */
export function QuickActionsButton({ globalActions, aboveAssistant }: { globalActions: QuickAction[]; aboveAssistant: boolean }) {
  const scope = useContext(QuickActionsContext)?.scope ?? null
  const actions = scope ? scope.actions : globalActions
  if (actions.length === 0) return null

  return (
    <div
      data-floating-control
      className={cn(
        'group fixed right-[calc(max(1.25rem,env(safe-area-inset-right))+0.25rem)] z-40 print:hidden',
        aboveAssistant
          ? 'bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4.25rem)]'
          : 'bottom-[max(1.25rem,env(safe-area-inset-bottom))]',
      )}
    >
      <span
        role="presentation"
        className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-brand-deep px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100 group-has-[[aria-expanded=true]]:opacity-0"
      >
        Quick actions
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Quick actions"
          className={cn(
            'flex size-12 items-center justify-center rounded-2xl bg-card text-primary shadow-md ring-1 ring-champagne/50 transition-all',
            'hover:-translate-y-0.5 hover:bg-champagne-soft hover:shadow-lg',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
            'aria-expanded:bg-primary aria-expanded:text-primary-foreground aria-expanded:ring-primary',
          )}
        >
          <Plus className="size-5 transition-transform group-has-[[aria-expanded=true]]:rotate-45" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-64 max-w-[calc(100vw-2.5rem)] p-1.5">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col gap-0.5 px-2.5 py-2">
              <span className="text-sm font-semibold text-foreground">Quick actions</span>
              {scope && <span className="truncate text-xs font-normal text-muted-foreground">{scope.projectName}</span>}
            </DropdownMenuLabel>
            {actions.map((action) => {
              const Icon = ICONS[action.icon]
              return (
                <DropdownMenuItem key={action.key} render={<Link href={action.href} />} className="min-h-11 gap-3 px-2.5 py-2 sm:min-h-0">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sage text-primary" aria-hidden="true">
                    <Icon className="size-4" />
                  </span>
                  <span className="text-sm font-medium text-foreground">{action.label}</span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
