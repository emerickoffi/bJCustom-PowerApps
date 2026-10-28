'use client'

import { useEffect, useState } from 'react'
import useSWR from 'swr'
import { ChevronLeft, ChevronRight, FileSpreadsheet, Loader2, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DetailedHistoryItem } from '@/components/schedule/activity-history-item'
import {
  EMPTY_FILTERS,
  HISTORY_CATEGORIES,
  HISTORY_CATEGORY_KEYS,
  SYSTEM_ACTOR,
  filtersToParams,
  hasActiveFilters,
  type HistoryCategory,
  type HistoryFilters,
  type PresentedEvent,
} from '@/lib/activity-history'

type HistoryPage = { events: PresentedEvent[]; total: number; page: number; pageSize: number; pageCount: number }

const ALL = 'all'

async function fetchJson(url: string): Promise<HistoryPage> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? 'Activity history could not be loaded.')
  return body as HistoryPage
}

function filenameFrom(res: Response) {
  const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')
  return match?.[1] ?? 'Activity-History.xlsx'
}

export function ActivityHistoryDrawer({
  project,
  actorOptions,
  canExport,
}: {
  project: { id: string; name: string; project_number: string | null }
  actorOptions: { value: string; label: string }[]
  canExport: boolean
}) {
  const [open, setOpen] = useState(false)
  const [filters, setFilters] = useState<HistoryFilters>(EMPTY_FILTERS)
  const [searchDraft, setSearchDraft] = useState('')
  const [page, setPage] = useState(1)
  const [scope, setScope] = useState<'all' | 'filtered'>('filtered')
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const handle = setTimeout(() => {
      const q = searchDraft.trim()
      setFilters((f) => (f.q === q ? f : { ...f, q }))
      setPage(1)
    }, 300)
    return () => clearTimeout(handle)
  }, [searchDraft])

  const dateError = filters.from && filters.to && filters.from > filters.to ? 'Start date must be on or before the end date.' : null
  const params = filtersToParams(filters)
  params.set('page', String(page))
  const key = open && !dateError ? `/api/projects/${project.id}/activity-history?${params}` : null
  const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetchJson, { keepPreviousData: true, revalidateOnFocus: false })

  const filtered = hasActiveFilters(filters)
  const exportScope = filtered ? scope : 'all'

  function update(patch: Partial<HistoryFilters>) {
    setFilters((f) => ({ ...f, ...patch }))
    setPage(1)
  }

  function clearFilters() {
    setSearchDraft('')
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  async function exportHistory() {
    setExporting(true)
    try {
      const exportParams = exportScope === 'filtered' ? filtersToParams(filters) : new URLSearchParams()
      exportParams.set('scope', exportScope)
      const res = await fetch(`/api/projects/${project.id}/activity-history/export?${exportParams}`, { cache: 'no-store' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'The export could not be generated.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filenameFrom(res)
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      const count = Number(res.headers.get('X-Export-Count') ?? 0)
      toast.success(`Exported ${count.toLocaleString('en-US')} ${count === 1 ? 'event' : 'events'} to Excel`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The export could not be generated.')
    } finally {
      setExporting(false)
    }
  }

  const total = data?.total
  const pageCount = data?.pageCount ?? 1

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger render={<Button variant="outline" size="sm" className="h-9 border-[#E2E8E2] text-[#174D32]" />}>
        View Full History
      </SheetTrigger>
      <SheetContent className="w-full gap-0 bg-[#F8F7F3] p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <SheetHeader className="gap-1 border-b border-[#E2E8E2] bg-white p-4 pr-12">
          <SheetTitle className="font-serif text-xl font-semibold text-[#103B27]">Activity History</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-x-2 text-sm">
            <span className="font-medium text-[#103B27]">{project.name}</span>
            {project.project_number && <span className="font-mono text-xs">{project.project_number}</span>}
            <span aria-live="polite">
              {total === undefined ? '' : `· ${total.toLocaleString('en-US')} ${filtered ? 'matching' : ''} ${total === 1 ? 'event' : 'events'}`}
            </span>
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div role="search" className="flex flex-col gap-3 border-b border-[#E2E8E2] bg-white p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Label htmlFor="history-search" className="sr-only">
                Search by activity name
              </Label>
              <Input
                id="history-search"
                type="search"
                value={searchDraft}
                maxLength={100}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Search by activity name"
                className="h-10 pl-9"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="history-type" className="text-xs text-[#103B27]/70">
                  Event type
                </Label>
                <Select value={filters.type ?? ALL} onValueChange={(v) => update({ type: !v || v === ALL ? null : (v as HistoryCategory) })}>
                  <SelectTrigger id="history-type" className="h-10 w-full">
                    <SelectValue>{(v: string) => (v === ALL ? 'All event types' : HISTORY_CATEGORIES[v as HistoryCategory]?.label)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All event types</SelectItem>
                    {HISTORY_CATEGORY_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {HISTORY_CATEGORIES[k].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="history-actor" className="text-xs text-[#103B27]/70">
                  Changed by
                </Label>
                <Select value={filters.actor ?? ALL} onValueChange={(v) => update({ actor: !v || v === ALL ? null : v })}>
                  <SelectTrigger id="history-actor" className="h-10 w-full">
                    <SelectValue>
                      {(v: string) =>
                        v === ALL ? 'Anyone' : v === SYSTEM_ACTOR ? 'System' : (actorOptions.find((a) => a.value === v)?.label ?? 'Team member')
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Anyone</SelectItem>
                    {actorOptions.map((a) => (
                      <SelectItem key={a.value} value={a.value}>
                        {a.label}
                      </SelectItem>
                    ))}
                    <SelectItem value={SYSTEM_ACTOR}>System</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="history-from" className="text-xs text-[#103B27]/70">
                  From
                </Label>
                <Input
                  id="history-from"
                  type="date"
                  value={filters.from ?? ''}
                  max={filters.to ?? undefined}
                  onChange={(e) => update({ from: e.target.value || null })}
                  className="h-10"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="history-to" className="text-xs text-[#103B27]/70">
                  To
                </Label>
                <Input
                  id="history-to"
                  type="date"
                  value={filters.to ?? ''}
                  min={filters.from ?? undefined}
                  onChange={(e) => update({ to: e.target.value || null })}
                  className="h-10"
                />
              </div>
            </div>
            {dateError && (
              <p role="alert" className="text-sm text-[#BD302B]">
                {dateError}
              </p>
            )}
            {(filtered || searchDraft) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 self-start text-[#174D32]">
                <X aria-hidden="true" />
                Clear filters
              </Button>
            )}
          </div>

          {canExport && (
            <div className="flex flex-col gap-3 border-b border-[#E2E8E2] bg-[#EAF0E9] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-2">
                {filtered ? (
                  <fieldset className="flex flex-col gap-1.5">
                    <legend className="mb-1.5 text-xs font-medium text-[#103B27]/70">Export scope</legend>
                    <div role="radiogroup" className="inline-flex w-full rounded-lg border border-[#E2E8E2] bg-white p-0.5 sm:w-auto">
                      {(['filtered', 'all'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          role="radio"
                          aria-checked={scope === s}
                          onClick={() => setScope(s)}
                          className={cn(
                            'min-h-9 flex-1 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none',
                            scope === s ? 'bg-[#174D32] text-white' : 'text-[#103B27]/70 hover:text-[#103B27]',
                          )}
                        >
                          {s === 'filtered' ? 'Current filters' : 'All history'}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                ) : (
                  <p className="text-sm text-[#103B27]">
                    <span className="font-medium">Export scope:</span> All history for this project
                  </p>
                )}
                <p className="text-xs text-[#103B27]/70">
                  {exportScope === 'filtered'
                    ? `Includes every event matching the filters${total !== undefined ? ` (${total.toLocaleString('en-US')})` : ''}, not just this page.`
                    : 'Includes every recorded event for this project.'}
                </p>
              </div>
              <Button onClick={exportHistory} disabled={exporting || Boolean(dateError)} className="h-10 shrink-0 bg-[#174D32] text-white hover:bg-[#103B27]">
                {exporting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FileSpreadsheet aria-hidden="true" />}
                {exporting ? 'Preparing workbook…' : 'Export to Excel'}
              </Button>
            </div>
          )}

          <div className="flex flex-1 flex-col gap-3 p-4" aria-busy={isLoading || isValidating}>
            {error ? (
              <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-[#E2E8E2] bg-white p-5">
                <p className="text-sm text-[#103B27]">{error.message}</p>
                <Button variant="outline" size="sm" onClick={() => mutate()} className="h-9">
                  Try again
                </Button>
              </div>
            ) : !data ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Loading history…
              </div>
            ) : data.events.length === 0 ? (
              <div className="flex flex-col items-start gap-1 rounded-xl border border-dashed border-[#E2E8E2] bg-white p-6">
                <p className="text-sm font-medium text-[#103B27]">{filtered ? 'No events match these filters' : 'No activity recorded yet'}</p>
                <p className="text-sm text-muted-foreground">
                  {filtered ? 'Try a different search or a wider date range.' : 'Schedule changes will appear here as they happen.'}
                </p>
              </div>
            ) : (
              <ol className={cn('flex flex-col gap-2 transition-opacity', isValidating && 'opacity-60')}>
                {data.events.map((e) => (
                  <DetailedHistoryItem key={e.id} event={e} />
                ))}
              </ol>
            )}
          </div>
        </div>

        {data && data.total > 0 && (
          <nav aria-label="History pages" className="flex items-center justify-between gap-2 border-t border-[#E2E8E2] bg-white p-3">
            <Button variant="outline" size="sm" className="h-10 px-3" disabled={page <= 1 || isValidating} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              <ChevronLeft aria-hidden="true" />
              Previous
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {`Page ${Math.min(page, pageCount)} of ${pageCount}`}
            </span>
            <Button variant="outline" size="sm" className="h-10 px-3" disabled={page >= pageCount || isValidating} onClick={() => setPage((p) => p + 1)}>
              Next
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        )}
      </SheetContent>
    </Sheet>
  )
}
