'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Paperclip, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { createClient } from '@/lib/supabase/client'
import {
  declineQuoteAction,
  registerQuoteAttachmentAction,
  removeQuoteAttachmentAction,
  saveQuoteDraftAction,
  submitQuoteAction,
  type QuoteInput,
} from '@/app/actions/subcontract-quotes'
import { QUOTES_BUCKET, QUOTE_FILE_ACCEPT, QUOTE_MAX_FILE_BYTES, centsToInput, formatMoney, parseMoneyToCents, type QuoteRevision } from '@/lib/subcontract-quotes'

type Attachment = { id: string; file_name: string }
type Props = {
  requestId: string
  invitationId: string
  organizationId: string
  currency: string
  scopeVersion: number
  draft: QuoteRevision | null
  basis: QuoteRevision | null
  attachments: Attachment[]
}

const field = 'flex flex-col gap-1.5 text-sm'
const label = 'font-medium text-foreground'

function initialValues(r: QuoteRevision | null): QuoteInput {
  return {
    amount: centsToInput(r?.amount_cents),
    tax_treatment: r?.tax_treatment ?? '',
    tax_amount: centsToInput(r?.tax_amount_cents),
    tax_details: r?.tax_details ?? '',
    inclusions: r?.inclusions ?? '',
    exclusions: r?.exclusions ?? '',
    availability: r?.availability ?? '',
    allowances: r?.allowances ?? '',
    assumptions: r?.assumptions ?? '',
    alternates: (r?.alternates ?? []).map((a) => ({ description: a.description, amount: centsToInput(a.amount_cents) })),
    estimated_duration_days: r?.estimated_duration_days?.toString() ?? '',
    valid_until: r?.valid_until ?? '',
  }
}

