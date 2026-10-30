'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ClipboardCheck,
  FileText,
  History,
  Lock,
  ShieldCheck,
  ShieldX,
  Upload,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Surface } from '@/components/shared/page-header'
import { QualificationBadge } from '@/components/subcontractors/qualification-badge'
import { createClient } from '@/lib/supabase/client'
import { formatDate, formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  APPLICABILITY_LABELS,
  CATEGORIES,
  CATEGORY_LABELS,
  EVIDENCE_BUCKET,
  ITEM_STATE_LABELS,
  expiryLabel,
  expiryTier,
  primaryActionLabel,
  validateEvidenceFile,
  type EffectiveState,
  type QualificationSummary,
} from '@/lib/subcontractor-qualification'
import type { ChecklistItem, QualificationEvent } from '@/lib/subcontractor-qualification-data'
import {
  decideQualificationAction,
  discardEvidenceUpload,
  evidenceUrlAction,
  prepareEvidenceUpload,
  registerEvidenceAction,
  reviewItemAction,
  startVettingAction,
} from '@/app/actions/subcontractor-qualification'

type Props = {
  companyId: string
  companyName: string
  companyActive: boolean
  availability: 'ready' | 'setup-required' | 'error'
  summary: QualificationSummary | null
  items: ChecklistItem[]
  events: QualificationEvent[]
  isAdmin: boolean
  today: string
}

const EFFECTIVE_STYLES: Record<EffectiveState, { label: string; className: string }> = {
  satisfied: { label: 'Satisfied', className: 'bg-primary/10 text-primary' },
  awaiting_review: { label: 'Pending Review', className: 'bg-warning/15 text-warning-foreground' },
  rejected: { label: 'Needs Correction', className: 'bg-destructive/10 text-destructive' },
  expired: { label: 'Expired', className: 'bg-destructive/10 text-destructive' },
  missing: { label: 'Missing', className: 'bg-muted text-muted-foreground' },
}

export function QualificationSection(props: Props) {
  const { availability, summary, items, companyId, companyActive, isAdmin, today } = props
  const router = useRouter()
  const [starting, startTransition] = useTransition()
  const [uploadFor, setUploadFor] = useState<ChecklistItem | null>(null)
  const [reviewFor, setReviewFor] = useState<ChecklistItem | null>(null)
  const [decision, setDecision] = useState<'approved' | 'not_cleared' | null>(null)

  const status = summary?.status ?? 'not_started'
  const started = items.some((i) => i.itemId)

  function start() {
    startTransition(async () => {
      const result = await startVettingAction(companyId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.data.added > 0 ? `Checklist ready with ${result.data.added} items.` : 'Checklist is up to date.')
      router.refresh()
    })
  }

  const grouped = useMemo(
    () => CATEGORIES.map((c) => ({ category: c, items: items.filter((i) => i.category === c) })).filter((g) => g.items.length),
    [items],
  )

  return (
    <Surface id="qualification" aria-labelledby="qualification-heading" className="scroll-mt-20 gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="qualification-heading" className="font-serif text-lg font-semibold tracking-tight text-foreground">
              Qualification
            </h2>
            {availability === 'ready' && <QualificationBadge summary={summary} />}
          </div>
          <p className="text-sm text-muted-foreground">
            Verify insurance, licenses, tax, and agreements before relying on this subcontractor.
          </p>
        </div>
        {availability === 'ready' && started && (
          <Button variant="outline" size="sm" onClick={start} disabled={starting}>
            <ClipboardCheck data-icon="inline-start" />
            {starting ? 'Syncing…' : 'Sync checklist'}
          </Button>
        )}
      </div>

      {availability === 'setup-required' ? (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          Subcontractor vetting is not set up in this environment yet. Company details and project assignments are unaffected.
        </p>
      ) : availability === 'error' ? (
        <p className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          Qualification could not be loaded. Refresh the page to try again.
        </p>
      ) : !started ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed px-4 py-5">
          <p className="text-sm text-muted-foreground text-pretty">
            {"Vetting hasn't started. Starting creates this company's checklist from your requirements. Nothing is marked verified until a reviewer checks the evidence."}
          </p>
          <Button onClick={start} disabled={starting}>
            <ShieldCheck data-icon="inline-start" />
            {starting ? 'Starting…' : primaryActionLabel('not_started')}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5 border-t pt-4">
          {summary && <ProgressSummary summary={summary} today={today} />}

          {grouped.map((g) => (
            <section key={g.category} aria-labelledby={`cat-${g.category}`} className="flex flex-col gap-2">
              <h3 id={`cat-${g.category}`} className="text-sm font-semibold text-foreground">
                {CATEGORY_LABELS[g.category]}
              </h3>
              <ul className="flex flex-col divide-y rounded-lg border">
                {g.items.map((item) => (
                  <ChecklistRow
                    key={item.requirementId}
                    item={item}
                    today={today}
                    isAdmin={isAdmin}
                    onUpload={() => setUploadFor(item)}
                    onReview={() => setReviewFor(item)}
                  />
                ))}
              </ul>
            </section>
          ))}

          {isAdmin && summary && (
            <DecisionPanel summary={summary} companyActive={companyActive} onDecide={setDecision} />
          )}

          <HistoryList events={props.events} />
        </div>
      )}

      {uploadFor && (
        <UploadDialog companyId={companyId} item={uploadFor} onClose={() => setUploadFor(null)} onDone={() => router.refresh()} />
      )}
      {reviewFor && (
        <ReviewDialog companyId={companyId} item={reviewFor} onClose={() => setReviewFor(null)} onDone={() => router.refresh()} />
      )}
      {decision && summary && (
        <DecisionDialog
          companyId={companyId}
          companyName={props.companyName}
          outcome={decision}
          criteriaMet={summary.criteria_met}
          onClose={() => setDecision(null)}
          onDone={() => router.refresh()}
        />
      )}
    </Surface>
  )
}

