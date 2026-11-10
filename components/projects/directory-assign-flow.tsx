'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Building2, CheckCircle2, CircleAlert, CircleMinus, Info, RotateCcw, Search, User, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/shared/form-field'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { segmentClass } from '@/lib/interaction-styles'
import { PROJECT_ROLE_OPTIONS } from '@/lib/contacts'
import {
  NO_PORTAL_ACCESS,
  PROJECT_ACCESS_LABEL,
  MAX_BULK_ASSIGN,
  failedItems,
  mergeResults,
  summarizeResults,
  type BulkAssignItem,
  type BulkAssignResult,
} from '@/lib/directory-assignment'
import type { AccountStatus, DirectoryPersonRow, DirectoryRow } from '@/lib/directory-assignment-data'
import { bulkAssignFromDirectoryAction } from '@/app/actions/directory-assignment'

const PAGE_SIZE = 25
const TH = 'px-3 py-2.5 text-left text-xs font-medium text-muted-foreground'
const TD = 'px-3 py-2.5 align-top'
const CHECKBOX = 'size-4 rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-40'

type KindFilter = 'all' | 'person' | 'company'
type Draft = { person_company_id: string | null; project_role: string; notify: boolean }

const ACCOUNT: Record<AccountStatus, { label: string; tone: SemanticTone }> = {
  not_provisioned: { label: 'Not provisioned', tone: 'neutral' },
  portal_active: { label: 'Portal active', tone: 'active' },
  portal_revoked: { label: 'Portal revoked', tone: 'danger' },
}

const isSelectable = (r: DirectoryRow) => !r.assigned && !r.disabledReason

function KindIcon({ kind }: { kind: DirectoryRow['kind'] }) {
  const Icon = kind === 'person' ? User : Building2
  return <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
}

function Dash() {
  return <span className="text-muted-foreground">{'—'}</span>
}

