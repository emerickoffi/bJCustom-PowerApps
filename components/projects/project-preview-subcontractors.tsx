'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Building2, Search, UserRound } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  SUBCONTRACTOR_SEARCH_MIN,
  filterSubcontractors,
  subcontractorDetails,
  type PreviewSubcontractor,
} from '@/lib/project-preview'
import { cn } from '@/lib/utils'

export const PREVIEW_LINK_CLASS =
  'inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11'

/** The top of a view that temporarily replaces the project summary. Its Back control takes focus when the view opens. */
export function PanelViewHeader({
  title,
  description,
  onBack,
  className,
}: {
  title: string
  description?: React.ReactNode
  onBack: () => void
  className?: string
}) {
  return (
    <div className={cn('flex shrink-0 flex-col gap-1 border-b border-[#D6DDE5]/70 px-4 pt-1.5 pb-3', className)}>
      <button
        type="button"
        data-view-focus
        onClick={onBack}
        className="-ml-1.5 inline-flex min-h-9 items-center gap-1.5 self-start rounded-md px-1.5 text-sm font-medium text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <ArrowLeft className="size-3.5" aria-hidden="true" />
        Back to project summary
      </button>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description}
    </div>
  )
}

export function SubcontractorEntry({ entry }: { entry: PreviewSubcontractor }) {
  const company = entry.kind === 'company'
  const Icon = company ? Building2 : UserRound
  const details = subcontractorDetails(entry)
  return (
    <li className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          {entry.href ? (
            <Link
              href={entry.href}
              className="break-words rounded-sm text-sm font-medium text-link outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:py-1.5"
            >
              {entry.name}
            </Link>
          ) : (
            <span className="break-words text-sm font-medium text-foreground">{entry.name}</span>
          )}
          {company ? <Badge variant="outline">Company</Badge> : <span className="sr-only">(individual)</span>}
        </span>
        {details.length > 0 && <span className="break-words text-xs text-muted-foreground">{details.join(' · ')}</span>}
      </span>
    </li>
  )
}

/** Every active assignment on the selected project, shown in place of the summary. */
export function SubcontractorListView({
  items,
  peopleHref,
  onBack,
}: {
  items: PreviewSubcontractor[]
  peopleHref: string
  onBack: () => void
}) {
  const searchId = useId()
  const [query, setQuery] = useState('')
  const shown = filterSubcontractors(items, query)
  const searchable = items.length >= SUBCONTRACTOR_SEARCH_MIN

  return (
    <div className="flex flex-col">
      <PanelViewHeader title={`Subcontractors on this project (${items.length})`} onBack={onBack} />
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {searchable && (
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Search assigned subcontractors
            </label>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, company, or trade"
              className="h-10 pl-8"
            />
            <p className="sr-only" aria-live="polite">
              {query.trim() ? `${shown.length} of ${items.length} shown` : ''}
            </p>
          </div>
        )}
        {shown.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {shown.map((entry) => (
              <SubcontractorEntry key={entry.key} entry={entry} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No assigned subcontractors match this search.</p>
        )}
        {items.some((entry) => entry.kind === 'company') && (
          <p className="text-xs leading-relaxed text-muted-foreground">
            A company assignment covers the company itself. Its people are listed only when they are assigned individually.
          </p>
        )}
        <Link href={peopleHref} className={PREVIEW_LINK_CLASS}>
          Open the project&apos;s People page
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