function ProgressSummary({ summary: s, today }: { summary: QualificationSummary; today: string }) {
  const pct = s.mandatory_total ? Math.round((s.mandatory_satisfied / s.mandatory_total) * 100) : 0
  const facts = [
    s.awaiting_review_count ? `${s.awaiting_review_count} awaiting review` : null,
    s.rejected_count ? `${s.rejected_count} need correction` : null,
    s.expired_count ? `${s.expired_count} expired` : null,
    s.missing_count ? `${s.missing_count} missing` : null,
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-foreground">
          {s.mandatory_satisfied} of {s.mandatory_total} mandatory items satisfied
        </span>
        {s.next_expiration && (
          <span className={cn('text-xs', expiryTier(s.next_expiration, today) ? 'text-warning-foreground' : 'text-muted-foreground')}>
            Next expiration {formatDate(s.next_expiration)}
          </span>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label="Mandatory items satisfied"
      >
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      {facts.length > 0 && <p className="text-xs text-muted-foreground">{facts.join(' · ')}</p>}
      {s.decision_outcome && s.decision_at && (
        <p className="text-xs text-muted-foreground">
          {s.decision_outcome === 'approved' ? 'Approved' : 'Marked Not Cleared'} on {formatDate(s.decision_at)}
          {s.decision_template_version !== null && s.decision_template_version !== s.template_version
            ? ' · requirements have changed since this decision'
            : ''}
        </p>
      )}
    </div>
  )
}

function ChecklistRow({
  item,
  today,
  isAdmin,
  onUpload,
  onReview,
}: {
  item: ChecklistItem
  today: string
  isAdmin: boolean
  onUpload: () => void
  onReview: () => void
}) {
  const style = EFFECTIVE_STYLES[item.effective]
  const tier = item.expirationDate ? expiryTier(item.expirationDate, today) : null
  const locked = item.restricted && !isAdmin
  const current = item.evidence[0]
  return (
    <li className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-start md:justify-between md:gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{item.title}</span>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', style.className)}>{style.label}</span>
          <span className="text-[11px] text-muted-foreground">{APPLICABILITY_LABELS[item.applicability]}</span>
          {item.restricted && (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="size-3" aria-hidden="true" />
              Admin only
            </span>
          )}
        </div>
        {item.guidance && <p className="text-xs text-muted-foreground text-pretty">{item.guidance}</p>}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {item.expirationDate && (
            <span className={cn(tier === 'expired' && 'text-destructive', (tier === '7' || tier === '14') && 'text-warning-foreground')}>
              {expiryLabel(item.expirationDate, today)} ({formatDate(item.expirationDate)})
            </span>
          )}
          {item.issuingAuthority && <span>{item.issuingAuthority}</span>}
          {item.referenceNumber && <span className="font-mono">#{item.referenceNumber}</span>}
          {item.reviewedAt && (
            <span>
              Reviewed {formatDate(item.reviewedAt)}
              {item.reviewedByName ? ` by ${item.reviewedByName}` : ''}
            </span>
          )}
        </div>
        {item.state === 'rejected' && item.rejectionReason && (
          <p className="text-xs text-destructive">Correction needed: {item.rejectionReason}</p>
        )}
        {item.state === 'not_applicable' && item.notApplicableReason && (
          <p className="text-xs text-muted-foreground">Not applicable: {item.notApplicableReason}</p>
        )}
        {current && <EvidenceLink evidenceId={current.id} filename={current.original_filename} version={current.version_number} count={item.evidence.length} />}
      </div>
      {!locked && item.itemId && (
        <div className="flex shrink-0 gap-2">
          {item.state !== 'verified' && item.state !== 'not_applicable' && (
            <Button variant="outline" size="sm" onClick={onUpload}>
              <Upload data-icon="inline-start" />
              {item.evidence.length ? 'Replace' : 'Upload'}
            </Button>
          )}
          <Button variant={item.state === 'submitted' ? 'default' : 'ghost'} size="sm" onClick={onReview}>
            {item.state === 'verified' || item.state === 'not_applicable' ? 'Reopen' : 'Review'}
          </Button>
        </div>
      )}
    </li>
  )
}

function EvidenceLink({ evidenceId, filename, version, count }: { evidenceId: string; filename: string; version: number; count: number }) {
  const [pending, startTransition] = useTransition()
  function open() {
    startTransition(async () => {
      const result = await evidenceUrlAction(evidenceId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      window.open(result.data.url, '_blank', 'noopener,noreferrer')
    })
  }
  return (
    <button
      type="button"
      onClick={open}
      disabled={pending}
      className="inline-flex w-fit max-w-full items-center gap-1.5 text-xs text-primary underline-offset-4 hover:underline disabled:opacity-60"
    >
      <FileText className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate">{filename}</span>
      <span className="text-muted-foreground">
        v{version}
        {count > 1 ? ` of ${count}` : ''}
      </span>
    </button>
  )
}

function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function UploadDialog({
  companyId,
  item,
  onClose,
  onDone,
}: {
  companyId: string
  item: ChecklistItem
  onClose: () => void
  onDone: () => void
}) {
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current || !item.itemId) return
    const form = new FormData(e.currentTarget)
    if (!file) return setError('Choose a file to upload.')
    const invalid = validateEvidenceFile(file)
    if (invalid) return setError(invalid)
    const expirationDate = String(form.get('expiration_date') ?? '')
    if (item.expirationTracked && !expirationDate) return setError('Enter the expiration date shown on the document.')
    inFlight.current = true
    setError(null)
    startTransition(async () => {
      let uploadedPath: string | null = null
      try {
        const prepared = await prepareEvidenceUpload({ companyId, itemId: item.itemId!, contentType: file.type, size: file.size })
        if (!prepared.ok) return setError(prepared.error)
        const { error: uploadError } = await createClient()
          .storage.from(EVIDENCE_BUCKET)
          .upload(prepared.data.path, file, { contentType: file.type, upsert: false })
        if (uploadError) return setError('The file could not be uploaded. Nothing was saved. Try again.')
        uploadedPath = prepared.data.path
        const result = await registerEvidenceAction({
          companyId,
          path: uploadedPath,
          originalFilename: file.name,
          effectiveDate: String(form.get('effective_date') ?? ''),
          expirationDate,
          referenceNumber: String(form.get('reference_number') ?? ''),
          issuingAuthority: String(form.get('issuing_authority') ?? ''),
          notes: String(form.get('notes') ?? ''),
        })
        if (!result.ok) {
          await discardEvidenceUpload(uploadedPath)
          return setError(result.error)
        }
        toast.success(`Version ${result.data.versionNumber} submitted for review.`)
        onClose()
        onDone()
      } catch {
        if (uploadedPath) await discardEvidenceUpload(uploadedPath).catch(() => {})
        setError('Something went wrong. Nothing was saved. Try again.')
      } finally {
        inFlight.current = false
      }
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Upload evidence</DialogTitle>
            <DialogDescription>
              {item.title}. Uploading submits the file for review; it does not mark the item verified.
            </DialogDescription>
          </DialogHeader>
          <Field id="evidence-file" label="File" hint="PDF, PNG, JPEG, or WebP up to 25 MB.">
            <Input
              id="evidence-file"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="effective_date" label="Effective date">
              <Input id="effective_date" name="effective_date" type="date" />
            </Field>
            <Field id="expiration_date" label={item.expirationTracked ? 'Expiration date (required)' : 'Expiration date'}>
              <Input id="expiration_date" name="expiration_date" type="date" required={item.expirationTracked} />
            </Field>
          </div>
          {!item.restricted && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field id="reference_number" label="Policy or license number">
                <Input id="reference_number" name="reference_number" maxLength={80} autoComplete="off" />
              </Field>
              <Field id="issuing_authority" label="Issuer or carrier">
                <Input id="issuing_authority" name="issuing_authority" maxLength={160} />
              </Field>
            </div>
          )}
          {item.restricted && (
            <p className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Restricted document. Only administrators can open it. Do not type tax identifiers into any field.
            </p>
          )}
          <Field id="notes" label="Notes">
            <Textarea id="notes" name="notes" maxLength={2000} rows={2} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Uploading…' : 'Submit for review'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type ReviewDecision = 'verified' | 'rejected' | 'not_applicable' | 'reopen'

function ReviewDialog({
  companyId,
  item,
  onClose,
  onDone,
}: {
  companyId: string
  item: ChecklistItem
  onClose: () => void
  onDone: () => void
}) {
  const reopening = item.state === 'verified' || item.state === 'not_applicable'
  const options: { value: ReviewDecision; label: string; disabled?: boolean }[] = reopening
    ? [{ value: 'reopen', label: 'Reopen for review' }]
    : [
        { value: 'verified', label: 'Verify', disabled: item.evidenceRequired && !item.evidence.length },
        { value: 'rejected', label: 'Needs correction' },
        ...(item.applicability !== 'required' ? [{ value: 'not_applicable' as const, label: 'Not applicable' }] : []),
      ]
  const [choice, setChoice] = useState<ReviewDecision>(options.find((o) => !o.disabled)?.value ?? 'rejected')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const needsReason = choice === 'rejected' || choice === 'not_applicable' || choice === 'reopen'

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const reason = String(form.get('reason') ?? '').trim()
    if (needsReason && !reason) return setError('Enter a reason.')
    const expirationDate = String(form.get('expiration_date') ?? '')
    if (choice === 'verified' && item.expirationTracked && !expirationDate) {
      return setError('Confirm the expiration date before verifying.')
    }
    setError(null)
    startTransition(async () => {
      const result = await reviewItemAction({
        companyId,
        itemId: item.itemId!,
        decision: choice,
        reason,
        notes: String(form.get('notes') ?? ''),
        effectiveDate: String(form.get('effective_date') ?? ''),
        expirationDate,
        referenceNumber: item.restricted ? '' : String(form.get('reference_number') ?? ''),
        issuingAuthority: String(form.get('issuing_authority') ?? ''),
      })
      if (!result.ok) return setError(result.error)
      toast.success(`${item.title}: ${ITEM_STATE_LABELS[result.data.state as keyof typeof ITEM_STATE_LABELS] ?? 'updated'}.`)
      onClose()
      onDone()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{reopening ? 'Reopen item' : 'Review item'}</DialogTitle>
            <DialogDescription>{item.title}</DialogDescription>
          </DialogHeader>
          {item.evidence[0] && (
            <EvidenceLink
              evidenceId={item.evidence[0].id}
              filename={item.evidence[0].original_filename}
              version={item.evidence[0].version_number}
              count={item.evidence.length}
            />
          )}
          {!reopening && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">Decision</legend>
              <div className="flex flex-wrap gap-2">
                {options.map((o) => (
                  <label
                    key={o.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5',
                      o.disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    <input
                      type="radio"
                      name="decision"
                      value={o.value}
                      checked={choice === o.value}
                      disabled={o.disabled}
                      onChange={() => setChoice(o.value)}
                      className="accent-primary"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              {item.evidenceRequired && !item.evidence.length && (
                <p className="text-xs text-muted-foreground">Upload evidence before this item can be verified.</p>
              )}
            </fieldset>
          )}
          {choice === 'verified' && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="r-effective" label="Effective date">
                  <Input id="r-effective" name="effective_date" type="date" defaultValue={item.effectiveDate ?? ''} />
                </Field>
                <Field id="r-expiration" label={item.expirationTracked ? 'Expiration date (required)' : 'Expiration date'}>
                  <Input
                    id="r-expiration"
                    name="expiration_date"
                    type="date"
                    defaultValue={item.expirationDate ?? ''}
                    required={item.expirationTracked}
                  />
                </Field>
              </div>
              {!item.restricted && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="r-ref" label="Policy or license number">
                    <Input id="r-ref" name="reference_number" maxLength={80} defaultValue={item.referenceNumber ?? ''} />
                  </Field>
                  <Field id="r-issuer" label="Issuer or carrier">
                    <Input id="r-issuer" name="issuing_authority" maxLength={160} defaultValue={item.issuingAuthority ?? ''} />
                  </Field>
                </div>
              )}
            </>
          )}
          {needsReason && (
            <Field id="r-reason" label={choice === 'rejected' ? 'What needs to be corrected?' : 'Reason'}>
              <Textarea id="r-reason" name="reason" maxLength={1000} rows={2} required />
            </Field>
          )}
          <Field id="r-notes" label="Reviewer notes">
            <Textarea id="r-notes" name="notes" maxLength={2000} rows={2} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save review'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DecisionPanel({
  summary: s,
  companyActive,
  onDecide,
}: {
  summary: QualificationSummary
  companyActive: boolean
  onDecide: (outcome: 'approved' | 'not_cleared') => void
}) {
  return (
    <section aria-labelledby="decision-heading" className="flex flex-col gap-3 rounded-lg bg-muted/50 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <h3 id="decision-heading" className="text-sm font-semibold text-foreground">
          Final decision
        </h3>
        <p className="text-xs text-muted-foreground text-pretty">
          {s.criteria_met
            ? 'Every mandatory item is satisfied. An administrator can approve this subcontractor.'
            : 'Approval unlocks once every mandatory item is verified or marked not applicable.'}
          {!companyActive && ' The company is inactive, so it stays unavailable for new work regardless of qualification.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onDecide('approved')} disabled={!s.criteria_met || s.status === 'qualified'}>
          <ShieldCheck data-icon="inline-start" />
          Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDecide('not_cleared')} disabled={s.status === 'not_cleared'}>
          <ShieldX data-icon="inline-start" />
          Mark Not Cleared
        </Button>
      </div>
    </section>
  )
}

function DecisionDialog({
  companyId,
  companyName,
  outcome,
  criteriaMet,
  onClose,
  onDone,
}: {
  companyId: string
  companyName: string
  outcome: 'approved' | 'not_cleared'
  criteriaMet: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const approving = outcome === 'approved'

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const notes = String(new FormData(e.currentTarget).get('notes') ?? '').trim()
    if (!approving && !notes) return setError('Explain why this subcontractor is not cleared.')
    setError(null)
    startTransition(async () => {
      const result = await decideQualificationAction({ companyId, outcome, notes })
      if (!result.ok) return setError(result.error)
      toast.success(approving ? `${companyName} is Qualified.` : `${companyName} is Not Cleared.`)
      onClose()
      onDone()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{approving ? `Approve ${companyName}?` : `Mark ${companyName} Not Cleared?`}</DialogTitle>
            <DialogDescription>
              {approving
                ? 'This records your decision with the current requirements. If evidence later expires or is rejected, the status returns to Pending automatically.'
                : 'Existing project assignments are not removed. New assignments will show this status.'}
            </DialogDescription>
          </DialogHeader>
          {approving && !criteriaMet && (
            <p className="text-sm text-destructive">Some mandatory items are not satisfied yet.</p>
          )}
          <Field id="d-notes" label={approving ? 'Notes (optional)' : 'Reason'}>
            <Textarea id="d-notes" name="notes" maxLength={2000} rows={3} required={!approving} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={approving ? 'default' : 'destructive'} disabled={pending}>
              {pending ? 'Saving…' : approving ? 'Approve' : 'Mark Not Cleared'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const EVENT_LABELS: Record<string, string> = {
  vetting_started: 'Vetting started',
  checklist_synced: 'Checklist synced',
  evidence_submitted: 'Evidence submitted',
  verified: 'Verified',
  rejected: 'Marked needs correction',
  not_applicable: 'Marked not applicable',
  reopened: 'Reopened',
  approved: 'Approved',
  not_cleared: 'Marked Not Cleared',
  decision_cleared: 'Decision cleared',
  mode_changed: 'Assignment mode changed',
}

function HistoryList({ events }: { events: QualificationEvent[] }) {
  if (!events.length) return null
  return (
    <details className="group rounded-lg border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-foreground">
        <History className="size-4 text-primary" aria-hidden="true" />
        Vetting history
        <span className="ml-auto text-xs font-normal text-muted-foreground">{events.length} recent</span>
      </summary>
      <ol className="flex flex-col divide-y border-t">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <span className="min-w-0">
              <span className="font-medium text-foreground">{EVENT_LABELS[e.event] ?? e.event.replace(/_/g, ' ')}</span>
              {e.item_title && <span className="text-muted-foreground">{` · ${e.item_title}`}</span>}
              {e.detail && <span className="block text-xs text-muted-foreground">{e.detail}</span>}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {formatDateTime(e.created_at)}
              {e.actor_name ? ` · ${e.actor_name}` : ''}
            </span>
          </li>
        ))}
      </ol>
    </details>
  )
}
