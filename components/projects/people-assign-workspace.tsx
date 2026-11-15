'use client'

import { useCallback, useEffect, useId, useMemo, useState, useTransition, type ComponentProps } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { HardHat, Info, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { NativeSelect } from '@/components/shared/form-field'
import { FormOverlay, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'
import { AssignCreateNew } from '@/components/projects/assign-create-new'
import { PROJECT_ROLE_OPTIONS } from '@/lib/contacts'
import { EMAIL_DELIVERY, NO_PORTAL_ACCESS, summarizeResults, type BulkAssignItem } from '@/lib/directory-assignment'
import type { AccountStatus, DirectoryCompanyRow, DirectoryPersonRow, DirectoryRow } from '@/lib/directory-assignment-data'
import { bulkAssignFromDirectoryAction } from '@/app/actions/directory-assignment'
import { cn } from '@/lib/utils'

type Config = { role: string; relId: string | null; notify: boolean; customRole: boolean }
type KindFilter = 'company' | 'person'
type Audience = 'all' | 'subcontractors'

const PAGE_SIZE = 25
const OTHER_ROLE = '__other__'
const TOUCH = 'pointer-coarse:min-h-11'
const PANEL = 'flex min-h-0 flex-col data-hidden:hidden'
const GUTTER = 'px-4 sm:px-5'

const ACCESS_LABEL: Record<AccountStatus, string> = {
  not_provisioned: 'No portal access',
  portal_active: 'Portal access active',
  portal_revoked: 'Portal access revoked',
}

const KIND_LABEL: Record<KindFilter, string> = { company: 'Companies', person: 'People' }

const initialConfig = (row: DirectoryPersonRow): Config => ({
  role: row.suggestedRole,
  relId: row.defaultRelationshipId,
  notify: false,
  customRole: false,
})

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The one assignment drawer for a project: pick existing directory people and companies, or create a new
 * contact or subcontractor company that lands on the project directly. It always acts on the project it was
 * opened for and closes only after unsaved entries are confirmed as discarded.
 */
export function PeopleAssignWorkspace({
  projectId,
  projectName,
  rows,
  audience = 'subcontractors',
  canCreateCompany = false,
  open,
  onOpenChange,
  finalFocus,
}: {
  projectId: string
  projectName: string
  rows: DirectoryRow[]
  /** 'subcontractors' opens filtered to subcontractor people and companies; the filter can be turned off. */
  audience?: Audience
  /** Subcontractor management is on, so a new company can be created and assigned here. */
  canCreateCompany?: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes when the drawer closes. Defaults to the element focused before it opened. */
  finalFocus?: ComponentProps<typeof FormOverlay>['finalFocus']
}) {
  const close = useCallback(() => onOpenChange(false), [onOpenChange])
  return (
    <FormOverlay
      open={open}
      onClose={close}
      variant="drawer"
      size="lg"
      icon={HardHat}
      title="Assign subcontractors"
      description={projectName}
      finalFocus={finalFocus}
    >
      <AssignTabs projectId={projectId} projectName={projectName} rows={rows} audience={audience} canCreateCompany={canCreateCompany} />
    </FormOverlay>
  )
}

/**
 * The assignment workflow itself, for any container that provides the form-overlay context: the drawer above, or
 * a view inside an existing panel. Its field grids follow the width of that container, not the viewport.
 */
export function AssignTabs({
  projectId,
  projectName,
  rows,
  audience,
  canCreateCompany,
}: {
  projectId: string
  projectName: string
  rows: DirectoryRow[]
  audience: Audience
  canCreateCompany: boolean
}) {
  const overlay = useFormOverlay()
  const setDirty = overlay?.setDirty
  const [selecting, setSelecting] = useState(false)
  const [drafting, setDrafting] = useState(false)

  useEffect(() => {
    setDirty?.(selecting || drafting)
  }, [selecting, drafting, setDirty])

  return (
    <Tabs defaultValue="existing" className="@container min-h-0 flex-1 gap-0">
      <div className={cn('shrink-0 border-b border-border/70 py-2', GUTTER)}>
        <TabsList aria-label="How to assign" className="w-full group-data-horizontal/tabs:h-10">
          <TabsTrigger value="existing">Add existing</TabsTrigger>
          <TabsTrigger value="new">Create new</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="existing" keepMounted className={PANEL}>
        <AddExisting projectId={projectId} projectName={projectName} rows={rows} audience={audience} onSelectingChange={setSelecting} />
      </TabsContent>
      <TabsContent value="new" keepMounted className={PANEL}>
        <AssignCreateNew projectId={projectId} projectName={projectName} canCreateCompany={canCreateCompany} onDraftingChange={setDrafting} />
      </TabsContent>
    </Tabs>
  )
}

function AddExisting({
  projectId,
  projectName,
  rows,
  audience,
  onSelectingChange,
}: {
  projectId: string
  projectName: string
  rows: DirectoryRow[]
  audience: Audience
  onSelectingChange: (selecting: boolean) => void
}) {
  const router = useRouter()
  const overlay = useFormOverlay()
  const ids = useId()
  const [subsOnly, setSubsOnly] = useState(audience === 'subcontractors')
  const [query, setQuery] = useState('')
  // Companies lead wherever a subcontractor company can be assigned as a whole; otherwise people are the only option.
  const [kind, setKind] = useState<KindFilter>(() => (rows.some((r) => r.kind === 'company' && r.isSubcontractor) ? 'company' : 'person'))
  const [trade, setTrade] = useState('')
  const [onlySelected, setOnlySelected] = useState(false)
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [configs, setConfigs] = useState<Record<string, Config>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [addedNow, setAddedNow] = useState<Set<string>>(new Set())
  const [bulkRole, setBulkRole] = useState('')
  const [startDate, setStartDate] = useState('')
  const [pending, startTransition] = useTransition()

  const hasSelection = selected.size > 0
  useEffect(() => {
    onSelectingChange(hasSelection)
  }, [hasSelection, onSelectingChange])

  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows])
  const trades = useMemo(() => [...new Set(rows.map((r) => r.trade).filter((t): t is string => !!t))].sort(), [rows])

  const isAssigned = (r: DirectoryRow) => r.assigned || addedNow.has(r.key)
  const selectable = (r: DirectoryRow) => !isAssigned(r) && !r.disabledReason
  const configFor = (r: DirectoryPersonRow) => configs[r.key] ?? initialConfig(r)

  const matchesBase = useCallback(
    (r: DirectoryRow, q: string) => {
      if (trade && r.trade !== trade) return false
      if (onlySelected && !selected.has(r.key)) return false
      if (subsOnly && !r.isSubcontractor && !selected.has(r.key)) return false
      if (!q) return true
      const related =
        r.kind === 'person'
          ? r.affiliations.map((a) => a.company_name).join(' ')
          : `${r.primaryContact?.name ?? ''} ${r.primaryContact?.email ?? ''}`
      return `${r.name} ${r.email ?? ''} ${related} ${r.trade ?? ''}`.toLowerCase().includes(q)
    },
    [trade, onlySelected, subsOnly, selected],
  )

  const { filtered, counts } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = rows.filter((r) => matchesBase(r, q))
    return {
      filtered: base.filter((r) => r.kind === kind),
      counts: { company: base.filter((r) => r.kind === 'company').length, person: base.filter((r) => r.kind === 'person').length },
    }
  }, [rows, query, kind, matchesBase])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)

  const selectedRows = [...selected].map((k) => byKey.get(k)).filter((r): r is DirectoryRow => !!r && selectable(r))
  const selectedPeople = selectedRows.filter((r): r is DirectoryPersonRow => r.kind === 'person')
  const selectedCompanies = selectedRows.length - selectedPeople.length
  const missingRole = selectedPeople.filter((r) => !configFor(r).role.trim()).length
  const visibleSelectable = visible.filter(selectable)
  const allVisibleSelected = visibleSelectable.length > 0 && visibleSelectable.every((r) => selected.has(r.key))

  const resetPage = () => setPage(0)

  /** How a person relates to a company in the same picker, so the two never read as unrelated subcontractors. */
  const companyNote = (row: DirectoryPersonRow): string | null => {
    if (isAssigned(row)) return null
    for (const a of row.affiliations) {
      const company = byKey.get(a.company_key) as DirectoryCompanyRow | undefined
      if (!company) continue
      if (selected.has(company.key)) return `${a.company_name} is also selected. This adds ${row.name} separately, with their own project role.`
      if (isAssigned(company)) return `${a.company_name} is already on this project. Add ${row.name} only if they need their own project role.`
    }
    return null
  }

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
    if (!role) return
    setConfigs((c) => {
      const next = { ...c }
      for (const r of selectedPeople) next[r.key] = { ...(next[r.key] ?? initialConfig(r)), role, customRole: false }
      return next
    })
  }

  const submit = () => {
    if (pending || selectedRows.length === 0 || missingRole > 0) return
    const items: BulkAssignItem[] = selectedRows.map((r) => {
      if (r.kind === 'company') return { kind: 'company', id: r.id }
      const c = configFor(r)
      return {
        kind: 'person',
        id: r.id,
        person_company_id: c.relId,
        project_role: c.role.trim(),
        access: NO_PORTAL_ACCESS,
        notify: c.notify,
        started_at: startDate || undefined,
      }
    })
    startTransition(async () => {
      const res = await bulkAssignFromDirectoryAction(projectId, items)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      const summary = summarizeResults(res.results)
      const failed = res.results.filter((r) => r.outcome === 'failed')
      // Records that are already on the project count as done, so a retried submission never assigns twice.
      const doneKeys = new Set(res.results.filter((r) => r.outcome !== 'failed').map((r) => r.key))
      setSelected((prev) => new Set([...prev].filter((k) => !doneKeys.has(k))))
      setAddedNow((prev) => new Set([...prev, ...doneKeys]))
      setErrors(Object.fromEntries(failed.map((r) => [r.key, r.reason ?? 'This record could not be assigned.'])))
      if (failed.length) setOnlySelected(true)

      if (summary.added) {
        const parts = [`Assigned ${summary.added} to ${projectName}.`]
        if (summary.alreadyAssigned) parts.push(`${summary.alreadyAssigned} already on the project.`)
        if (summary.notificationsSent) parts.push(`${plural(summary.notificationsSent, 'person', 'people')} notified by email.`)
        if (summary.notificationsNotSent) parts.push(`${summary.notificationsNotSent} not notified.`)
        toast.success(parts.join(' '))
        router.refresh()
      } else if (summary.alreadyAssigned && !summary.failed) {
        toast.info(`Already on ${projectName}. Nothing new was assigned.`)
      }
      if (summary.failed) {
        toast.error(
          `${summary.failed} could not be assigned${summary.added ? `, ${summary.added} succeeded` : ''}. The rest stay selected so you can fix and retry.`,
        )
      } else overlay?.forceClose()
    })
  }

  return (
    <>
      <div className={cn('flex shrink-0 flex-col gap-2 border-b border-border/70 py-2.5', GUTTER)}>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                resetPage()
              }}
              placeholder="Search company, person, email, or trade"
              aria-label="Search directory"
              className={cn('h-9 pl-8', TOUCH)}
            />
          </div>
          {trades.length > 0 && (
            <NativeSelect
              aria-label="Filter by trade"
              value={trade}
              onChange={(e) => {
                setTrade(e.target.value)
                resetPage()
              }}
              className={cn('h-9 w-36 shrink-0', TOUCH)}
            >
              <option value="">All trades</option>
              {trades.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div role="group" aria-label="Show" className="flex rounded-md border border-border p-0.5">
            {(['company', 'person'] as const).map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => {
                  setKind(k)
                  resetPage()
                }}
                className={cn(
                  'flex items-center gap-1.5 rounded px-3 py-1 text-sm',
                  TOUCH,
                  kind === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {KIND_LABEL[k]}
                <span className={cn('text-xs tabular-nums', kind === k ? 'opacity-80' : 'opacity-70')}>{counts[k]}</span>
              </button>
            ))}
          </div>
          <label className={cn('flex cursor-pointer items-center gap-2 text-sm text-foreground', TOUCH)}>
            <input
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={subsOnly}
              onChange={(e) => {
                setSubsOnly(e.target.checked)
                resetPage()
              }}
            />
            Subcontractors only
          </label>
        </div>

        {selectedPeople.length > 0 && (
          <div className="grid gap-2 rounded-md bg-muted/50 p-2 @md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-bulk-role`} className="text-xs font-medium text-foreground">
                Role for {plural(selectedPeople.length, 'selected person', 'selected people')}
              </label>
              <NativeSelect id={`${ids}-bulk-role`} value={bulkRole} onChange={(e) => applyBulkRole(e.target.value)} className="h-9">
                <option value="">Keep individual roles</option>
                {PROJECT_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-start`} className="text-xs font-medium text-foreground">
                Start date <span className="font-normal text-muted-foreground">(defaults to today)</span>
              </label>
              <Input id={`${ids}-start`} type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-9" />
            </div>
          </div>
        )}

        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {!EMAIL_DELIVERY.available && `${EMAIL_DELIVERY.reason} `}
            Assigning never grants portal access or adds a company&apos;s other people.
          </span>
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-5 py-8 text-center text-sm text-muted-foreground">
            <p>
              {rows.length === 0
                ? 'Your business directory is empty. Use “Create new” to add the first record.'
                : counts[kind === 'company' ? 'person' : 'company'] > 0
                  ? `No ${KIND_LABEL[kind].toLowerCase()} match. ${plural(counts[kind === 'company' ? 'person' : 'company'], 'match', 'matches')} in ${KIND_LABEL[kind === 'company' ? 'person' : 'company']}.`
                  : 'No records match these filters.'}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {rows.length > 0 && counts[kind === 'company' ? 'person' : 'company'] > 0 && (
                <Button type="button" variant="outline" size="sm" className={TOUCH} onClick={() => setKind(kind === 'company' ? 'person' : 'company')}>
                  Show {KIND_LABEL[kind === 'company' ? 'person' : 'company'].toLowerCase()}
                </Button>
              )}
              {rows.length > 0 && subsOnly && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={TOUCH}
                  onClick={() => {
                    setSubsOnly(false)
                    resetPage()
                  }}
                >
                  Include other professionals
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <label
              className={cn(
                'sticky top-0 z-10 flex min-h-9 cursor-pointer items-center gap-3 border-b border-border/70 bg-muted text-xs font-medium text-muted-foreground',
                TOUCH,
                GUTTER,
              )}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={allVisibleSelected}
                disabled={visibleSelectable.length === 0}
                onChange={(e) => toggleVisible(e.target.checked)}
              />
              Select all {visibleSelectable.length} available on this page
            </label>
            <ul className="divide-y divide-border/70">
              {visible.map((row) => (
                <DirectoryListRow
                  key={row.key}
                  row={row}
                  assigned={isAssigned(row)}
                  checked={selected.has(row.key)}
                  config={row.kind === 'person' ? configFor(row) : null}
                  note={row.kind === 'person' ? companyNote(row) : null}
                  error={errors[row.key]}
                  onToggle={(on) => toggle(row, on)}
                  onConfig={(patch) => row.kind === 'person' && updateConfig(row, patch)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <OverlayFooter
        message={
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex flex-wrap items-center gap-x-2" aria-live="polite">
              <span className="font-medium text-foreground">
                {selectedRows.length
                  ? [selectedCompanies && plural(selectedCompanies, 'company', 'companies'), selectedPeople.length && plural(selectedPeople.length, 'person', 'people')]
                      .filter(Boolean)
                      .join(' and ') + ' selected'
                  : 'None selected'}
              </span>
              {selected.size > 0 && (
                <button
                  type="button"
                  aria-pressed={onlySelected}
                  onClick={() => {
                    setOnlySelected((v) => !v)
                    resetPage()
                  }}
                  className={cn('font-medium text-primary underline-offset-4 hover:underline', TOUCH)}
                >
                  {onlySelected ? 'Show all' : 'Review selection'}
                </button>
              )}
              {missingRole > 0 && (
                <span className="font-medium text-destructive">
                  Choose a role for {plural(missingRole, 'selected person', 'selected people')}
                </span>
              )}
            </span>
            {pageCount > 1 && (
              <span className="flex items-center gap-1">
                <Button variant="ghost" size="sm" className={TOUCH} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
                  Previous
                </Button>
                {currentPage + 1} / {pageCount}
                <Button variant="ghost" size="sm" className={TOUCH} disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
                  Next
                </Button>
              </span>
            )}
          </div>
        }
      >
        <Button type="button" variant="outline" className={TOUCH} onClick={overlay?.requestClose} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" className={TOUCH} onClick={submit} disabled={pending || selectedRows.length === 0 || missingRole > 0}>
          {pending ? 'Assigning…' : 'Assign to project'}
        </Button>
      </OverlayFooter>
    </>
  )
}

function DirectoryListRow({
  row,
  assigned,
  checked,
  config,
  note,
  error,
  onToggle,
  onConfig,
}: {
  row: DirectoryRow
  assigned: boolean
  checked: boolean
  config: Config | null
  note: string | null
  error?: string
  onToggle: (on: boolean) => void
  onConfig: (patch: Partial<Config>) => void
}) {
  const id = useId()
  const blocked = assigned || !!row.disabledReason
  const person = row.kind === 'person' ? row : null
  const home = person ? (person.affiliations.find((a) => a.relationship_id === person.defaultRelationshipId) ?? person.affiliations[0]) : null
  const canNotify = !!person && person.emailEligibility.eligible
  const contact = row.kind === 'company' ? row.primaryContact : null

  const subline =
    row.kind === 'person'
      ? [home ? (home.position ? `${home.position}, ${home.company_name}` : home.company_name) : 'Independent', row.email]
      : [contact ? `Primary contact: ${contact.name ?? contact.email}` : 'No primary contact on file', contact?.name ? contact.email : null]
  const meta =
    row.kind === 'person' ? [row.trade, ACCESS_LABEL[row.account]] : [row.trade, plural(row.peopleCount, 'person', 'people') + ' in directory']

  return (
    <li className={cn(GUTTER, checked && 'bg-link-soft', error && 'bg-destructive/5')}>
      <label className={cn('flex min-h-11 items-start gap-3 py-2', blocked ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <input
          type="checkbox"
          className="mt-0.5 size-4 shrink-0 accent-primary"
          aria-label={`Select ${row.name}`}
          checked={checked}
          disabled={blocked}
          onChange={(e) => onToggle(e.target.checked)}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={cn('text-sm font-medium', blocked ? 'text-muted-foreground' : 'text-foreground')}>{row.name}</span>
            {assigned && <Badge variant="secondary">On project</Badge>}
          </span>
          <span className="truncate text-xs text-foreground/80">{subline.filter(Boolean).join(' · ')}</span>
          {meta.some(Boolean) && <span className="text-xs text-muted-foreground">{meta.filter(Boolean).join(' · ')}</span>}
          {!assigned && row.disabledReason && <span className="text-xs text-muted-foreground">{row.disabledReason}</span>}
          {note && <span className="text-xs text-muted-foreground">{note}</span>}
        </span>
      </label>

      {error && (
        <p role="alert" className="pb-2 pl-7 text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      {person && config && checked && (
        <div className="grid gap-2 pb-2.5 pl-7 @lg:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-role`} className="text-xs font-medium text-foreground">
              Project role <span className="text-destructive" aria-hidden="true">*</span>
            </label>
            <NativeSelect
              id={`${id}-role`}
              required
              value={config.customRole ? OTHER_ROLE : config.role}
              aria-invalid={!config.role.trim() ? true : undefined}
              className="h-9"
              onChange={(e) =>
                onConfig(e.target.value === OTHER_ROLE ? { role: '', customRole: true } : { role: e.target.value, customRole: false })
              }
            >
              <option value="" disabled>
                Choose role
              </option>
              {PROJECT_ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={OTHER_ROLE}>Other</option>
            </NativeSelect>
            {config.customRole && (
              <Input
                value={config.role}
                onChange={(e) => onConfig({ role: e.target.value })}
                maxLength={120}
                required
                aria-label={`Custom project role for ${row.name}`}
                aria-invalid={!config.role.trim() ? true : undefined}
                placeholder="Describe the role, e.g. Insurance adjuster"
                className="h-9"
              />
            )}
          </div>

          {person.affiliations.length > 0 && (
            <div className="flex flex-col gap-1">
              <label htmlFor={`${id}-company`} className="text-xs font-medium text-foreground">
                On behalf of
              </label>
              <NativeSelect id={`${id}-company`} value={config.relId ?? ''} onChange={(e) => onConfig({ relId: e.target.value || null })} className="h-9">
                <option value="">No company</option>
                {person.affiliations.map((a) => (
                  <option key={a.relationship_id} value={a.relationship_id}>
                    {a.company_name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-x-3 @lg:col-span-2">
            <label
              className={cn('flex min-h-9 items-center gap-2 text-xs', TOUCH, canNotify ? 'cursor-pointer text-foreground' : 'text-muted-foreground')}
              title={!person.emailEligibility.eligible ? person.emailEligibility.reason : undefined}
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary"
                checked={config.notify && canNotify}
                disabled={!canNotify}
                onChange={(e) => onConfig({ notify: e.target.checked })}
              />
              <span>
                Notify by email
                {!person.emailEligibility.eligible && EMAIL_DELIVERY.available && ` (${person.emailEligibility.reason})`}
              </span>
            </label>
            {person.manageAccessHref && (
              <Link href={person.manageAccessHref} className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                Manage portal access
              </Link>
            )}
          </div>
        </div>
      )}
    </li>
  )
}
