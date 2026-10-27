'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'

export function ProjectFilter({ projects }: { projects: { id: string; name: string }[] }) {
  const router = useRouter()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const current = params.get('project') ?? ''

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="schedule-project" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Project
      </label>
      <select
        id="schedule-project"
        value={current}
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value
          startTransition(() => router.push(value ? `/schedule?project=${value}` : '/schedule'))
        }}
        className="h-10 min-w-56 rounded-md border border-input bg-card px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
      >
        <option value="">All projects</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}
