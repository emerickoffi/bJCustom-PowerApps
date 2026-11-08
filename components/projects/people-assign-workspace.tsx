'use client'

import { Fragment, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronDown, Info, Plus, Search, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PROJECT_ROLE_OPTIONS } from '@/lib/contacts'
import { EMAIL_DELIVERY, NO_PORTAL_ACCESS, type BulkAssignItem } from '@/lib/directory-assignment'
import type { AccountStatus, DirectoryPersonRow, DirectoryRow } from '@/lib/directory-assignment-data'
import { bulkAssignFromDirectoryAction } from '@/app/actions/directory-assignment'
import { cn } from '@/lib/utils'

type Config = { role: string; relId: string | null; notify: boolean }
type KindFilter = 'all' | 'person' | 'company'

const PAGE_SIZE = 25
const ALL_TRADES = '__all__'

const ACCESS_LABEL: Record<AccountStatus, string> = {
  not_provisioned: 'No portal access',
  portal_active: 'Portal access active',
  portal_revoked: 'Portal access revoked',
}

const initialConfig = (row: DirectoryPersonRow): Config => ({ role: row.suggestedRole, relId: row.defaultRelationshipId, notify: false })

export function PeopleAssignWorkspace({
  projectId,
  projectName,
  rows,
  defaultOpen = false,
  audience = 'all',
  triggerLabel = 'Add people & companies',
}: {
  projectId: string
  projectName: string
  rows: DirectoryRow[]
  defaultOpen?: boolean
  /** 'subcontractors' opens filtered to subcontractor people and companies; the filter can be turned off. */
  audience?: 'all' | 'subcontractors'
  triggerLabel?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const [subsOnly, setSubsOnly] = useState(audience === 'subcontractors')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [trade, setTrade] = useState(ALL_TRADES)
  const [onlySelected, setOnlySelected] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [configs, setConfigs] = useState<Record<string, Config>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [addedNow, setAddedNow] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<string | null>(null)
  const [bulkRole, setBulkRole] = useState('')
  const [pending, startTransition] = useTransition()

  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows])
  const trades = useMemo(() => [...new Set(rows.map((r) => r.trade).filter((t): t is string => !!t))].sort(), [rows])

  const isAssigned = (r: DirectoryRow) => r.assigned || addedNow.has(r.key)
  const selectable = (r: DirectoryRow) => !isAssigned(r) && !r.disabledReason

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false
      if (trade !== ALL_TRADES && r.trade !== trade) return false
      if (onlySelected && !selected.has(r.key)) return false
      if (subsOnly && !r.isSubcontractor && !selected.has(r.key)) return false
      if (!q) return true
      const companies = r.kind === 'person' ? r.affiliations.map((a) => a.company_name).join(' ') : ''
      return `${r.name} ${r.email ?? ''} ${companies} ${r.trade ?? ''}`.toLowerCase().includes(q)
    })
  }, [rows, query, kind, trade, onlySelected, subsOnly, selected])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const selectedRows = [...selected].map((k) => byKey.get(k)).filter((r): r is DirectoryRow => !!r)
  const selectedPeople = selectedRows.filter((r): r is DirectoryPersonRow => r.kind === 'person')
  const missingRole = selectedPeople.filter((r) => !configs[r.key]?.role).length
  const visibleSelectable = visible.filter(selectable)
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((r) => selected.has(r.key))

  const resetPage = () => setPage(0)

  const toggle = (row: DirectoryRow, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(row.key)
      else next.delete(row.key)
      return next
    })
    if (on && row.kind === 'person' && !configs[row.key]) setConfigs((c) => ({ ...c, [row.key]: initialConfig(row) }))
  }

  const toggleVisible = (on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const r of visibleSelectable) on ? next.add(r.key) : next.delete(r.key)
      return next
    })
    if (on) {
      setConfigs((c) => {
        const next = { ...c }
        for (const r of visibleSelectable) if (r.kind === 'person' && !next[r.key]) next[r.key] = initialConfig(r)
        return next
      })
    }
  }

  const updateConfig = (row: DirectoryPersonRow, patch: Partial<Config>) =>
    setConfigs((c) => ({ ...c, [row.key]: { ...(c[row.key] ?? initialConfig(row)), ...patch } }))

  const applyBulkRole = (role: string) => {
    setBulkRole(role)
    setConfigs((c) => {
      const next = { ...c }
      for (const r of selectedPeople) next[r.key] = { ...(next[r.key] ?? initialConfig(r)), role }
      return next
    })
  }

  const submit = () => {
    if (pending || selectedRows.length === 0 || missingRole > 0) return
    const items: BulkAssignItem[] = selectedRows.map((r) => {
      if (r.kind === 'company') return { kind: 'company', id: r.id }
      const c = configs[r.key] ?? initialConfig(r)
      return { kind: 'person', id: r.id, person_company_id: c.relId, project_role: c.role, access: NO_PORTAL_ACCESS, notify: c.notify }
    })
    startTransition(async () => {
      const res = await bulkAssignFromDirectoryAction(projectId, items)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const failed = res.results.filter((r) => r.outcome === 'failed')
      const done = res.results.filter((r) => r.outcome !== 'failed')
      const doneKeys = new Set(done.map((r) => r.key))
      setSelected((prev) => new Set([...prev].filter((k) => !doneKeys.has(k))))
      setAddedNow((prev) => new Set([...prev, ...doneKeys]))
      setErrors(Object.fromEntries(failed.map((r) => [r.key, r.reason ?? 'This record could not be added.'])))
      if (failed.length) setOnlySelected(true)
      if (done.length) {
        toast.success(`Added ${done.length} to ${projectName}.`)
        router.refresh()
      }
      if (failed.length) toast.error(`${failed.length} could not be added. They're still selected so you can fix and retry.`)
      else setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <Button size="sm" onClick={() => setOpen(true)}>
        {audience === 'subcontractors' ? <Plus data-icon="inline-start" /> : <UserPlus data-icon="inline-start" />}
        {triggerLabel}
      </Button>
      <DialogContent className="flex max-h-[90vh] w-[calc(100vw-2rem)] flex-col gap-0 p-0 sm:max-w-6xl">
        <DialogHeader className="border-b border-border px-5 py-4">
          <DialogTitle>{audience === 'subcontractors' ? 'Assign subcontractors' : 'Add people & companies'}</DialogTitle>
          <DialogDescription>
            {audience === 'subcontractors'
              ? `Pick subcontractor people and companies from your business directory and add them to ${projectName}. Turn off “Subcontractors only” to include other professionals.`
              : `Pick from your business directory, set each person’s project role, and add them to ${projectName} in one step.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b border-border px-5 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  resetPage()
                }}
                placeholder="Search name, email, company, or trade"
                aria-label="Search directory"
                className="pl-8"
              />
            </div>
            <div role="group" aria-label="Record type" className="flex rounded-md border border-border p-0.5">
              {(['all', 'person', 'company'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k)
                    resetPage()
                  }}
                  className={cn(
                    'rounded px-3 py-1.5 text-sm',
                    kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {k === 'all' ? 'All' : k === 'person' ? 'People' : 'Companies'}
                </button>
              ))}
            </div>
            {trades.length > 0 && (
              <Select
                value={trade}
                onValueChange={(v) => {
                  setTrade(v ?? ALL_TRADES)
                  resetPage()
                }}
              >
                <SelectTrigger className="w-44" aria-label="Filter by trade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TRADES}>All trades</SelectItem>
                  {trades.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant={subsOnly ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={subsOnly}
              onClick={() => {
                setSubsOnly((v) => !v)
                resetPage()
              }}
            >
              Subcontractors only
            </Button>
            <Button
              type="button"
              variant={onlySelected ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={onlySelected}
              onClick={() => {
                setOnlySelected((v) => !v)
                resetPage()
              }}
            >
              Show selected ({selected.size})
            </Button>
          </div>
          {selectedPeople.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Apply role to {selectedPeople.length} selected {selectedPeople.length === 1 ? 'person' : 'people'}:</span>
              <Select value={bulkRole} onValueChange={(v) => v && applyBulkRole(v)}>
                <SelectTrigger className="h-8 w-60" aria-label="Apply project role to selected people">
                  <SelectValue placeholder="Choose role" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!EMAIL_DELIVERY.available && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="size-3.5 shrink-0" aria-hidden="true" />
              {EMAIL_DELIVERY.reason} Adding people never grants portal access.
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {visible.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? 'Your business directory is empty.'
                : subsOnly
                  ? 'No subcontractors match. Turn off “Subcontractors only” to include other professionals.'
                  : 'No records match these filters.'}
            </p>
          ) : (
            <table className="w-full text-sm">
              <caption className="sr-only">Directory people and companies</caption>
              <thead className="sticky top-0 z-10 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
                <tr>
                  <th scope="col" className="w-10 px-4 py-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label="Select all on this page"
                      checked={allVisibleSelected}
                      disabled={visibleSelectable.length === 0}
                      onChange={(e) => toggleVisible(e.target.checked)}
                    />
                  </th>
                  <th scope="col" className="px-2 py-2 font-medium">Name</th>
                  <th scope="col" className="px-2 py-2 font-medium">Trade</th>
                  <th scope="col" className="px-2 py-2 font-medium">Project role</th>
                  <th scope="col" className="px-2 py-2 font-medium">Access</th>
                  <th scope="col" className="px-4 py-2 font-medium">Notify</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((row) => (
                  <WorkspaceRow
                    key={row.key}
                    row={row}
                    assigned={isAssigned(row)}
                    checked={selected.has(row.key)}
                    config={row.kind === 'person' ? (configs[row.key] ?? initialConfig(row)) : null}
                    error={errors[row.key]}
                    expanded={expanded === row.key}
                    onExpand={() => setExpanded((k) => (k === row.key ? null : row.key))}
                    onToggle={(on) => toggle(row, on)}
                    onConfig={(patch) => row.kind === 'person' && updateConfig(row, patch)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span aria-live="polite">
              {filtered.length} {filtered.length === 1 ? 'record' : 'records'}
              {missingRole > 0 && <span className="ml-2 font-medium text-destructive">Choose a role for {missingRole} selected {missingRole === 1 ? 'person' : 'people'}</span>}
            </span>
            {pageCount > 1 && (
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  Previous
                </Button>
                Page {currentPage + 1} of {pageCount}
                <Button variant="ghost" size="sm" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
                  Next
                </Button>
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={pending || selectedRows.length === 0 || missingRole > 0}>
              {pending ? 'Adding…' : selectedRows.length ? `Add ${selectedRows.length} to project` : 'Add to project'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function WorkspaceRow({
  row,
  assigned,
  checked,
  config,
  error,
  expanded,
  onExpand,
  onToggle,
  onConfig,
}: {
  row: DirectoryRow
  assigned: boolean
  checked: boolean
  config: Config | null
  error?: string
  expanded: boolean
  onExpand: () => void
  onToggle: (on: boolean) => void
  onConfig: (patch: Partial<Config>) => void
}) {
  const blocked = assigned || !!row.disabledReason
  const person = row.kind === 'person' ? row : null
  const peopleCount = row.kind === 'company' ? row.peopleCount : 0
  const affiliation = person?.affiliations.find((a) => a.relationship_id === config?.relId) ?? person?.affiliations[0]
  const canNotify = !!person && checked && person.emailEligibility.eligible

  return (
    <Fragment>
      <tr className={cn(checked && 'bg-sage/40', error && 'bg-destructive/5')}>
        <td className="px-4 py-2 align-top">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            aria-label={`Select ${row.name}`}
            checked={checked}
            disabled={blocked}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </td>
        <td className="px-2 py-2 align-top">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">{row.name}</span>
            {row.kind === 'company' && <Badge variant="outline">Company</Badge>}
            {assigned && <Badge variant="secondary">On project</Badge>}
            {!assigned && row.disabledReason && <Badge variant="outline">{row.disabledReason}</Badge>}
          </div>
          {person ? (
            person.affiliations.length > 1 && checked ? (
              <Select value={config?.relId ?? ''} onValueChange={(v) => v && onConfig({ relId: v })}>
                <SelectTrigger className="mt-1 h-8 w-64" aria-label={`Company for ${row.name}`}>
                  <SelectValue placeholder="Choose company" />
                </SelectTrigger>
                <SelectContent>
                  {person.affiliations.map((a) => (
                    <SelectItem key={a.relationship_id} value={a.relationship_id}>
                      {a.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-xs text-muted-foreground">
                {affiliation ? affiliation.company_name : 'No company'}
                {affiliation?.position && <span> · Company title: {affiliation.position}</span>}
              </p>
            )
          ) : (
            <p className="text-xs text-muted-foreground">
              {peopleCount} {peopleCount === 1 ? 'person' : 'people'} in directory
            </p>
          )}
          {error && (
            <p role="alert" className="mt-1 text-xs font-medium text-destructive">
              {error}
            </p>
          )}
        </td>
        <td className="px-2 py-2 align-top text-muted-foreground">{row.trade ?? '—'}</td>
        <td className="px-2 py-2 align-top">
          {person ? (
            checked ? (
              <Select value={config?.role ?? ''} onValueChange={(v) => onConfig({ role: v ?? '' })}>
                <SelectTrigger
                  className={cn('h-8 w-56', !config?.role && 'border-destructive')}
                  aria-label={`Project role for ${row.name}`}
                  aria-invalid={!config?.role}
                >
                  <SelectValue placeholder="Choose role" />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_ROLE_OPTIONS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="text-muted-foreground">{blocked ? '—' : 'Select to set role'}</span>
            )
          ) : (
            <span className="text-muted-foreground">Subcontractor company</span>
          )}
        </td>
        <td className="px-2 py-2 align-top">
          {person ? (
            <button
              type="button"
              onClick={onExpand}
              aria-expanded={expanded}
              className="inline-flex items-center gap-1 text-left text-muted-foreground hover:text-foreground"
            >
              {ACCESS_LABEL[person.account]}
              <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
            </button>
          ) : (
            <span className="text-muted-foreground">No portal access</span>
          )}
        </td>
        <td className="px-4 py-2 align-top">
          {person ? (
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              aria-label={`Notify ${row.name} by email`}
              title={!person.emailEligibility.eligible ? person.emailEligibility.reason : undefined}
              checked={!!config?.notify && canNotify}
              disabled={!canNotify}
              onChange={(e) => onConfig({ notify: e.target.checked })}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {person && expanded && (
        <tr className="bg-muted/40">
          <td />
          <td colSpan={5} className="px-2 py-2 text-xs text-muted-foreground">
            Adding {row.name} to this project records their role only. It does not create an account or change portal access.
            {person.manageAccessHref && (
              <>
                {' '}
                <Link href={person.manageAccessHref} className="font-medium text-primary underline-offset-4 hover:underline">
                  Manage portal access
                </Link>
              </>
            )}
          </td>
        </tr>
      )}
    </Fragment>
  )
}
