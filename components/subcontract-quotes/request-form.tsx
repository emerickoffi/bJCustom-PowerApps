'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ChevronDown, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { saveQuoteRequestDraftAction, sendQuoteRequestAction, type DraftInput } from '@/app/actions/subcontract-quotes'
import { QUOTE_TIMEZONES, formatDeadline, zonedLocalToIso } from '@/lib/subcontract-quotes'
import type { ActivityOption, CompanyOption, DocumentOption } from '@/lib/subcontract-quotes-data'

type DrawerOptions = {
  /** Rendered above the fields (e.g. the currency confirmation). */
  topSlot?: ReactNode
  /** Replaces the footer actions, e.g. with an unsaved-changes prompt. */
  footerOverride?: ReactNode
  onCancel: () => void
  onSent: () => void
  onDirtyChange: (dirty: boolean) => void
  onBusyChange: (busy: boolean) => void
  onReviewChange?: (reviewing: boolean) => void
}

type Props = {
  projectId: string
  requestId: string | null
  rowVersion: number | null
  currency: string | null
  initial: DraftInput
  companies: CompanyOption[]
  documents: DocumentOption[]
  activities: ActivityOption[]
  drawer?: DrawerOptions
}

const fieldClass = 'flex flex-col gap-1.5 text-sm'
const labelClass = 'font-medium text-foreground'
const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm'

