import Link from 'next/link'
import { LayoutGrid, List } from 'lucide-react'
import type { FeatureMap } from '@/lib/feature-registry'
import { PHOTO_SOURCE_LABELS, photoFilterQuery, type PhotoFilters, type PhotoSource } from '@/lib/project-photo-library'
import { Surface } from '@/components/shared/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const SELECT =
  'h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function PhotoFiltersForm({
  action,
  filters,
  uploaders,
  locations,
  features,
}: {
  action: string
  filters: PhotoFilters
  uploaders: { id: string; name: string }[]
  locations: string[]
  features: Pick<FeatureMap, 'project_photos' | 'daily_logs' | 'walkthroughs' | 'client_updates'>
}) {
  const sources: PhotoSource[] = [
    ...(features.project_photos ? (['direct'] as const) : []),
    ...(features.daily_logs ? (['daily_log'] as const) : []),
    ...(features.walkthroughs ? (['walkthrough', 'issue'] as const) : []),
    ...(features.client_updates ? (['client_update'] as const) : []),
  ]
  return (
    <Surface aria-label="Filter photos">
      <form method="get" action={action} className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-end">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="photo-q" className="text-sm font-medium text-foreground">
            Search
          </label>
          <Input id="photo-q" name="q" type="search" defaultValue={filters.q} placeholder="Caption, tag, area, or record" className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="photo-source" className="text-sm font-medium text-foreground">
            Source
          </label>
          <select id="photo-source" name="source" defaultValue={filters.source ?? ''} className={SELECT}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {PHOTO_SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="photo-from" className="text-sm font-medium text-foreground">
            From
          </label>
          <Input id="photo-from" name="from" type="date" defaultValue={filters.from ?? ''} className="h-10" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="photo-to" className="text-sm font-medium text-foreground">
            To
          </label>
          <Input id="photo-to" name="to" type="date" defaultValue={filters.to ?? ''} className="h-10" />
        </div>
        {uploaders.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="photo-uploader" className="text-sm font-medium text-foreground">
              Uploaded by
            </label>
            <select id="photo-uploader" name="uploader" defaultValue={filters.uploader ?? ''} className={SELECT}>
              <option value="">Anyone</option>
              {uploaders.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {locations.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="photo-location" className="text-sm font-medium text-foreground">
              Area
            </label>
            <select id="photo-location" name="location" defaultValue={filters.location ?? ''} className={SELECT}>
              <option value="">All areas</option>
              {locations.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="photo-sort" className="text-sm font-medium text-foreground">
            Sort
          </label>
          <select id="photo-sort" name="sort" defaultValue={filters.sort} className={SELECT}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>
        {filters.view === 'list' && <input type="hidden" name="view" value="list" />}
        <div className="flex items-center gap-2">
          <Button type="submit" className="h-10">
            Apply
          </Button>
          <div role="group" aria-label="Layout" className="flex rounded-md border border-input">
            <Link
              href={`${action}${photoFilterQuery({ ...filters, view: 'grid', page: 1 })}`}
              aria-label="Grid view"
              aria-current={filters.view === 'grid' ? 'true' : undefined}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-10 rounded-r-none', filters.view === 'grid' && 'bg-muted')}
            >
              <LayoutGrid aria-hidden="true" />
            </Link>
            <Link
              href={`${action}${photoFilterQuery({ ...filters, view: 'list', page: 1 })}`}
              aria-label="List view"
              aria-current={filters.view === 'list' ? 'true' : undefined}
              className={cn(buttonVariants({ variant: 'ghost', size: 'icon' }), 'size-10 rounded-l-none', filters.view === 'list' && 'bg-muted')}
            >
              <List aria-hidden="true" />
            </Link>
          </div>
        </div>
      </form>
    </Surface>
  )
}
