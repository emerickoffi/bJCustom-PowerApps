'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { ChevronDown } from 'lucide-react'
import { ALL_PROJECTS, scheduleHref } from '@/lib/schedule-selection'
import { cn } from '@/lib/utils'

export function ProjectFilter({
  projects,
  value,
  emphasize = false,
}: {
  projects: { id: string; name: string; meta?: string }[]
  /** Selected project id, `all`, or an empty string when nothing is selected. */
  value: string
  emphasize?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <label htmlFor="schedule-project" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Project
      </label>
      <div className="relative">
        <select
          id="schedule-project"
          value={value}
          disabled={pending}
          aria-busy={pending}
          onChange={(e) => {
            const next = e.target.value
            if (!next) return
            startTransition(() => router.push(scheduleHref(next)))
          }}
          className={cn(
            'h-11 w-full min-w-64 appearance-none rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 sm:w-72',
            emphasize && 'border-primary ring-2 ring-primary/20',
            !value && 'text-muted-foreground',
          )}
        >
          {!value && (
            <option value="" disabled>
              Select a project…
            </option>
          )}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.meta ? `${p.name} — ${p.meta}` : p.name}
            </option>
          ))}
          <option value={ALL_PROJECTS}>All projects (overview)</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  )
}