export function RequestForm({ projectId, requestId, rowVersion, currency, initial, companies, documents, activities, drawer }: Props) {
  const router = useRouter()
  const [values, setValues] = useState<DraftInput>(initial)
  const [savedValues, setSavedValues] = useState<DraftInput>(initial)
  const [id, setId] = useState(requestId)
  const [version, setVersion] = useState(rowVersion)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, start] = useTransition()
  const inFlight = useRef(false)
  const isDrawer = Boolean(drawer)

  const dirty = JSON.stringify(values) !== JSON.stringify(savedValues)
  const onDirtyChange = drawer?.onDirtyChange
  const onBusyChange = drawer?.onBusyChange
  const onReviewChange = drawer?.onReviewChange
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])
  useEffect(() => onBusyChange?.(pending), [pending, onBusyChange])
  useEffect(() => onReviewChange?.(confirming), [confirming, onReviewChange])

  const set = <K extends keyof DraftInput>(key: K, value: DraftInput[K]) => {
    setValues((v) => ({ ...v, [key]: value }))
    setNotice(null)
  }
  const toggle = (key: 'company_ids' | 'document_ids', value: string) =>
    set(key, values[key].includes(value) ? values[key].filter((x) => x !== value) : [...values[key], value])

  // Guards against a second click landing before the transition marks itself pending.
  function run(task: () => Promise<void>) {
    if (inFlight.current) return
    inFlight.current = true
    start(async () => {
      try {
        await task()
      } finally {
        inFlight.current = false
      }
    })
  }

  async function save(): Promise<{ id: string; version: number } | null> {
    setError(null)
    const snapshot = values
    const r = await saveQuoteRequestDraftAction(projectId, id, version, snapshot)
    if (!r.ok) {
      setError(r.error)
      return null
    }
    setId(r.id)
    setVersion(r.rowVersion)
    setSavedValues(snapshot)
    if (!id) {
      // The drawer stays on the list page; refreshing shows the new draft behind it.
      if (isDrawer) router.refresh()
      else router.replace(`/projects/${projectId}/subcontractor-work/quotes/${r.id}`)
    }
    return { id: r.id, version: r.rowVersion }
  }

  const sendNow = () =>
    run(async () => {
      const saved = await save()
      if (!saved) return setConfirming(false)
      const r = await sendQuoteRequestAction(projectId, saved.id, saved.version)
      if (!r.ok) {
        setError(r.error)
        setConfirming(false)
      } else if (drawer) {
        router.refresh()
        drawer.onSent()
      } else router.refresh()
    })

  const invited = companies.filter((c) => values.company_ids.includes(c.id))
  const deadlineIso = values.deadline_local ? zonedLocalToIso(values.deadline_local, values.deadline_timezone) : null
  const missing = [
    !values.scope.trim() && 'a scope of work',
    !invited.length && 'at least one invited company',
    !deadlineIso && 'a response deadline',
    !currency && 'a confirmed project currency',
  ].filter(Boolean) as string[]

  const titleTrade = (
    <div className="grid gap-4 md:grid-cols-2">
      <label className={fieldClass}>
        <span className={labelClass}>Title</span>
        <Input required maxLength={160} value={values.title} onChange={(e) => set('title', e.target.value)} placeholder="Roofing package" />
      </label>
      <label className={fieldClass}>
        <span className={labelClass}>Trade</span>
        <Input maxLength={80} value={values.trade} onChange={(e) => set('trade', e.target.value)} placeholder="Roofing" />
      </label>
    </div>
  )

  const scopeField = (
    <label className={fieldClass}>
      <span className={labelClass}>Scope of work</span>
      <Textarea
        rows={8}
        maxLength={20000}
        value={values.scope}
        onChange={(e) => set('scope', e.target.value)}
        placeholder="Describe exactly what is being priced: quantities, materials, site conditions, exclusions you expect."
      />
    </label>
  )

  const deadlineField = (
    <label className={fieldClass}>
      <span className={labelClass}>Response deadline</span>
      <Input type="datetime-local" value={values.deadline_local} onChange={(e) => set('deadline_local', e.target.value)} />
    </label>
  )
  const timezoneField = (
    <label className={fieldClass}>
      <span className={labelClass}>Deadline timezone</span>
      <select className={selectClass} value={values.deadline_timezone} onChange={(e) => set('deadline_timezone', e.target.value)}>
        {QUOTE_TIMEZONES.map((tz) => (
          <option key={tz} value={tz}>
            {tz.replace('_', ' ')}
          </option>
        ))}
      </select>
    </label>
  )
  const costCategoryField = (
    <label className={fieldClass}>
      <span className={labelClass}>Cost category</span>
      <Input maxLength={80} value={values.cost_category} onChange={(e) => set('cost_category', e.target.value)} placeholder="Optional" />
    </label>
  )
  const activityField = (
    <label className={fieldClass}>
      <span className={labelClass}>Schedule activity</span>
      <select className={selectClass} value={values.schedule_activity_id} onChange={(e) => set('schedule_activity_id', e.target.value)}>
        <option value="">None</option>
        {activities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </label>
  )
  const windowStartField = (
    <label className={fieldClass}>
      <span className={labelClass}>Work window start</span>
      <Input type="date" value={values.work_window_start} onChange={(e) => set('work_window_start', e.target.value)} />
    </label>
  )
  const windowEndField = (
    <label className={fieldClass}>
      <span className={labelClass}>Work window end</span>
      <Input type="date" value={values.work_window_end} onChange={(e) => set('work_window_end', e.target.value)} />
    </label>
  )

  const documentsField = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-foreground">Documents to issue</legend>
      <p className="text-xs text-muted-foreground">The current version of each document is pinned when you send. Later uploads do not change what invitees received.</p>
      {documents.length ? (
        <ul className={`grid gap-2 ${isDrawer ? 'sm:grid-cols-2' : 'md:grid-cols-2'}`}>
          {documents.map((d) => (
            <li key={d.id}>
              <label className="flex min-h-11 items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <input type="checkbox" className="size-4 accent-primary" checked={values.document_ids.includes(d.id)} onChange={() => toggle('document_ids', d.id)} />
                <span className="min-w-0 flex-1 break-words">{d.name}</span>
                <span className="text-xs text-muted-foreground">v{d.versionNumber}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No project documents yet.</p>
      )}
    </fieldset>
  )

  const companiesField = (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium text-foreground">Companies to invite</legend>
      {companies.length ? (
        <ul className={`grid gap-2 ${isDrawer ? 'sm:grid-cols-2' : 'md:grid-cols-2'}`}>
          {companies.map((c) => (
            <li key={c.id}>
              <label
                className={`flex min-h-11 items-start gap-3 rounded-md border px-3 py-2 text-sm ${c.blocked ? 'border-dashed border-border opacity-70' : 'border-border'}`}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  disabled={Boolean(c.blocked) && !values.company_ids.includes(c.id)}
                  checked={values.company_ids.includes(c.id)}
                  onChange={() => toggle('company_ids', c.id)}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="font-medium text-foreground">{c.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {c.trade} · {c.badge}
                  </span>
                  {c.blocked ? <span className="text-xs text-destructive">{c.blocked}</span> : null}
                  {c.warning ? <span className="text-xs text-warning">{c.warning}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No active subcontractor companies.</p>
      )}
    </fieldset>
  )

  const errorBox = error ? (
    <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {error}
    </p>
  ) : null
  const noticeLine = notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null

  const reviewList = (
    <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
      <li>
        {invited.length} {invited.length === 1 ? 'company' : 'companies'} will be notified: {invited.map((c) => c.name).join(', ')}
      </li>
      <li>Responses due {formatDeadline(deadlineIso, values.deadline_timezone)}</li>
      <li>{values.document_ids.length} document(s) pinned at their current version · amounts in {currency}</li>
      <li>After sending, scope changes create a new version that invitees must acknowledge.</li>
    </ul>
  )

  const saveDraft = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      if (await save()) setNotice('Draft saved.')
    })
  }

  if (drawer) {
    return (
      <form className="flex min-h-0 flex-1 flex-col" onSubmit={saveDraft} aria-busy={pending}>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {confirming ? (
            <section aria-labelledby="quote-review-heading" className="flex flex-col gap-5">
              <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <h3 id="quote-review-heading" className="text-sm font-semibold text-foreground">
                  Send this request?
                </h3>
                {reviewList}
              </div>
              <dl className="flex flex-col gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <dt className="font-medium text-foreground">Title</dt>
                  <dd className="break-words text-muted-foreground">
                    {[values.title, values.trade].filter((v) => v.trim()).join(' · ') || 'Untitled'}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="font-medium text-foreground">Scope of work</dt>
                  <dd className="whitespace-pre-wrap break-words text-muted-foreground">{values.scope}</dd>
                </div>
              </dl>
              {errorBox}
            </section>
          ) : (
            <div className="flex flex-col gap-5">
              {drawer.topSlot}
              {titleTrade}
              {scopeField}
              {documentsField}
              <div className="grid gap-4 sm:grid-cols-2">
                {deadlineField}
                {timezoneField}
              </div>
              {companiesField}
              <details className="group rounded-lg border border-border">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-panel px-3 text-sm font-medium text-foreground hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
                  <span>
                    More details <span className="font-normal text-muted-foreground">(optional)</span>
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
                </summary>
                <div className="flex flex-col gap-4 border-t border-border p-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    {costCategoryField}
                    {activityField}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {windowStartField}
                    {windowEndField}
                  </div>
                </div>
              </details>
              {errorBox}
              {noticeLine}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-popover px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          {drawer.footerOverride ??
            (confirming ? (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Back to edit
                </Button>
                <Button type="button" disabled={pending} onClick={sendNow}>
                  <Send className="size-4" aria-hidden="true" />
                  {pending ? 'Sending…' : 'Confirm and send'}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {missing.length ? <p className="text-xs text-muted-foreground">To send, add {missing.join(', ')}.</p> : null}
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={pending} onClick={drawer.onCancel} className="mr-auto">
                    Cancel
                  </Button>
                  <Button type="submit" variant="outline" disabled={pending}>
                    {pending ? 'Saving…' : 'Save draft'}
                  </Button>
                  <Button
                    type="button"
                    disabled={pending || missing.length > 0}
                    onClick={() => {
                      setError(null)
                      setConfirming(true)
                    }}
                  >
                    <Send className="size-4" aria-hidden="true" />
                    Review &amp; send
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </form>
    )
  }

  return (
    <form className="flex flex-col gap-5" onSubmit={saveDraft}>
      {titleTrade}
      {scopeField}

      <div className="grid gap-4 md:grid-cols-3">
        {deadlineField}
        {timezoneField}
        {costCategoryField}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {activityField}
        {windowStartField}
        {windowEndField}
      </div>

      {documentsField}
      {companiesField}

      {errorBox}
      {noticeLine}

      {confirming ? (
        <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">Send this request?</p>
          {reviewList}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={sendNow}>
              <Send className="size-4" aria-hidden="true" />
              {pending ? 'Sending…' : 'Confirm and send'}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setConfirming(false)}>
              Keep editing
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? 'Saving…' : 'Save draft'}
          </Button>
          <Button type="button" disabled={pending || missing.length > 0} onClick={() => setConfirming(true)}>
            <Send className="size-4" aria-hidden="true" />
            Review and send
          </Button>
          {missing.length ? <p className="text-xs text-muted-foreground">To send, add {missing.join(', ')}.</p> : null}
        </div>
      )}
    </form>
  )
}
