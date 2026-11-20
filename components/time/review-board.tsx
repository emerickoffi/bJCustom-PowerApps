'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { reviewTimeEntriesAction } from '@/app/actions/time'
import { formatMinutes, type TimeStatus } from '@/lib/time-tracking'
import { TimeStatusBadge } from '@/components/time/time-shared'
import { DeleteEntryButton, EntryDialog, type EntryDraft } from '@/components/time/entry-dialog'

export type ReviewRow = {
  id: string
  person: string
  userId: string
  day: string
  project: string
  category: string
  span: string
  breakMinutes: number
  minutes: number
  status: TimeStatus
  notes: string | null
  reviewNote: string | null
  costLabel: string | null
  draft: EntryDraft
}

type Project = { id: string; name: string; project_number: string | null }
type Person = { user_id: string; name: string }

export function ReviewBoard({ rows, projects, people, missingRates }: { rows: ReviewRow[]; projects: Project[]; people: Person[]; missingRates: string[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [pending, start] = useTransition()

  const byPerson = useMemo(() => {
    const m = new Map<string, ReviewRow[]>()
    for (const r of rows) m.set(r.person, [...(m.get(r.person) ?? []), r])
    return [...m.entries()]
  }, [rows])

  const selectable = rows.filter((r) => r.status !== 'open')
  const selectedRows = selectable.filter((r) => selected.has(r.id))
  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })

  const decide = (decision: 'approve' | 'reject' | 'reopen') =>
    start(async () => {
      const r = await reviewTimeEntriesAction({ ids: selectedRows.map((x) => x.id), decision, note: note || undefined })
      if (r.ok) {
        toast.success(r.message ?? 'Done.')
        setSelected(new Set())
        setNote('')
        setRejecting(false)
        router.refresh()
      } else toast.error(r.error)
    })

  if (!rows.length) return <p className="surface p-6 text-center text-sm text-muted-foreground">Nothing to show for this week and filter.</p>

  const canApprove = selectedRows.some((r) => r.status === 'pending' || r.status === 'rejected')
  const canReject = selectedRows.some((r) => r.status === 'pending' || r.status === 'approved')
  const canReopen = selectedRows.some((r) => r.status === 'approved')

  return (
    <div className="flex flex-col gap-4">
      {missingRates.length > 0 && (
        <p className="rounded-xl bg-champagne-soft px-4 py-3 text-sm text-foreground">
          No labor rate set for {missingRates.join(', ')}. Their approved hours will count as $0 labor cost until an admin sets a rate in Labor rates.
        </p>
      )}

      <div className="sticky top-2 z-10 flex flex-col gap-3 rounded-surface border bg-card/95 p-3 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            className="size-4 accent-[var(--primary)]"
            checked={selectable.length > 0 && selectedRows.length === selectable.length}
            onChange={(e) => toggle(selectable.map((r) => r.id), e.target.checked)}
          />
          {selectedRows.length ? `${selectedRows.length} selected · ${formatMinutes(selectedRows.reduce((t, r) => t + r.minutes, 0))}` : 'Select all'}
        </label>
        {rejecting ? (
          <div className="flex flex-col gap-2 md:flex-row md:items-end">
            <div className="flex flex-col gap-1">
              <Label htmlFor="reject-note">What needs to change?</Label>
              <Input id="reject-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="h-9 md:w-72" autoFocus />
            </div>
            <div className="flex gap-2">
              <Button variant="destructive" disabled={pending || !note.trim()} onClick={() => decide('reject')}>
                Send back
              </Button>
              <Button variant="ghost" onClick={() => setRejecting(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button disabled={pending || !canApprove} onClick={() => decide('approve')}>
              <Check className="size-4" aria-hidden="true" />
              Approve
            </Button>
            <Button variant="outline" disabled={pending || !canReject} onClick={() => setRejecting(true)}>
              <X className="size-4" aria-hidden="true" />
              Send back
            </Button>
            <Button variant="ghost" disabled={pending || !canReopen} onClick={() => decide('reopen')}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Undo approval
            </Button>
          </div>
        )}
      </div>

      {byPerson.map(([person, list]) => {
        const ids = list.filter((r) => r.status !== 'open').map((r) => r.id)
        const all = ids.length > 0 && ids.every((id) => selected.has(id))
        return (
          <section key={person} aria-label={person} className="surface flex flex-col p-0">
            <header className="flex items-center justify-between gap-3 border-b px-4 py-3 md:px-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={all} onChange={(e) => toggle(ids, e.target.checked)} />
                {person}
              </label>
              <span className="text-sm font-medium tabular-nums text-foreground">{formatMinutes(list.reduce((t, r) => t + r.minutes, 0))}</span>
            </header>
            <ul className="divide-y">
              {list.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4 md:px-5">
                  <label className="flex min-w-0 flex-1 items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-[var(--primary)]"
                      disabled={r.status === 'open'}
                      checked={selected.has(r.id)}
                      onChange={(e) => toggle([r.id], e.target.checked)}
                    />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {r.day} · {r.project} <span className="font-normal text-muted-foreground">· {r.category}</span>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {r.span}
                        {r.breakMinutes ? ` · ${r.breakMinutes} min break` : ''}
                      </span>
                      {r.notes && <span className="text-sm text-muted-foreground">{r.notes}</span>}
                      {r.reviewNote && r.status === 'rejected' && <span className="text-sm text-destructive">Sent back: {r.reviewNote}</span>}
                    </span>
                  </label>
                  <div className="flex shrink-0 items-center gap-2 pl-7 md:pl-0">
                    <TimeStatusBadge status={r.status} />
                    <span className="w-16 text-right text-sm font-semibold tabular-nums text-foreground">{formatMinutes(r.minutes)}</span>
                    <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">{r.costLabel ?? ''}</span>
                    {r.status !== 'open' && (
                      <>
                        <EntryDialog trigger="edit" projects={projects} people={people} draft={r.draft} />
                        <DeleteEntryButton id={r.id} />
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
