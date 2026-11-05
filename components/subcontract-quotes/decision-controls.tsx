'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Info } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  addQuoteReviewNoteAction,
  createQuoteCommitmentAction,
  rejectQuoteAction,
  selectQuoteAction,
} from '@/app/actions/subcontract-quote-decisions'
import { SELECTION_DISCLAIMER, TAX_LABELS, centsToInput, formatMoney, parseMoneyToCents, type TaxTreatment } from '@/lib/subcontract-quotes'

function ErrorText({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null
}

export function ReviewNoteForm({ projectId, requestId, invitationId, revisionId }: { projectId: string; requestId: string; invitationId: string; revisionId: string | null }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Add private review note</span>
        <Textarea rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Visible to your team only." />
      </label>
      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !body.trim()}
          onClick={() =>
            start(async () => {
              const r = await addQuoteReviewNoteAction(projectId, requestId, invitationId, body, revisionId)
              if (!r.ok) setError(r.error)
              else {
                setBody('')
                setError(null)
                router.refresh()
              }
            })
          }
        >
          Save note
        </Button>
      </div>
      <ErrorText error={error} />
    </div>
  )
}

export function RejectQuoteButton({ projectId, requestId, invitationId, company }: { projectId: string; requestId: string; invitationId: string; company: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Reject quote
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject quote from {company}</DialogTitle>
            <DialogDescription>Only this company is affected. Other companies keep their current status.</DialogDescription>
          </DialogHeader>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Explanation for the company (optional)</span>
            <Textarea rows={3} maxLength={2000} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Shared with the company. Do not mention other bids." />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Private internal note (optional)</span>
            <Textarea rows={3} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Visible to your team only." />
          </label>
          <ErrorText error={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await rejectQuoteAction(projectId, requestId, invitationId, message, note)
                  if (!r.ok) setError(r.error)
                  else {
                    setOpen(false)
                    router.refresh()
                  }
                })
              }
            >
              Reject quote
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export type SelectCandidate = {
  revisionId: string
  company: string
  revisionNumber: number
  scopeVersion: number | null
  currentScope: number
  amountCents: number | null
  taxTreatment: TaxTreatment | null
  taxAmountCents: number | null
  payable: string | null
  qualification: string
  qualificationWarning: boolean
  expired: boolean
  validUntil: string | null
  blockers: string[]
}

export function SelectQuoteButton({ projectId, requestId, currency, c }: { projectId: string; requestId: string; currency: string | null; c: SelectCandidate }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [ack, setAck] = useState<Record<string, boolean>>({})
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const warnings = [
    c.qualificationWarning && { key: 'qualification', text: `Qualification status is “${c.qualification}”.` },
    c.expired && { key: 'expired', text: 'This quote is past its validity date. Confirm the price is still honored.' },
  ].filter(Boolean) as { key: string; text: string }[]
  const ready = confirmed && warnings.every((w) => ack[w.key]) && c.blockers.length === 0

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        Select quote
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select quote</DialogTitle>
            <DialogDescription>{SELECTION_DISCLAIMER}</DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-2 gap-3 rounded-md border border-border p-3 text-sm">
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Company</dt>
              <dd className="font-medium text-foreground">{c.company}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Revision</dt>
              <dd>Revision {c.revisionNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Scope version</dt>
              <dd>
                v{c.scopeVersion ?? '?'} {c.scopeVersion !== c.currentScope ? `(current v${c.currentScope})` : '(current)'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Base amount</dt>
              <dd className="tabular-nums">{formatMoney(c.amountCents, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Tax basis</dt>
              <dd>
                {c.taxTreatment ? TAX_LABELS[c.taxTreatment] : 'Not stated'}
                {c.taxTreatment === 'excluded' ? ` · ${c.taxAmountCents === null ? 'amount unknown' : formatMoney(c.taxAmountCents, currency)}` : ''}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Total payable</dt>
              <dd className="tabular-nums">{c.payable === null ? 'Not determinable' : formatMoney(c.payable, currency)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Qualification</dt>
              <dd>{c.qualification}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Valid until</dt>
              <dd>{c.validUntil ?? 'Not stated'}</dd>
            </div>
          </dl>

          {c.blockers.length ? (
            <ul className="flex flex-col gap-1.5 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {c.blockers.map((b) => (
                <li key={b} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {b}
                </li>
              ))}
            </ul>
          ) : null}

          {warnings.map((w) => (
            <label key={w.key} className="flex items-start gap-2 rounded-md bg-warning/10 p-3 text-sm text-foreground">
              <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={!!ack[w.key]} onChange={(e) => setAck((a) => ({ ...a, [w.key]: e.target.checked }))} />
              <span>
                {w.text} I acknowledge this warning.
              </span>
            </label>
          ))}

          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            One company per request. Other companies that submitted are marked Not selected and notified without any price or company names. This cannot be reversed in this release.
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
            <span>I confirm selecting this exact revision.</span>
          </label>
          <ErrorText error={error} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!ready || pending}
              onClick={() =>
                start(async () => {
                  const r = await selectQuoteAction(projectId, requestId, c.revisionId, confirmed, warnings.filter((w) => ack[w.key]).map((w) => w.key))
                  if (!r.ok) setError(r.error)
                  else {
                    setOpen(false)
                    router.refresh()
                  }
                })
              }
            >
              {pending ? 'Selecting…' : 'Select quote'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function CommitmentPanel({
  projectId,
  requestId,
  commitmentId,
  commitmentStatus,
  company,
  defaultDescription,
  defaultAmountCents,
  defaultCategory,
  categories,
  currency,
  projectCurrency,
}: {
  projectId: string
  requestId: string
  commitmentId: string | null
  commitmentStatus: string | null
  company: string
  defaultDescription: string
  defaultAmountCents: number | null
  defaultCategory: string
  categories: { label: string; options: string[] }[]
  currency: string
  projectCurrency: string | null
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(defaultCategory)
  const [description, setDescription] = useState(defaultDescription)
  const [amount, setAmount] = useState(centsToInput(defaultAmountCents))
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()

  if (commitmentId) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          A linked commitment exists{commitmentStatus ? ` (${commitmentStatus})` : ''}. It affects committed cost only once approved through job costing.
        </p>
        <Link href={`/projects/${projectId}/financials`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>
          View commitment
        </Link>
      </div>
    )
  }

  const mismatch = projectCurrency !== currency
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Optional. Creates one draft commitment for {company}, linked to the selected revision. It is not approved and does not change committed cost, budgets, invoices or payments until approved through job costing.
      </p>
      {!open ? (
        <div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={mismatch}>
            Create draft commitment
          </Button>
          {mismatch ? <p className="mt-2 text-sm text-warning">The project currency ({projectCurrency ?? 'not set'}) does not match the quote currency ({currency}).</p> : null}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Cost category (required)</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Choose a category</option>
              {categories.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Agreed amount ({currency})</span>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="font-medium">Description</span>
            <Input maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const cents = parseMoneyToCents(amount)
                  if (!cents || cents === 'invalid' || cents === '0') {
                    setError('Enter the agreed amount')
                    return
                  }
                  const r = await createQuoteCommitmentAction(projectId, requestId, category, description, cents)
                  if (!r.ok) setError(r.error)
                  else router.refresh()
                })
              }
            >
              {pending ? 'Creating…' : 'Create draft commitment'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
          <div className="md:col-span-2">
            <ErrorText error={error} />
          </div>
        </div>
      )}
    </div>
  )
}
