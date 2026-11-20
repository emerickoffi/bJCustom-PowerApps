'use client'

import { useState, useTransition } from 'react'
import { ArrowLeftRight, Building2, Check, ChevronsUpDown, Loader2 } from 'lucide-react'
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

/**
 * Header, before the breadcrumbs: which company you are working in ("TREFORT | Dashboard > Projects").
 * Opens "Switch company" when the person belongs to more than one.
 */
export function CompanyCrumb({ workspaces, currentId }: { workspaces: WorkspaceOption[]; currentId: string | null }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const current = workspaces.find((w) => w.organizationId === currentId) ?? workspaces[0]
  if (!current) return null
  const switchable = workspaces.length > 1
  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <Building2 className="size-[18px] shrink-0 text-[#006773]" aria-hidden="true" />
      <span className="max-w-56 truncate text-base font-bold tracking-wide text-foreground">{current.organizationName}</span>
    </span>
  )
  const divider = <span className="mx-3 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

  if (!switchable) {
    return (
      <span className="flex min-w-0 shrink-0 items-center">
        {label}
        {divider}
      </span>
    )
  }

  return (
    <span className="flex min-w-0 shrink-0 items-center">
      <DropdownMenu>
        <DropdownMenuTrigger
          className="-mx-2 flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-sage/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          disabled={pending}
          aria-label={`Switch company. Current: ${current.organizationName}`}
        >
          {label}
          {pending ? <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" /> : <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
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
      {divider}
    </span>
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
