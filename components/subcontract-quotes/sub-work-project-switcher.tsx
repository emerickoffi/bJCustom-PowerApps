'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown } from 'lucide-react'

export function SubWorkProjectSwitcher({
  projects,
  currentId,
  tab,
}: {
  projects: { id: string; name: string }[]
  currentId: string
  tab: 'quotes' | 'work'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (projects.length < 2) return null

  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 md:w-64">
      <label htmlFor="sub-work-project" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Project
      </label>
      <div className="relative min-w-0">
        <select
          id="sub-work-project"
          value={currentId}
          disabled={pending}
          aria-busy={pending}
          onChange={(e) => {
            const next = e.target.value
            if (!next || next === currentId) return
            const base = `/projects/${encodeURIComponent(next)}/subcontractor-work`
            startTransition(() => router.push(tab === 'quotes' ? `${base}/quotes` : base))
          }}
          className="h-10 w-full min-w-0 appearance-none truncate rounded-lg border border-input bg-card pl-3 pr-9 text-sm font-medium text-foreground shadow-xs hover:border-ring/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  )
}
