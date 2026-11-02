'use client'

import { createContext, useContext, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

type SelectionContext = { pending: boolean; select: (projectId: string) => void }

const Ctx = createContext<SelectionContext | null>(null)

/**
 * Shares one navigation transition between the project selector and the schedule body, so switching
 * projects hides the previous project's data immediately instead of leaving it on screen while loading.
 * Router navigations supersede each other, so a slow earlier response can never replace a newer selection.
 */
export function ScheduleSelectionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const select = (projectId: string) =>
    startTransition(() => router.push(`/schedule?project=${encodeURIComponent(projectId)}`))
  return <Ctx.Provider value={{ pending, select }}>{children}</Ctx.Provider>
}

export function useScheduleSelection() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useScheduleSelection must be used inside ScheduleSelectionProvider')
  return ctx
}

export function ScheduleBody({ children }: { children: React.ReactNode }) {
  const { pending } = useScheduleSelection()
  if (!pending) return <>{children}</>
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-64 items-center justify-center gap-2 rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      Loading schedule…
    </div>
  )
}
