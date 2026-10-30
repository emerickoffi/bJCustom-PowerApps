'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { IssueStatusBadge } from '@/components/walkthroughs/badges'
import { bulkUpdateIssuesAction, type BulkItemResult } from '@/app/actions/punch-list'
import {
  ISSUE_PRIORITIES,
  ISSUE_STATUS_LABELS,
  PRIORITY_LABELS,
  STAFF_SETTABLE_ISSUE_STATUSES,
  isOverdue,
  type IssuePriority,
  type IssueStatus,
} from '@/lib/walkthroughs'
import { formatDate } from '@/lib/format'

export type PunchListRow = {
  issueId: string
  number: string
  label: string
  category: string
  location: string | null
  status: IssueStatus
  priority: IssuePriority
  dueDate: string | null
  responsibleId: string | null
  responsibleName: string | null
  updatedAt: string
}

const KEEP = '__keep'
const CLEAR = '__clear'

export function PunchListTable({
  projectId,
  walkthroughId,
  rows,
  staffOptions,
}: {
  projectId: string
  walkthroughId: string
  rows: PunchListRow[]
  staffOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'outstanding' | IssueStatus>('outstanding')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState(KEEP)
  const [priority, setPriority] = useState(KEEP)
  const [responsible, setResponsible] = useState(KEEP)
  const [dueDate, setDueDate] = useState('')
  const [clearDue, setClearDue] = useState(false)
  const [atomic, setAtomic] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [failures, setFailures] = useState<Map<string, string>>(new Map())
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (statusFilter === 'outstanding' && !(r.status === 'open' || r.status === 'in_progress')) return false
      if (statusFilter !== 'all' && statusFilter !== 'outstanding' && r.status !== statusFilter) return false
      if (!q) return true
      return [r.number, r.label, r.category, r.location ?? '', r.responsibleName ?? ''].some((v) => v.toLowerCase().includes(q))
    })
  }, [rows, query, statusFilter])

  const selectedRows = rows.filter((r) => selected.has(r.issueId))
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.issueId))
  const hiddenSelected = selectedRows.filter((r) => !filtered.some((f) => f.issueId === r.issueId)).length

  const changes: Record<string, string | null> = {}
  if (status !== KEEP) changes.status = status
  if (priority !== KEEP) changes.priority = priority
  if (responsible !== KEEP) changes.responsible_user_id = responsible === CLEAR ? null : responsible
  if (clearDue) changes.due_date = null
  else if (dueDate) changes.due_date = dueDate
  const changeCount = Object.keys(changes).length

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of filtered) {
        if (allVisibleSelected) next.delete(r.issueId)
        else next.add(r.issueId)
      }
      return next
    })
  }

  function resetChanges() {
    setStatus(KEEP)
    setPriority(KEEP)
    setResponsible(KEEP)
    setDueDate('')
    setClearDue(false)
  }

  function apply() {
    setConfirming(false)
    setMessage(null)
    const items = selectedRows.map((r) => ({ id: r.issueId, updatedAt: r.updatedAt }))
    startTransition(async () => {
      let res
      try {
        res = await bulkUpdateIssuesAction({ projectId, walkthroughId, items, changes, atomic })
      } catch {
        setMessage({ tone: 'error', text: 'Could not reach the server. Nothing was confirmed as saved. Check your connection and try again.' })
        return
      }
      if (res.error) {
        setMessage({ tone: 'error', text: res.error })
        return
      }
      const results: BulkItemResult[] = res.results ?? []
      const failed = new Map(results.filter((r) => !r.ok).map((r) => [r.id, r.error ?? 'Not saved']))
      const saved = results.filter((r) => r.ok).length
      setFailures(failed)
      setSelected(new Set(failed.keys()))
      if (res.rolledBack) {
        setMessage({ tone: 'error', text: `No changes were saved. ${failed.size} issue${failed.size === 1 ? '' : 's'} need attention; fix them or deselect them and retry.` })
      } else if (failed.size) {
        setMessage({ tone: 'error', text: `Saved ${saved} of ${results.length}. ${failed.size} could not be updated and are still selected so you can retry.` })
      } else {
        setMessage({ tone: 'success', text: `Saved changes to ${saved} issue${saved === 1 ? '' : 's'}.` })
        resetChanges()
      }
      if (saved) router.refresh()
    })
  }

  const consequential = 'status' in changes || selectedRows.length >= 10

  return (
    <section aria-labelledby="punch-list-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="punch-list-heading" className="font-serif text-lg font-semibold text-foreground">
          Punch list
        </h2>
        <p className="text-sm text-muted-foreground">
          {rows.length} issue{rows.length === 1 ? '' : 's'} from this walkthrough. Select rows to update several at once.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search"
            aria-label="Search punch list"
            placeholder="Search number, item, location, or person"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="h-10 sm:w-48" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="outstanding">Outstanding</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
            {(Object.keys(ISSUE_STATUS_LABELS) as IssueStatus[]).map((s) => (
              <SelectItem key={s} value={s}>
                {ISSUE_STATUS_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="flex flex-col gap-3 rounded-xl border bg-muted/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-foreground" aria-live="polite">
              {selected.size} selected
              {hiddenSelected > 0 && <span className="font-normal text-muted-foreground"> ({hiddenSelected} hidden by filters)</span>}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              <X data-icon="inline-start" />
              Clear selection
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <BulkSelect label="Status" value={status} onChange={setStatus}
              options={STAFF_SETTABLE_ISSUE_STATUSES.map((s) => ({ value: s, label: ISSUE_STATUS_LABELS[s] }))} />
            <BulkSelect label="Priority" value={priority} onChange={setPriority}
              options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))} />
            <BulkSelect label="Responsible" value={responsible} onChange={setResponsible}
              options={[{ value: CLEAR, label: 'Unassigned' }, ...staffOptions]} />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bulk-due">Due date</Label>
              <Input id="bulk-due" type="date" value={dueDate} disabled={clearDue} onChange={(e) => setDueDate(e.target.value)} className="h-9" />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={clearDue} onChange={(e) => setClearDue(e.target.checked)} className="size-3.5 accent-primary" />
                Clear due date
              </label>
            </div>
          </div>
          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={atomic} onChange={(e) => setAtomic(e.target.checked)} className="size-4 accent-primary" />
              All or nothing: save only if every selected issue can be updated
            </label>
            <Button
              type="button"
              disabled={pending || changeCount === 0}
              onClick={() => (consequential ? setConfirming(true) : apply())}
            >
              {pending ? 'Saving...' : `Apply to ${selected.size}`}
            </Button>
          </div>
        </div>
      )}

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${message.tone === 'error' ? 'bg-destructive/10 text-destructive' : 'bg-muted text-foreground'}`}
        >
          {message.tone === 'error' ? <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
          {message.text}
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label={allVisibleSelected ? 'Deselect all shown issues' : `Select all ${filtered.length} shown issues`}
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  disabled={!filtered.length}
                  className="size-4 accent-primary"
                />
              </th>
              <th scope="col" className="w-16 px-2 py-3 font-medium">No.</th>
              <th scope="col" className="px-2 py-3 font-medium">Item</th>
              <th scope="col" className="hidden px-2 py-3 font-medium md:table-cell">Location</th>
              <th scope="col" className="px-2 py-3 font-medium">Status</th>
              <th scope="col" className="hidden px-2 py-3 font-medium lg:table-cell">Priority</th>
              <th scope="col" className="hidden px-2 py-3 font-medium lg:table-cell">Due</th>
              <th scope="col" className="hidden px-2 py-3 pr-4 font-medium xl:table-cell">Responsible</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((r) => {
              const failure = failures.get(r.issueId)
              const overdue = isOverdue(r.dueDate, r.status)
              return (
                <tr key={r.issueId} className={selected.has(r.issueId) ? 'bg-muted/40' : undefined}>
                  <td className="px-4 py-3 align-top">
                    <input
                      type="checkbox"
                      aria-label={`Select item ${r.number}, ${r.label}`}
                      checked={selected.has(r.issueId)}
                      onChange={() => toggle(r.issueId)}
                      className="size-4 accent-primary"
                    />
                  </td>
                  <td className="px-2 py-3 align-top font-mono text-xs font-semibold text-foreground">{r.number}</td>
                  <td className="px-2 py-3 align-top">
                    <Link href={`/projects/${projectId}/issues/${r.issueId}`} className="font-medium text-foreground hover:underline">
                      {r.label}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {r.category}
                      <span className="md:hidden">{r.location ? ` · ${r.location}` : ''}</span>
                    </p>
                    {failure && (
                      <p className="mt-1 flex items-start gap-1 text-xs text-destructive">
                        <AlertCircle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                        {failure}
                      </p>
                    )}
                  </td>
                  <td className="hidden px-2 py-3 align-top text-muted-foreground md:table-cell">{r.location ?? '—'}</td>
                  <td className="px-2 py-3 align-top"><IssueStatusBadge status={r.status} /></td>
                  <td className="hidden px-2 py-3 align-top lg:table-cell">{PRIORITY_LABELS[r.priority] ?? r.priority}</td>
                  <td className={`hidden px-2 py-3 align-top lg:table-cell ${overdue ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>
                    {r.dueDate ? formatDate(r.dueDate) : '—'}
                    {overdue && <span className="sr-only"> (overdue)</span>}
                  </td>
                  <td className="hidden px-2 py-3 pr-4 align-top text-muted-foreground xl:table-cell">{r.responsibleName ?? 'Unassigned'}</td>
                </tr>
              )
            })}
            {!filtered.length && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No issues match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update {selected.size} issues?</DialogTitle>
            <DialogDescription>
              {'status' in changes && `Status will change to ${ISSUE_STATUS_LABELS[changes.status as IssueStatus]}. `}
              Every change is recorded in each issue&apos;s history. Homeowner validations and approvals are not affected.
              {atomic ? ' If any issue fails, nothing is saved.' : ' Issues that cannot be updated are listed afterwards.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
            <Button type="button" onClick={apply}>Apply changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function BulkSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  const id = `bulk-${label.toLowerCase()}`
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v ?? KEEP)}>
        <SelectTrigger id={id} className="h-9 w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={KEEP}>No change</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