export function QuoteForm(p: Props) {
  const router = useRouter()
  const [values, setValues] = useState<QuoteInput>(() => initialValues(p.draft ?? p.basis))
  const [revisionId, setRevisionId] = useState(p.draft?.id ?? null)
  const [rowVersion, setRowVersion] = useState(p.draft?.row_version ?? null)
  const [ack, setAck] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const idempotencyKey = useRef(crypto.randomUUID())
  const fileInput = useRef<HTMLInputElement>(null)

  const set = <K extends keyof QuoteInput>(k: K, v: QuoteInput[K]) => {
    setValues((s) => ({ ...s, [k]: v }))
    setNotice(null)
  }

  async function save() {
    setError(null)
    const r = await saveQuoteDraftAction(p.requestId, p.invitationId, rowVersion, values)
    if (!r.ok) {
      setError(r.error)
      return null
    }
    setRevisionId(r.revisionId)
    setRowVersion(r.rowVersion)
    return r
  }

  const amount = parseMoneyToCents(values.amount)
  const missing = [
    (amount === null || amount === 'invalid') && 'a valid amount',
    !values.tax_treatment && 'how tax is treated',
    !values.inclusions.trim() && 'inclusions',
    !values.exclusions.trim() && 'exclusions',
    !ack && `acknowledgement of scope v${p.scopeVersion}`,
  ].filter(Boolean) as string[]

  async function upload(files: FileList) {
    const saved = revisionId ? { revisionId } : await save()
    if (!saved) return
    const supabase = createClient()
    for (const file of Array.from(files)) {
      if (file.size > QUOTE_MAX_FILE_BYTES) {
        setError(`${file.name} is larger than 25 MB.`)
        continue
      }
      const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-120)
      const path = `${p.organizationId}/${p.invitationId}/${crypto.randomUUID()}-${safe}`
      const { error: upErr } = await supabase.storage.from(QUOTES_BUCKET).upload(path, file, { contentType: file.type || undefined })
      if (upErr) {
        setError(`${file.name} could not be uploaded.`)
        continue
      }
      const r = await registerQuoteAttachmentAction(p.requestId, saved.revisionId, { path, name: file.name.slice(0, 200), type: file.type, size: file.size })
      if (!r.ok) {
        await supabase.storage.from(QUOTES_BUCKET).remove([path])
        setError(r.error)
      }
    }
    router.refresh()
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          if (await save()) setNotice('Draft saved. Only your company can see it.')
        })
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={field}>
          <span className={label}>Base amount ({p.currency})</span>
          <Input inputMode="decimal" value={values.amount} onChange={(e) => set('amount', e.target.value)} placeholder="24500.00" aria-describedby="amount-preview" />
          <span id="amount-preview" className="text-xs text-muted-foreground">
            {amount === 'invalid' ? 'Use digits and up to two decimals.' : amount ? formatMoney(amount, p.currency) : 'Excludes alternates.'}
          </span>
        </label>
        <label className={field}>
          <span className={label}>Tax</span>
          <select
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            value={values.tax_treatment}
            onChange={(e) => set('tax_treatment', e.target.value as QuoteInput['tax_treatment'])}
          >
            <option value="">Choose…</option>
            <option value="included">Included in amount</option>
            <option value="excluded">Excluded (added on top)</option>
            <option value="not_applicable">No tax applies</option>
          </select>
        </label>
        {values.tax_treatment === 'excluded' ? (
          <label className={field}>
            <span className={label}>Tax amount ({p.currency})</span>
            <Input inputMode="decimal" value={values.tax_amount} onChange={(e) => set('tax_amount', e.target.value)} placeholder="Leave blank if unknown" />
          </label>
        ) : null}
        <label className={field}>
          <span className={label}>Tax details</span>
          <Input maxLength={1000} value={values.tax_details} onChange={(e) => set('tax_details', e.target.value)} placeholder="Optional" />
        </label>
      </div>

      <label className={field}>
        <span className={label}>Inclusions</span>
        <Textarea rows={4} maxLength={10000} value={values.inclusions} onChange={(e) => set('inclusions', e.target.value)} />
      </label>
      <label className={field}>
        <span className={label}>Exclusions</span>
        <Textarea rows={4} maxLength={10000} value={values.exclusions} onChange={(e) => set('exclusions', e.target.value)} />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className={field}>
          <span className={label}>Availability</span>
          <Input maxLength={1000} value={values.availability} onChange={(e) => set('availability', e.target.value)} placeholder="Can start week of Jun 8" />
        </label>
        <label className={field}>
          <span className={label}>Duration (days)</span>
          <Input inputMode="numeric" value={values.estimated_duration_days} onChange={(e) => set('estimated_duration_days', e.target.value.replace(/\D/g, '').slice(0, 4))} />
        </label>
        <label className={field}>
          <span className={label}>Valid until</span>
          <Input type="date" value={values.valid_until} onChange={(e) => set('valid_until', e.target.value)} />
        </label>
      </div>

      <label className={field}>
        <span className={label}>Allowances</span>
        <Textarea rows={2} maxLength={5000} value={values.allowances} onChange={(e) => set('allowances', e.target.value)} />
      </label>
      <label className={field}>
        <span className={label}>Assumptions</span>
        <Textarea rows={2} maxLength={5000} value={values.assumptions} onChange={(e) => set('assumptions', e.target.value)} />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-foreground">Alternates</legend>
        <p className="text-xs text-muted-foreground">Optional add or deduct prices. They are never added to the base amount.</p>
        {values.alternates.map((a, i) => (
          <div key={i} className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-1 text-sm">
              <span className="sr-only">Alternate {i + 1} description</span>
              <Input maxLength={500} value={a.description} placeholder="Upgrade to 50-year shingles" onChange={(e) => set('alternates', values.alternates.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
            </label>
            <label className="flex w-32 flex-col gap-1 text-sm">
              <span className="sr-only">Alternate {i + 1} amount</span>
              <Input inputMode="decimal" value={a.amount} placeholder="Amount" onChange={(e) => set('alternates', values.alternates.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            </label>
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove alternate ${i + 1}`} onClick={() => set('alternates', values.alternates.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        ))}
        {values.alternates.length < 25 ? (
          <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => set('alternates', [...values.alternates, { description: '', amount: '' }])}>
            <Plus className="size-4" aria-hidden="true" /> Add alternate
          </Button>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-foreground">Attachments</p>
        {p.attachments.length ? (
          <ul className="flex flex-col gap-1">
            {p.attachments.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-1.5 text-sm">
                <span className="break-all">{a.file_name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${a.file_name}`}
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await removeQuoteAttachmentAction(p.requestId, a.id)
                      if (!r.ok) setError(r.error)
                      else router.refresh()
                    })
                  }
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={QUOTE_FILE_ACCEPT}
          className="sr-only"
          aria-label="Attach quote files"
          onChange={(e) => {
            const files = e.target.files
            if (files?.length) start(() => upload(files))
            e.target.value = ''
          }}
        />
        <Button type="button" variant="outline" size="sm" className="self-start" disabled={pending} onClick={() => fileInput.current?.click()}>
          <Paperclip className="size-4" aria-hidden="true" /> Attach files
        </Button>
        <p className="text-xs text-muted-foreground">PDF, images, or spreadsheets up to 25 MB. The builder sees files only after you submit.</p>
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        <span>I have reviewed scope version {p.scopeVersion} and its documents, and this quote prices that version.</span>
      </label>

      {error ? (
        <p role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : null}
      {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="submit" variant="outline" disabled={pending} className="min-h-11">
          Save draft
        </Button>
        <Button
          type="button"
          className="min-h-11"
          disabled={pending || missing.length > 0}
          onClick={() =>
            start(async () => {
              const saved = await save()
              if (!saved) return
              const r = await submitQuoteAction(p.requestId, saved.revisionId, saved.rowVersion, idempotencyKey.current, p.scopeVersion)
              if (!r.ok) return setError(r.error)
              idempotencyKey.current = crypto.randomUUID()
              setRevisionId(null)
              setRowVersion(null)
              setAck(false)
              router.refresh()
            })
          }
        >
          {pending ? 'Working…' : 'Submit quote'}
        </Button>
        <Button type="button" variant="ghost" className="min-h-11 text-destructive" onClick={() => setDeclining((d) => !d)}>
          Decline to quote
        </Button>
      </div>
      {missing.length ? <p className="text-xs text-muted-foreground">To submit, add {missing.join(', ')}.</p> : null}

      {declining ? (
        <div className="flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <label className={field}>
            <span className={label}>Reason (shared with the builder)</span>
            <Textarea rows={2} maxLength={2000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <Button
            type="button"
            variant="destructive"
            className="self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await declineQuoteAction(p.requestId, p.invitationId, reason)
                if (!r.ok) setError(r.error)
                else router.refresh()
              })
            }
          >
            Confirm decline
          </Button>
        </div>
      ) : null}
    </form>
  )
}
