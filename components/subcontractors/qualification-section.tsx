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
  MailPlus,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  StickyNote,
  Upload,
} from 'lucide-react'
import { VettingStatusPanel, VettingStepper } from '@/components/subcontractors/vetting-progress'
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
  validateEvidenceFile,
  vettingStatusOf,
  type EffectiveState,
  type QualificationSummary,
} from '@/lib/subcontractor-qualification'
import type { ChecklistItem, QualificationEvent } from '@/lib/subcontractor-qualification-data'
import {
  addVettingNoteAction,
  decideQualificationAction,
  requestDocumentsAction,
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
  contactCount: number
}

type Outcome = 'approved' | 'conditional' | 'not_cleared'

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
  const [decision, setDecision] = useState<Outcome | null>(null)
  const [noteMode, setNoteMode] = useState<'request' | 'note' | null>(null)

  const vetting = vettingStatusOf(summary)
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
      ) : (
        <div className="flex flex-col gap-5 border-t pt-4">
          <div className="rounded-xl border bg-muted/20 px-4 py-5 sm:px-6">
            <VettingStepper summary={summary} />
          </div>

          <VettingStatusPanel summary={summary} today={today} contactCount={props.contactCount} />

          <div className="flex flex-wrap gap-2">
            {(vetting === 'new' || !started) && (
              <Button size="sm" onClick={start} disabled={starting}>
                <ShieldCheck data-icon="inline-start" />
                {starting ? 'Starting…' : 'Start vetting'}
              </Button>
            )}
            {vetting !== 'qualified' && vetting !== 'not_qualified' && (
              <Button size="sm" variant={vetting === 'new' ? 'outline' : 'default'} onClick={() => setNoteMode('request')}>
                <MailPlus data-icon="inline-start" />
                {summary?.requested_at ? 'Request again' : 'Request documents'}
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setNoteMode('note')}>
              <StickyNote data-icon="inline-start" />
              Add note
            </Button>
          </div>

          {!started && (
            <p className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground text-pretty">
              {"No checklist yet. Starting vetting creates this company's checklist from your requirements. Nothing is marked approved until a reviewer checks the evidence."}
            </p>
          )}

          {grouped.length > 0 && (
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Qualification checklist</h3>
          )}

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

          {isAdmin && summary && started && (
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
      {noteMode && (
        <NoteDialog
          companyId={companyId}
          companyName={props.companyName}
          mode={noteMode}
          onClose={() => setNoteMode(null)}
          onDone={() => router.refresh()}
        />
      )}
    </Surface>
  )
}

function NoteDialog({
  companyId,
  companyName,
  mode,
  onClose,
  onDone,
}: {
  companyId: string
  companyName: string
  mode: 'request' | 'note'
  onClose: () => void
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const requesting = mode === 'request'

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const notes = String(new FormData(e.currentTarget).get('notes') ?? '').trim()
    if (!requesting && !notes) return setError('Enter a note.')
    setError(null)
    startTransition(async () => {
      const result = requesting
        ? await requestDocumentsAction({ companyId, notes })
        : await addVettingNoteAction({ companyId, notes })
      if (!result.ok) return setError(result.error)
      toast.success(requesting ? 'Document request recorded.' : 'Note added to vetting history.')
      onClose()
      onDone()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{requesting ? `Request documents from ${companyName}` : 'Add vetting note'}</DialogTitle>
            <DialogDescription>
              {requesting
                ? 'Records that you asked for qualification documents and moves vetting to Requested. Send the request through your usual email or phone.'
                : 'Internal note. Visible to administrators and project managers in the vetting history.'}
            </DialogDescription>
          </DialogHeader>
          <Field id="n-notes" label={requesting ? 'What was requested (optional)' : 'Note'}>
            <Textarea id="n-notes" name="notes" maxLength={2000} rows={3} required={!requesting} />
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
              {pending ? 'Saving…' : requesting ? 'Record request' : 'Add note'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  onDecide: (outcome: Outcome) => void
}) {
  const v = vettingStatusOf(s)
  return (
    <section aria-labelledby="decision-heading" className="flex flex-col gap-3 rounded-lg bg-muted/50 px-4 py-3">
      <div className="flex flex-col gap-0.5">
        <h3 id="decision-heading" className="text-sm font-semibold text-foreground">
          Final decision
        </h3>
        <p className="text-xs text-muted-foreground text-pretty">
          {s.criteria_met
            ? 'Every required item is approved. An administrator can mark this subcontractor Qualified.'
            : 'Qualified unlocks once every required item is approved or marked not applicable. Conditional lets you approve with documented warnings.'}
          {!companyActive && ' The company is inactive, so it stays unavailable for new work regardless of qualification.'}
        </p>
        {s.decision_template_version !== null && s.decision_template_version !== s.template_version && (
          <p className="text-xs text-warning-foreground">Requirements changed since the last decision. Record a new one.</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onDecide('approved')} disabled={!s.criteria_met || v === 'qualified'}>
          <ShieldCheck data-icon="inline-start" />
          Mark as qualified
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDecide('conditional')} disabled={!s.started_at}>
          <ShieldAlert data-icon="inline-start" />
          Mark as conditional
        </Button>
        <Button size="sm" variant="outline" onClick={() => onDecide('not_cleared')} disabled={v === 'not_qualified'}>
          <ShieldX data-icon="inline-start" />
          Mark as not qualified
        </Button>
      </div>
    </section>
  )
}

const OUTCOME_COPY: Record<Outcome, { title: (n: string) => string; body: string; label: string; notes: string; done: (n: string) => string }> = {
  approved: {
    title: (n) => `Mark ${n} as Qualified?`,
    body: 'Records your decision with the current requirements. If a document later expires or is rejected, the status changes automatically.',
    label: 'Mark as qualified',
    notes: 'Notes (optional)',
    done: (n) => `${n} is Qualified and ready for work.`,
  },
  conditional: {
    title: (n) => `Mark ${n} as Conditional?`,
    body: 'The subcontractor can be used, but the warnings you record here stay visible on their profile until resolved.',
    label: 'Mark as conditional',
    notes: 'Conditions or warnings',
    done: (n) => `${n} is Conditional.`,
  },
  not_cleared: {
    title: (n) => `Mark ${n} as Not Qualified?`,
    body: 'Existing project assignments are not removed. New assignments will show this status.',
    label: 'Mark as not qualified',
    notes: 'Reason',
    done: (n) => `${n} is Not Qualified.`,
  },
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
  outcome: Outcome
  criteriaMet: boolean
  onClose: () => void
  onDone: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const approving = outcome === 'approved'
  const copy = OUTCOME_COPY[outcome]

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const notes = String(new FormData(e.currentTarget).get('notes') ?? '').trim()
    if (!approving && !notes) {
      return setError(outcome === 'conditional' ? 'Describe the conditions or warnings.' : 'Explain why this subcontractor is not qualified.')
    }
    setError(null)
    startTransition(async () => {
      const result = await decideQualificationAction({ companyId, outcome, notes })
      if (!result.ok) return setError(result.error)
      toast.success(copy.done(companyName))
      onClose()
      onDone()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{copy.title(companyName)}</DialogTitle>
            <DialogDescription>{copy.body}</DialogDescription>
          </DialogHeader>
          {approving && !criteriaMet && (
            <p className="text-sm text-destructive">Some required items are not approved yet.</p>
          )}
          <Field id="d-notes" label={copy.notes}>
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
            <Button type="submit" variant={outcome === 'not_cleared' ? 'destructive' : 'default'} disabled={pending}>
              {pending ? 'Saving…' : copy.label}
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
  not_cleared: 'Marked Not Qualified',
  decision_approved: 'Marked Qualified',
  decision_conditional: 'Marked Conditional',
  decision_not_cleared: 'Marked Not Qualified',
  documents_requested: 'Documents requested',
  note_added: 'Note',
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
