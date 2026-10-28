'use client'

import { useState, useTransition } from 'react'
import { ArrowLeftRight, Check, Loader2 } from 'lucide-react'
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

export function WorkspaceSwitcher({ workspaces, currentId }: { workspaces: WorkspaceOption[]; currentId: string | null }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  if (workspaces.length < 2) return null
  const current = workspaces.find((w) => w.organizationId === currentId) ?? workspaces[0]

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
        <span className="hidden md:inline">{KIND_LABEL[current.kind]}</span>
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
