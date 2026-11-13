'use client'

import { useMemo, useState } from 'react'
import { Check, Link2, Plus, Search, Sparkles, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScheduleActivityOption } from '@/lib/daily-logs-data'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
  delayed: 'Delayed',
  on_hold: 'On hold',
  skipped: 'Skipped',
}

const STATUS_STYLES: Record<string, string> = {
  in_progress: 'bg-primary/10 text-primary',
  delayed: 'bg-destructive/10 text-destructive',
  on_hold: 'bg-muted text-muted-foreground',
  completed: 'bg-muted text-muted-foreground',
  skipped: 'bg-muted text-muted-foreground',
  not_started: 'bg-muted text-muted-foreground',
}

const ALL_PHASES = '__all__'

/** Why an activity is suggested for the log date, based only on its own dates and status. */
export function suggestionReason(a: ScheduleActivityOption, logDate: string): string | null {
  if (a.status === 'completed' || a.status === 'skipped') return null
  const inRange = (start?: string | null, end?: string | null) => Boolean(start) && start! <= logDate && (!end || logDate <= end)
  if (logDate && a.planned_start && a.planned_end && inRange(a.planned_start, a.planned_end)) return 'Scheduled this day'
  if (logDate && a.actual_start && !a.actual_end && a.actual_start <= logDate) return 'In progress'
  if (a.status === 'in_progress') return 'In progress'
  return null
}

function StatusPill({ status }: { status: string | null }) {
  if (!status || status === 'not_started') return null
  return (
    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium', STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground')}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

type PickerProps = {
  activities: ScheduleActivityOption[]
  selected: Set<string>
  onChange: (next: Set<string>) => void
  logDate: string
  limit: number
  error?: string
}

export function ScheduleActivityPicker({ activities, selected, onChange, logDate, limit, error }: PickerProps) {
  const [open, setOpen] = useState(false)
  const byId = useMemo(() => new Map(activities.map((a) => [a.id, a])), [activities])
  const selectedActivities = [...selected].map((id) => byId.get(id)).filter((a): a is ScheduleActivityOption => Boolean(a))

  const remove = (id: string) => {
    const next = new Set(selected)
    next.delete(id)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      {selectedActivities.map((a) => (
        <input key={a.id} type="hidden" name="activity_ids" value={a.id} />
      ))}

      {activities.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border bg-muted/40 p-4">
          <p className="text-sm font-medium text-foreground">No schedule activities yet</p>
          <p className="text-sm text-muted-foreground">Add activities on the project schedule to link them to daily logs.</p>
        </div>
      ) : (
        <>
          {selectedActivities.length > 0 ? (
            <ul className="flex flex-col gap-2" aria-label="Linked schedule activities">
              {selectedActivities.map((a) => (
                <li key={a.id} className="flex min-h-11 items-center gap-3 rounded-lg border border-border/70 bg-background py-1.5 pr-1.5 pl-3">
                  <Link2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-foreground">{a.name}</span>
                    {a.phase && <span className="truncate text-xs text-muted-foreground">{a.phase}</span>}
                  </span>
                  <StatusPill status={a.status} />
                  <Button type="button" variant="ghost" size="icon" onClick={() => remove(a.id)} aria-label={`Unlink ${a.name}`}>
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No activities linked yet.</p>
          )}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus aria-hidden="true" />
              Link schedule activity
            </Button>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {activities.length > 0 && (
        <ActivityPickerDialog
          open={open}
          onOpenChange={setOpen}
          activities={activities}
          selected={selected}
          onChange={onChange}
          logDate={logDate}
          limit={limit}
        />
      )}
    </div>
  )
}

function ActivityPickerDialog({
  open,
  onOpenChange,
  activities,
  selected,
  onChange,
  logDate,
  limit,
}: Omit<PickerProps, 'error'> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [phase, setPhase] = useState(ALL_PHASES)

  const phases = useMemo(() => {
    const seen: string[] = []
    for (const a of activities) {
      const p = a.phase || 'General'
      if (!seen.includes(p)) seen.push(p)
    }
    return seen
  }, [activities])

  const q = query.trim().toLowerCase()
  const visible = activities.filter((a) => (phase === ALL_PHASES || (a.phase || 'General') === phase) && (!q || a.name.toLowerCase().includes(q)))
  const suggested = visible.map((a) => ({ a, reason: suggestionReason(a, logDate) })).filter((s): s is { a: ScheduleActivityOption; reason: string } => Boolean(s.reason))
  const grouped = phases
    .map((p) => ({ phase: p, items: visible.filter((a) => (a.phase || 'General') === p) }))
    .filter((g) => g.items.length > 0)
  const atLimit = selected.size >= limit

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else if (!atLimit) next.add(id)
    onChange(next)
  }

  const row = (a: ScheduleActivityOption, reason?: string) => {
    const checked = selected.has(a.id)
    const disabled = !checked && atLimit
    return (
      <li key={a.id}>
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => toggle(a.id)}
          className={cn(
            'flex min-h-11 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
            checked && 'bg-primary/5',
          )}
        >
          <span
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded border',
              checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background',
            )}
            aria-hidden="true"
          >
            {checked && <Check className="size-3" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-foreground">{a.name}</span>
            {reason && <span className="truncate text-xs text-muted-foreground">{`${a.phase || 'General'} · ${reason}`}</span>}
          </span>
          <StatusPill status={a.status} />
        </button>
      </li>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="gap-1 border-b border-border/60 p-4 pr-12">
          <DialogTitle>Link schedule activities</DialogTitle>
          <DialogDescription>Linking is informational. It does not change the activity&apos;s status, dates, or progress.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b border-border/60 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search activities"
              aria-label="Search activities"
              className="h-10 pl-9"
            />
          </div>
          {phases.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Filter by phase">
              {[ALL_PHASES, ...phases].map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={phase === p}
                  onClick={() => setPhase(p)}
                  className={cn(
                    'h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    phase === p ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-foreground hover:bg-muted',
                  )}
                >
                  {p === ALL_PHASES ? 'All phases' : p}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No activities match your search.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {suggested.length > 0 && (
                <section aria-labelledby="activity-suggested-heading" className="rounded-lg bg-accent/40 p-1">
                  <h3 id="activity-suggested-heading" className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-xs font-semibold text-foreground">
                    <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
                    Suggested for this log date
                  </h3>
                  <ul className="flex flex-col">{suggested.map((s) => row(s.a, s.reason))}</ul>
                </section>
              )}
              {grouped.map((g) => (
                <section key={g.phase} aria-label={g.phase}>
                  <h3 className="px-2 pt-1 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">{g.phase}</h3>
                  <ul className="flex flex-col">{g.items.map((a) => row(a))}</ul>
                </section>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="m-0 flex-row items-center justify-between gap-3 border-t border-border/60 p-3 sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {atLimit ? `${selected.size} selected (limit reached)` : `${selected.size} selected`}
          </p>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
