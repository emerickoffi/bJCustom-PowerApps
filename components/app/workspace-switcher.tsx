'use client'

import { useState, useTransition } from 'react'
import { ArrowLeftRight, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { switchWorkspace } from '@/app/actions/workspace'
import { cn } from '@/lib/utils'

export type WorkspaceOption = {
  organizationId: string
  organizationName: string
  roleLabel: string
  kind: 'staff' | 'homeowner'
}

const KIND_LABEL = { staff: 'Staff workspace', homeowner: 'Homeowner portal' } as const

function initialsOf(name: string) {
  const words = name.replace(/\b(llc|inc|co|corp|ltd)\.?$/i, '').trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '·'
}

function CompanyAvatar({ name, logoUrl, className }: { name: string; logoUrl?: string; className?: string }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- company logos live on any host the builder chose
    return <img src={logoUrl} alt="" className={cn('size-8 shrink-0 rounded-md bg-white object-contain p-0.5', className)} />
  }
  return (
    <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-md bg-[#E8F3F5] text-xs font-semibold text-[#00788d]', className)}>
      {initialsOf(name)}
    </span>
  )
}

/**
 * Sidebar: which company you are working in (top left, under the Trefort logo). Opens the workspace switcher when
 * the person belongs to more than one company.
 */
export function CompanyBlock({
  workspaces,
  currentId,
  logoUrl,
  collapsed = false,
}: {
  workspaces: WorkspaceOption[]
  currentId: string | null
  logoUrl?: string
  collapsed?: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const current = workspaces.find((w) => w.organizationId === currentId) ?? workspaces[0]
  if (!current) return null
  const switchable = workspaces.length > 1
  const body = (
    <>
      <CompanyAvatar name={current.organizationName} logoUrl={logoUrl} />
      {!collapsed && (
        <span className="flex min-w-0 flex-1 flex-col text-left leading-tight">
          <span className="truncate text-sm font-semibold text-sidebar-foreground">{current.organizationName}</span>
          <span className="truncate text-xs text-sidebar-muted">{current.roleLabel}</span>
        </span>
      )}
      {!collapsed && switchable && (pending ? <Loader2 className="size-4 shrink-0 animate-spin text-sidebar-muted" aria-hidden="true" /> : <ChevronsUpDown className="size-4 shrink-0 text-sidebar-muted" aria-hidden="true" />)}
    </>
  )
  const frame = cn('flex w-full min-w-0 items-center gap-3 rounded-nav', collapsed ? 'justify-center p-1.5' : 'px-3 py-2.5')

  if (!switchable) {
    return (
      <div className={frame} title={collapsed ? current.organizationName : undefined}>
        {body}
        {collapsed && <span className="sr-only">{current.organizationName}</span>}
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(frame, 'transition-colors hover:bg-sidebar-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring disabled:opacity-60')}
        disabled={pending}
        aria-label={`Switch company. Current: ${current.organizationName}`}
      >
        {body}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side={collapsed ? 'right' : 'bottom'} className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch company</DropdownMenuLabel>
          {workspaces.map((w) => {
            const active = w.organizationId === current.organizationId
            return (
              <DropdownMenuItem
                key={w.organizationId}
                disabled={active || pending}
                className="items-start gap-3 px-2.5 py-2"
                onClick={() => {
                  setError(null)
                  startTransition(async () => {
                    const result = await switchWorkspace(w.organizationId)
                    if (result?.error) setError(result.error)
                  })
                }}
              >
                <Check className={cn('mt-0.5 size-4 shrink-0 text-primary', !active && 'invisible')} aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{w.organizationName}</span>
                  <span className="truncate text-xs text-muted-foreground">{`${KIND_LABEL[w.kind]} · ${w.roleLabel}`}</span>
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
        {error && (
          <p role="alert" className="px-2.5 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: WorkspaceOption[]; currentId: string | null }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const current = workspaces.find((w) => w.organizationId === currentId) ?? workspaces[0]
  if (!current) return null
  // The company name lives in the sidebar; the header only offers switching when there is more than one workspace.
  if (workspaces.length < 2) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sage/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:min-h-9"
        disabled={pending}
        aria-label={`Switch workspace. Current: ${KIND_LABEL[current.kind]}, ${current.organizationName}`}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <ArrowLeftRight className="size-4" aria-hidden="true" />
        )}
        <span className="hidden max-w-48 truncate md:inline">{current.organizationName}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Switch workspace</DropdownMenuLabel>
          {workspaces.map((w) => {
            const active = w.organizationId === current.organizationId
            return (
              <DropdownMenuItem
                key={w.organizationId}
                disabled={active || pending}
                className="items-start gap-3 px-2.5 py-2"
                onClick={() => {
                  setError(null)
                  startTransition(async () => {
                    const result = await switchWorkspace(w.organizationId)
                    if (result?.error) setError(result.error)
                  })
                }}
              >
                <Check className={cn('mt-0.5 size-4 shrink-0 text-primary', !active && 'invisible')} aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{KIND_LABEL[w.kind]}</span>
                  <span className="truncate text-xs text-muted-foreground">{`${w.organizationName} · ${w.roleLabel}`}</span>
                </span>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>
        {error && (
          <p role="alert" className="px-2.5 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