export function DirectoryAssignFlow({ projectId, projectName, rows }: { projectId: string; projectName: string; rows: DirectoryRow[] }) {
  const router = useRouter()
  const [step, setStep] = useState<'select' | 'review' | 'results'>('select')
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('all')
  const [hideAssigned, setHideAssigned] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [bulkRole, setBulkRole] = useState('')
  const [submitted, setSubmitted] = useState<BulkAssignItem[]>([])
  const [results, setResults] = useState<BulkAssignResult[]>([])
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r])), [rows])
  const selectedSet = useMemo(() => new Set(selected), [selected])
  const selectedRows = useMemo(() => selected.map((k) => byKey.get(k)).filter((r): r is DirectoryRow => !!r), [selected, byKey])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'all' && r.kind !== kind) return false
      if (hideAssigned && r.assigned) return false
      if (!q) return true
      const hay = [r.name, r.email, ...(r.kind === 'person' ? r.affiliations.map((a) => a.company_name) : [])]
      return hay.some((v) => v?.toLowerCase().includes(q))
    })
  }, [rows, query, kind, hideAssigned])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const pageSelectable = pageRows.filter(isSelectable)
  const matchingSelectable = filtered.filter(isSelectable)
  const pageAllSelected = pageSelectable.length > 0 && pageSelectable.every((r) => selectedSet.has(r.key))
  const allMatchingSelected = matchingSelectable.length > 0 && matchingSelectable.every((r) => selectedSet.has(r.key))
  const peopleSelected = selectedRows.filter((r) => r.kind === 'person').length
  const companiesSelected = selectedRows.length - peopleSelected
  const overLimit = selected.length > MAX_BULK_ASSIGN

  function toggle(key: string) {
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]))
  }
  function addKeys(keys: string[]) {
    setSelected((s) => [...s, ...keys.filter((k) => !s.includes(k))])
  }
  function removeKeys(keys: string[]) {
    const drop = new Set(keys)
    setSelected((s) => s.filter((k) => !drop.has(k)))
  }

  function draftFor(r: DirectoryPersonRow): Draft {
    return drafts[r.key] ?? { person_company_id: r.defaultRelationshipId, project_role: r.suggestedRole, notify: false }
  }
  function updateDraft(r: DirectoryPersonRow, patch: Partial<Draft>) {
    setDrafts((d) => ({ ...d, [r.key]: { ...draftFor(r), ...patch } }))
  }

  const missingRoles = selectedRows.filter((r) => r.kind === 'person' && !draftFor(r).project_role.trim())

  function buildItems(): BulkAssignItem[] {
    return selectedRows.map((r) => {
      if (r.kind === 'company') return { kind: 'company', id: r.id }
      const d = draftFor(r)
      return {
        kind: 'person',
        id: r.id,
        person_company_id: d.person_company_id,
        project_role: d.project_role.trim(),
        access: NO_PORTAL_ACCESS,
        notify: d.notify && r.emailEligibility.eligible,
      }
    })
  }

  function run(items: BulkAssignItem[], isRetry: boolean) {
    setError(null)
    startTransition(async () => {
      const res = await bulkAssignFromDirectoryAction(projectId, items)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setResults((prev) => (isRetry ? mergeResults(prev, res.results) : res.results))
      if (!isRetry) setSubmitted(items)
      setStep('results')
      if (res.results.some((r) => r.outcome === 'added')) router.refresh()
    })
  }

  function submit() {
    if (missingRoles.length) {
      setShowErrors(true)
      return
    }
    run(buildItems(), false)
  }

  function startOver() {
    setSelected([])
    setDrafts({})
    setResults([])
    setSubmitted([])
    setShowErrors(false)
    setError(null)
    setStep('select')
  }

  const stepper = (
    <ol className="flex flex-wrap items-center gap-2 text-xs font-medium" aria-label="Progress">
      {(['select', 'review', 'results'] as const).map((s, i) => {
        const current = step === s
        const labels = { select: 'Select', review: 'Review', results: 'Results' }
        return (
          <li key={s} className="flex items-center gap-2" aria-current={current ? 'step' : undefined}>
            {i > 0 && <span className="h-px w-6 bg-border" aria-hidden="true" />}
            <span
              className={`flex size-5 items-center justify-center rounded-full border text-[11px] ${
                current ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span className={current ? 'text-foreground' : 'text-muted-foreground'}>{labels[s]}</span>
          </li>
        )
      })}
    </ol>
  )

  const errorBanner = error && (
    <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {error}
    </p>
  )

  if (step === 'results') {
    const s = summarizeResults(results)
    const retry = failedItems(submitted, results)
    const notifyRequested = results.some((r) => r.notification !== 'not_requested')
    const stats: { label: string; value: number; tone: string }[] = [
      { label: 'Added', value: s.added, tone: 'text-[#187542]' },
      { label: 'Already assigned', value: s.alreadyAssigned, tone: 'text-muted-foreground' },
      { label: 'Failed', value: s.failed, tone: s.failed ? 'text-destructive' : 'text-muted-foreground' },
    ]
    return (
      <div className="flex flex-col gap-4">
        {stepper}
        <section aria-labelledby="results-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
          <div>
            <h2 id="results-heading" className="text-sm font-semibold">
              {s.failed ? 'Finished with some failures' : 'Assignment complete'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
              {`${results.length} ${results.length === 1 ? 'record' : 'records'} processed for ${projectName}. No accounts, invitations, or permissions were created.`}
            </p>
          </div>
          <dl className="grid grid-cols-3 gap-3 sm:max-w-lg">
            {stats.map((st) => (
              <div key={st.label} className="rounded-lg border border-border px-3 py-2">
                <dt className="text-xs text-muted-foreground">{st.label}</dt>
                <dd className={`text-xl font-semibold tabular-nums ${st.tone}`}>{st.value}</dd>
              </div>
            ))}
          </dl>
          {notifyRequested && (
            <p className="text-xs text-muted-foreground">{`Notifications: ${s.notificationsSent} sent, ${s.notificationsNotSent} not sent.`}</p>
          )}
          {errorBanner}
          <ul className="divide-y divide-border rounded-lg border border-border">
            {results.map((r) => (
              <li key={r.key} className="flex flex-col gap-1 px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="flex min-w-0 items-center gap-2">
                  <KindIcon kind={r.kind} />
                  <span className="truncate font-medium">{r.name}</span>
                </span>
                <span className="flex flex-col items-start gap-0.5 sm:items-end">
                  {r.outcome === 'added' ? (
                    <SemanticBadge tone="success">Added</SemanticBadge>
                  ) : r.outcome === 'already_assigned' ? (
                    <SemanticBadge tone="neutral">Already assigned</SemanticBadge>
                  ) : (
                    <SemanticBadge tone="danger">Failed</SemanticBadge>
                  )}
                  {r.outcome === 'failed' && r.reason && <span className="text-xs text-destructive">{r.reason}</span>}
                  {r.notification === 'not_sent' && r.notificationReason && (
                    <span className="text-xs text-muted-foreground">{`Notification not sent: ${r.notificationReason}`}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={startOver}>
              Add more
            </Button>
            {retry.length > 0 && (
              <Button variant="outline" size="sm" disabled={pending} onClick={() => run(retry, true)}>
                <RotateCcw data-icon="inline-start" />
                {pending ? 'Retrying...' : `Retry failed (${retry.length})`}
              </Button>
            )}
            <Link href={`/projects/${projectId}/contacts`} className={buttonVariants({ size: 'sm' })}>
              Back to project contacts
            </Link>
          </div>
        </section>
      </div>
    )
  }

  if (step === 'review') {
    const peopleRows = selectedRows.filter((r): r is DirectoryPersonRow => r.kind === 'person')
    return (
      <div className="flex flex-col gap-4">
        {stepper}
        <section aria-labelledby="review-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="review-heading" className="text-sm font-semibold">
                Review assignments
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {`${peopleSelected} ${peopleSelected === 1 ? 'person' : 'people'} and ${companiesSelected} ${companiesSelected === 1 ? 'company' : 'companies'} to add to ${projectName}.`}
              </p>
            </div>
            {peopleRows.length > 1 && (
              <div className="flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="bulk-role" className="text-xs font-medium text-muted-foreground">
                    Role for people without one
                  </label>
                  <Input id="bulk-role" list="project-roles" value={bulkRole} onChange={(e) => setBulkRole(e.target.value)} className="h-8 w-56" />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!bulkRole.trim()}
                  onClick={() => {
                    const next = { ...drafts }
                    for (const r of peopleRows) {
                      const d = draftFor(r)
                      if (!d.project_role.trim()) next[r.key] = { ...d, project_role: bulkRole.trim() }
                    }
                    setDrafts(next)
                  }}
                >
                  Apply
                </Button>
              </div>
            )}
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <p className="text-pretty">
              <strong className="font-medium text-foreground">Project role</strong> describes their responsibility.{' '}
              <strong className="font-medium text-foreground">Project access</strong> controls what they can see.{' '}
              <strong className="font-medium text-foreground">Account status</strong> shows whether they can sign in.{' '}
              <strong className="font-medium text-foreground">Email</strong> only controls whether a message is sent. Companies are assigned as
              records and give their employees no access.
            </p>
          </div>

          <datalist id="project-roles">
            {PROJECT_ROLE_OPTIONS.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>

          <ul className="flex flex-col gap-3">
            {selectedRows.map((r) => {
              if (r.kind === 'company') {
                return (
                  <li key={r.key} className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <KindIcon kind="company" />
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <SemanticBadge tone="cobalt">Company</SemanticBadge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">Company record only. No login, invitation, or access.</span>
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => removeKeys([r.key])}>
                        <X />
                      </Button>
                    </div>
                  </li>
                )
              }
              const d = draftFor(r)
              const roleMissing = showErrors && !d.project_role.trim()
              const roleId = `role-${r.id}`
              return (
                <li key={r.key} className="flex flex-col gap-3 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <KindIcon kind="person" />
                      <span className="truncate text-sm font-medium">{r.name}</span>
                    </div>
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${r.name}`} onClick={() => removeKeys([r.key])}>
                      <X />
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="flex flex-col gap-1">
                      <label htmlFor={`aff-${r.id}`} className="text-xs font-medium text-muted-foreground">
                        Company affiliation
                      </label>
                      <NativeSelect
                        id={`aff-${r.id}`}
                        value={d.person_company_id ?? ''}
                        onChange={(e) => updateDraft(r, { person_company_id: e.target.value || null })}
                        className="h-8"
                      >
                        <option value="">None (independent)</option>
                        {r.affiliations.map((a) => (
                          <option key={a.relationship_id} value={a.relationship_id}>
                            {a.position ? `${a.company_name} · ${a.position}` : a.company_name}
                          </option>
                        ))}
                      </NativeSelect>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label htmlFor={roleId} className="text-xs font-medium text-muted-foreground">
                        Project role <span aria-hidden="true">*</span>
                      </label>
                      <Input
                        id={roleId}
                        list="project-roles"
                        value={d.project_role}
                        maxLength={120}
                        required
                        aria-invalid={roleMissing || undefined}
                        aria-describedby={roleMissing ? `${roleId}-err` : undefined}
                        placeholder="Choose or type a role"
                        onChange={(e) => updateDraft(r, { project_role: e.target.value })}
                        className="h-8"
                      />
                      {roleMissing && (
                        <span id={`${roleId}-err`} className="text-xs text-destructive">
                          Project role is required
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Project access</span>
                      <span className="text-sm">{PROJECT_ACCESS_LABEL[NO_PORTAL_ACCESS]}</span>
                      <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <SemanticBadge tone={ACCOUNT[r.account].tone}>{ACCOUNT[r.account].label}</SemanticBadge>
                        {r.manageAccessHref && (
                          <Link href={r.manageAccessHref} className="font-medium text-primary underline-offset-4 hover:underline">
                            Manage access
                          </Link>
                        )}
                      </span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Email</span>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className={CHECKBOX}
                          checked={d.notify && r.emailEligibility.eligible}
                          disabled={!r.emailEligibility.eligible}
                          onChange={(e) => updateDraft(r, { notify: e.target.checked })}
                        />
                        Send assignment notification
                      </label>
                      {!r.emailEligibility.eligible && <span className="text-xs text-muted-foreground">{r.emailEligibility.reason}</span>}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {showErrors && missingRoles.length > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {`Add a project role for ${missingRoles.length} ${missingRoles.length === 1 ? 'person' : 'people'} before continuing.`}
            </p>
          )}
          {errorBanner}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
            <Button variant="ghost" size="sm" onClick={() => setStep('select')} disabled={pending}>
              <ArrowLeft data-icon="inline-start" />
              Back to selection
            </Button>
            <Button size="sm" onClick={submit} disabled={pending || selectedRows.length === 0}>
              {pending ? 'Adding...' : `Add ${selectedRows.length} to project`}
            </Button>
          </div>
        </section>
      </div>
    )
  }

  const kindLabel = kind === 'person' ? 'people' : kind === 'company' ? 'companies' : 'records'

  return (
    <div className="flex flex-col gap-4">
      {stepper}
      <section aria-labelledby="select-heading" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs sm:p-5">
        <div>
          <h2 id="select-heading" className="text-sm font-semibold">
            Select from directory
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground" aria-live="polite">
            {`${filtered.length} matching ${kindLabel}`}
          </p>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <label htmlFor="dir-search" className="sr-only">
              Search directory
            </label>
            <Input
              id="dir-search"
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(1)
              }}
              placeholder="Search name, company, or email"
              className="h-9 pl-8"
            />
          </div>
          <div role="group" aria-label="Record type" className="inline-flex h-9 rounded-lg border border-border p-0.5">
            {(
              [
                { v: 'all', l: 'All' },
                { v: 'person', l: 'People' },
                { v: 'company', l: 'Companies' },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                aria-pressed={kind === o.v}
                onClick={() => {
                  setKind(o.v)
                  setPage(1)
                }}
                className={`flex-1 rounded-md px-3 text-xs font-medium ${segmentClass(kind === o.v)}`}
              >
                {o.l}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className={CHECKBOX}
              checked={hideAssigned}
              onChange={(e) => {
                setHideAssigned(e.target.checked)
                setPage(1)
              }}
            />
            Hide already assigned
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
          {matchingSelectable.length > 0 &&
            (allMatchingSelected ? (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => removeKeys(matchingSelectable.map((r) => r.key))}>
                {`Deselect all ${matchingSelectable.length} matching ${kindLabel}`}
              </button>
            ) : (
              <button type="button" className="font-medium text-primary hover:underline" onClick={() => addKeys(matchingSelectable.map((r) => r.key))}>
                {`Select all ${matchingSelectable.length} matching ${kindLabel}`}
              </button>
            ))}
          <span className="text-muted-foreground">Already-assigned and unavailable records are never selected.</span>
        </div>

        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            {rows.length === 0 ? 'Your business contacts directory is empty.' : 'No records match these filters.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border bg-muted/50">
                <tr>
                  <th scope="col" className={`${TH} w-10`}>
                    <input
                      type="checkbox"
                      className={CHECKBOX}
                      aria-label="Select all selectable records on this page"
                      checked={pageAllSelected}
                      disabled={pageSelectable.length === 0}
                      onChange={() =>
                        pageAllSelected ? removeKeys(pageSelectable.map((r) => r.key)) : addKeys(pageSelectable.map((r) => r.key))
                      }
                    />
                  </th>
                  <th scope="col" className={TH}>Name</th>
                  <th scope="col" className={TH}>Type</th>
                  <th scope="col" className={TH}>Company</th>
                  <th scope="col" className={TH}>Email</th>
                  <th scope="col" className={TH}>On this project</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pageRows.map((r) => {
                  const selectable = isSelectable(r)
                  const checked = selectedSet.has(r.key)
                  return (
                    <tr key={r.key} className={checked ? 'bg-link-soft/60' : selectable ? 'hover:bg-muted/40' : 'text-muted-foreground'}>
                      <td className={TD}>
                        <input
                          type="checkbox"
                          className={CHECKBOX}
                          aria-label={`Select ${r.name}`}
                          checked={checked}
                          disabled={!selectable}
                          onChange={() => toggle(r.key)}
                        />
                      </td>
                      <td className={`${TD} font-medium`}>
                        <span className="flex items-center gap-2">
                          <KindIcon kind={r.kind} />
                          {r.name}
                        </span>
                      </td>
                      <td className={TD}>{r.kind === 'person' ? 'Person' : 'Company'}</td>
                      <td className={`${TD} text-muted-foreground`}>
                        {r.kind === 'person' ? (
                          r.affiliations.length ? (
                            r.affiliations.map((a) => a.company_name).join(', ')
                          ) : (
                            <Dash />
                          )
                        ) : (
                          `${r.peopleCount} ${r.peopleCount === 1 ? 'person' : 'people'} in directory`
                        )}
                      </td>
                      <td className={`${TD} max-w-56 truncate text-muted-foreground`}>{r.email ?? <Dash />}</td>
                      <td className={TD}>
                        {r.assigned ? (
                          <SemanticBadge tone="neutral">Already assigned</SemanticBadge>
                        ) : r.disabledReason ? (
                          <span className="flex items-start gap-1.5 text-xs">
                            <CircleMinus className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                            {r.disabledReason}
                          </span>
                        ) : (
                          <Dash />
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <nav aria-label="Directory pages" className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{`Page ${currentPage} of ${pageCount}`}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>
                Next
              </Button>
            </div>
          </nav>
        )}
      </section>

      <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <p className="text-sm" aria-live="polite">
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Nothing selected</span>
          ) : (
            <>
              <span className="font-semibold">{`${selected.length} selected`}</span>
              <span className="text-muted-foreground">{` · ${peopleSelected} ${peopleSelected === 1 ? 'person' : 'people'}, ${companiesSelected} ${companiesSelected === 1 ? 'company' : 'companies'}`}</span>
            </>
          )}
          {overLimit && <span className="ml-2 text-destructive">{`Select ${MAX_BULK_ASSIGN} or fewer at a time.`}</span>}
        </p>
        <div className="flex gap-2">
          {selected.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear selection
            </Button>
          )}
          <Button size="sm" disabled={selected.length === 0 || overLimit} onClick={() => setStep('review')}>
            <CheckCircle2 data-icon="inline-start" />
            Review
          </Button>
        </div>
      </div>
    </div>
  )
}
