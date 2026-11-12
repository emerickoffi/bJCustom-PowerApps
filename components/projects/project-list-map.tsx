'use client'

import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import useSWR from 'swr'
import { ArrowUpRight, Loader2, MapPin, MapPinOff, Navigation, PanelRightOpen, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { ProjectPreviewContext } from '@/components/projects/project-preview-trigger'
import { segmentClass } from '@/lib/interaction-styles'
import { cn } from '@/lib/utils'
import type { ProjectStatus } from '@/lib/domain'
import { LOCATION_REASON_LABELS, directionsUrl, type ProjectLocation } from '@/lib/project-locations'
import { MARKER_TONE_CLASSES, MARKER_TONE_LABELS, markerTone, type MarkerTone } from '@/lib/project-map-tones'
import type { MapPin as Pin } from '@/components/projects/project-map'

const ProjectMap = dynamic(() => import('@/components/projects/project-map'), {
  ssr: false,
  loading: () => <MapMessage icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />} text="Loading map…" />,
})

export type ListMapRow = {
  id: string
  name: string
  project_number: string
  status: ProjectStatus
  locationLabel: string
  address: string | null
  nextAction: string | null
  behindSchedule: boolean
}

type LocationsResponse = { locations: ProjectLocation[] }

async function fetchLocations([, ids]: [string, string[]]): Promise<LocationsResponse> {
  const res = await fetch('/api/projects/locations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error('Project locations could not be loaded.')
  return res.json()
}

function MapMessage({ icon, text, action }: { icon: React.ReactNode; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-2 bg-muted/40 p-6 text-center text-sm text-muted-foreground">
      {icon}
      <p className="max-w-xs text-pretty">{text}</p>
      {action}
    </div>
  )
}

const ListRow = memo(function ListRow({
  row,
  tone,
  location,
  selected,
  canEdit,
  onSelect,
  rowRef,
}: {
  row: ListMapRow
  tone: MarkerTone
  location: ProjectLocation | undefined
  selected: boolean
  canEdit: boolean
  onSelect: (id: string) => void
  rowRef: (id: string, el: HTMLLIElement | null) => void
}) {
  const unavailable = location?.state === 'unavailable' && location.reason !== 'pending'
  return (
    <li
      ref={(el) => rowRef(row.id, el)}
      className={cn(
        'group relative border-b last:border-b-0 transition-colors',
        selected ? 'bg-primary/8' : 'hover:bg-muted/50',
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden="true" />}
      <button
        type="button"
        onClick={() => onSelect(row.id)}
        aria-pressed={selected}
        className="flex w-full min-w-0 flex-col gap-1 px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn('size-2 shrink-0 rounded-full', MARKER_TONE_CLASSES[tone])} aria-hidden="true" />
          <span className="truncate text-sm font-semibold text-foreground">{row.name}</span>
          <span className="ml-auto shrink-0">
            <ProjectStatusBadge status={row.status} />
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-1.5 pl-4 text-xs text-muted-foreground">
          <span className="font-mono">{row.project_number}</span>
          {row.locationLabel && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{row.locationLabel}</span>
            </>
          )}
        </span>
        {(row.nextAction || unavailable) && (
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 pl-4 text-xs">
            {row.nextAction && <span className="truncate text-foreground/80">{row.nextAction}</span>}
            {unavailable && (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <MapPinOff className="size-3" aria-hidden="true" />
                Location unavailable
                <span className="sr-only">: {LOCATION_REASON_LABELS[location.reason]}</span>
              </span>
            )}
          </span>
        )}
      </button>
      {unavailable && canEdit && (
        <Link
          href={`/projects/${row.id}/edit`}
          className="mb-2 ml-7 inline-flex text-xs font-medium text-primary underline-offset-2 hover:underline"
        >
          Edit site address
        </Link>
      )}
    </li>
  )
})

function SelectedPreview({
  row,
  location,
  onClose,
  onDetails,
}: {
  row: ListMapRow
  location: ProjectLocation | undefined
  onClose: () => void
  onDetails: () => void
}) {
  const address = location?.address ?? row.address
  const directions =
    location?.state === 'ok'
      ? directionsUrl({ lat: location.lat, lng: location.lng })
      : address
        ? directionsUrl({ address })
        : null
  return (
    <section
      aria-label={`${row.name} summary`}
      className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 shadow-lg"
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className="truncate text-sm font-semibold text-foreground">{row.name}</h3>
          <p className="font-mono text-xs text-muted-foreground">{row.project_number}</p>
        </div>
        <ProjectStatusBadge status={row.status} />
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Clear selection">
          <X />
        </Button>
      </div>
      <dl className="flex flex-col gap-1.5 text-xs">
        <div className="flex gap-2">
          <dt className="sr-only">Site address</dt>
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dd className="text-foreground">{address ?? 'No site address'}</dd>
        </div>
        {row.nextAction && (
          <div className="flex gap-2">
            <dt className="shrink-0 text-muted-foreground">Next</dt>
            <dd className="min-w-0 truncate text-foreground">{row.nextAction}</dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" render={<Link href={`/projects/${row.id}`} />} nativeButton={false}>
          <ArrowUpRight data-icon="inline-start" />
          Open project
        </Button>
        <Button size="sm" variant="outline" onClick={onDetails}>
          <PanelRightOpen data-icon="inline-start" />
          View details
        </Button>
        {directions && (
          <Button
            size="sm"
            variant="ghost"
            render={<a href={directions} target="_blank" rel="noopener noreferrer" />}
            nativeButton={false}
          >
            <Navigation data-icon="inline-start" />
            Directions
            <span className="sr-only">(opens in a new tab)</span>
          </Button>
        )}
      </div>
    </section>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 rounded-lg bg-card/95 px-2.5 py-1.5 text-[0.68rem] text-muted-foreground shadow-sm ring-1 ring-border">
      {(Object.keys(MARKER_TONE_LABELS) as MarkerTone[]).map((tone) => (
        <li key={tone} className="flex items-center gap-1">
          <span className={cn('size-2 rounded-full', MARKER_TONE_CLASSES[tone])} aria-hidden="true" />
          {MARKER_TONE_LABELS[tone]}
        </li>
      ))}
    </ul>
  )
}

/**
 * List + Map: the same filtered, sorted page of projects as Cards and Table, with one shared selection between the
 * list and the map. Pins come from stored, server-geocoded site addresses; a project without one stays in the list.
 */
export function ProjectListMap({ rows, canEdit }: { rows: ListMapRow[]; canEdit: boolean }) {
  const preview = useContext(ProjectPreviewContext)
  const setOverlay = preview?.setOverlay
  useEffect(() => {
    setOverlay?.(true)
    return () => setOverlay?.(false)
  }, [setOverlay])

  const ids = useMemo(() => rows.map((r) => r.id), [rows])
  const { data, error, isLoading, mutate } = useSWR(ids.length ? ['project-locations', ids] : null, fetchLocations, {
    revalidateOnFocus: false,
    keepPreviousData: true,
    // Lookups are capped per request; while some are still owed, ask again shortly until all have resolved.
    refreshInterval: (latest) =>
      latest?.locations.some((l) => l.state === 'unavailable' && l.reason === 'pending') ? 2000 : 0,
  })
  const locations = useMemo(() => new Map((data?.locations ?? []).map((l) => [l.projectId, l])), [data])

  const [chosenId, setChosenId] = useState<string | null>(null)
  const selected = rows.find((r) => r.id === chosenId) ?? null
  const selectedId = selected?.id ?? null
  const [pane, setPane] = useState<'list' | 'map'>('list')

  const tones = useMemo(() => new Map(rows.map((r) => [r.id, markerTone(r.status, r.behindSchedule)])), [rows])
  const pins = useMemo<Pin[]>(
    () =>
      rows.flatMap((r) => {
        const l = locations.get(r.id)
        return l?.state === 'ok' ? [{ id: r.id, lat: l.lat, lng: l.lng, tone: tones.get(r.id)!, title: r.name }] : []
      }),
    [rows, locations, tones],
  )

  const rowEls = useRef(new Map<string, HTMLLIElement>())
  const rowRef = useCallback((id: string, el: HTMLLIElement | null) => {
    if (el) rowEls.current.set(id, el)
    else rowEls.current.delete(id)
  }, [])

  const selectFromList = useCallback((id: string) => setChosenId(id), [])
  const selectFromMap = useCallback((id: string) => {
    setChosenId(id)
    requestAnimationFrame(() => rowEls.current.get(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }))
  }, [])

  const pinned = pins.length
  const unplaced = rows.filter((r) => {
    const l = locations.get(r.id)
    return l?.state === 'unavailable' && l.reason !== 'pending'
  }).length
  const locating = rows.some((r) => {
    const l = locations.get(r.id)
    return !l || (l.state === 'unavailable' && l.reason === 'pending')
  })

  const mapBody = error ? (
    <MapMessage
      icon={<MapPinOff className="size-5" aria-hidden="true" />}
      text="The map could not load project locations. The list is still available."
      action={
        <Button size="sm" variant="outline" onClick={() => mutate()}>
          Try again
        </Button>
      }
    />
  ) : !data && isLoading ? (
    <MapMessage icon={<Loader2 className="size-5 animate-spin" aria-hidden="true" />} text="Locating projects…" />
  ) : !pinned ? (
    <MapMessage
      icon={<MapPinOff className="size-5" aria-hidden="true" />}
      text={
        locating
          ? 'Locating projects…'
          : 'None of these projects has a mappable site address yet. Add a street address with city and state or ZIP.'
      }
    />
  ) : (
    <ProjectMap pins={pins} selectedId={selectedId} onSelect={selectFromMap} />
  )

  return (
    <div className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="List or map"
        className="inline-flex self-start rounded-lg border border-[#D6DDE5] bg-card p-0.5 xl:hidden"
      >
        {(['list', 'map'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={pane === value}
            onClick={() => setPane(value)}
            className={segmentClass(pane === value)}
          >
            {value === 'list' ? 'List' : 'Map'}
          </button>
        ))}
      </div>
      <div className="grid h-[calc(100dvh-15rem)] min-h-[520px] overflow-hidden rounded-xl border bg-card xl:grid-cols-[minmax(340px,2fr)_3fr]">
        <div className={cn('min-h-0 flex-col xl:flex xl:border-r', pane === 'list' ? 'flex' : 'hidden')}>
          <p className="border-b px-3 py-2 text-xs text-muted-foreground" aria-live="polite">
            {pinned} of {rows.length} on the map
            {unplaced > 0 && ` · ${unplaced} location unavailable`}
          </p>
          <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="Projects">
            {rows.map((row) => (
              <ListRow
                key={row.id}
                row={row}
                tone={tones.get(row.id)!}
                location={locations.get(row.id)}
                selected={row.id === selectedId}
                canEdit={canEdit}
                onSelect={selectFromList}
                rowRef={rowRef}
              />
            ))}
          </ul>
          {selected && (
            <div className="border-t p-3 xl:hidden">
              <SelectedPreview
                row={selected}
                location={locations.get(selected.id)}
                onClose={() => setChosenId(null)}
                onDetails={() => preview?.select(selected.id)}
              />
            </div>
          )}
        </div>
        <div className={cn('relative min-h-0 xl:block', pane === 'map' ? 'block' : 'hidden')}>
          {mapBody}
          {pinned > 0 && !error && (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex justify-end">
              <div className="pointer-events-auto">
                <Legend />
              </div>
            </div>
          )}
          {selected && (
            <div
              className={cn(
                'absolute inset-x-3 bottom-3 z-[1000] max-w-md',
                pane === 'list' ? 'hidden xl:block' : 'block',
              )}
            >
              <SelectedPreview
                row={selected}
                location={locations.get(selected.id)}
                onClose={() => setChosenId(null)}
                onDetails={() => preview?.select(selected.id)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
