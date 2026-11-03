'use client'

import { ChevronDown } from 'lucide-react'
import { useScheduleSelection } from '@/components/schedule/schedule-selection'

export function ProjectFilter({
  projects,
  value,
}: {
  projects: { id: string; name: string; meta?: string }[]
  /** Selected project id, "all" for the overview, or "" when nothing is selected. */
  value: string
}) {
  const { pending, select } = useScheduleSelection()

  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-auto">
      <label htmlFor="schedule-project" className="text-xs font-medium uppercase tracking-wide text-[#526173]">
        Project
      </label>
      <div className="relative">
        <select
          id="schedule-project"
          value={value}
          disabled={pending}
          aria-busy={pending}
          onChange={(e) => {
            if (e.target.value) select(e.target.value)
          }}
          className="h-11 w-full min-w-0 appearance-none rounded-lg border border-[#D6DDE5] bg-white pl-3 pr-9 text-sm font-medium text-[#17212B] shadow-xs hover:border-[#B9C3CF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#174D38] disabled:opacity-60 sm:w-72"
        >
          {value === '' && (
            <option value="" disabled>
              Select a project
            </option>
          )}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.meta ? `${p.name} — ${p.meta}` : p.name}
            </option>
          ))}
          <option value="all">All projects (overview)</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  )
}
