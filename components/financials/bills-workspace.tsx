'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Clock, FileText, Plus, Receipt, Wallet } from 'lucide-react'
import { approveVendorBillAction, reverseVendorPaymentAction, voidVendorBillAction } from '@/app/actions/vendor-bills'
import { getDocumentFileUrl } from '@/app/actions/documents'
import { formatMoney } from '@/lib/financials'
import { formatDate, formatDateTime } from '@/lib/format'
import { BILL_STATUS_LABELS, PAYMENT_METHODS, type BillDisplayStatus, type BillsOverview } from '@/lib/vendor-bills'
import type { BillRecord, CommitmentRecord } from '@/lib/vendor-bills-data'
import { SummaryStrip } from '@/components/shared/summary-strip'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { EmptyState } from '@/components/shared/page-header'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { BillForm, PaymentForm } from './vendor-cost-forms'

export const BILL_TONE: Record<BillDisplayStatus, SemanticTone> = {
  draft: 'pending',
  approved: 'info',
  partially_paid: 'cobalt',
  paid: 'success',
  overdue: 'danger',
  voided: 'neutral',
}

const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<string, string>

type Panel = { kind: 'new' } | { kind: 'view'; id: string } | { kind: 'edit'; id: string } | { kind: 'pay'; id: string } | null
const SHEET_CLASS = 'w-full gap-0 p-0 data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl'

export function BillsWorkspace({
  projectId,
  projectName,
  bills,
  commitments,
  overview,
  vendors,
  today,
}: {
  projectId: string
  projectName: string
  bills: BillRecord[]
  commitments: CommitmentRecord[]
  overview: BillsOverview
  vendors: string[]
  today: string
}) {
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>(null)
  const close = useCallback(() => setPanel(null), [])
  const saved = useCallback(() => {
    setPanel(null)
    router.refresh()
  }, [router])
  const selected = panel && panel.kind !== 'new' ? bills.find((b) => b.id === panel.id) ?? null : null

  return (
    <div className="flex flex-col gap-6">
      <SummaryStrip
        id="bills-overview"
        scope="Vendor bills"
        helpLabel="About vendor bills"
        help="Approved bills count as billed cost in the budget. Bills awaiting approval are not counted yet."
        stats={[
          { key: 'awaiting', icon: Clock, tone: 'amber', label: 'Awaiting approval', value: String(overview.awaitingApprovalCount), note: overview.awaitingApprovalCount === 1 ? 'bill' : 'bills' },
          { key: 'unpaid', icon: Wallet, tone: 'blue', label: 'Unpaid balance', value: formatMoney(overview.unpaidCents), note: 'approved, not yet paid' },
          { key: 'overdue', icon: AlertTriangle, tone: overview.overdueCount > 0 ? 'danger' : 'neutral', label: 'Overdue', value: formatMoney(overview.overdueCents), note: `${overview.overdueCount} past due` },
          { key: 'paid', icon: CheckCircle2, tone: 'green', label: 'Paid to vendors', value: formatMoney(overview.paidCents), note: 'recorded payments' },
        ]}
      />

      <section aria-labelledby="bills-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="bills-heading" className="type-section-title text-foreground">
            Bills
          </h2>
          <Button className="md:h-10" onClick={() => setPanel({ kind: 'new' })}>
            <Plus className="size-4" aria-hidden="true" />
            Add bill
          </Button>
        </div>

        {bills.length === 0 ? (
          <EmptyState icon={Receipt} title="No vendor bills yet" description="Add a bill when a subcontractor or supplier invoices you. Attach a photo of the invoice from your phone." />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            {bills.map((bill) => (
              <li key={bill.id}>
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'view', id: bill.id })}
                  className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate font-medium text-foreground">{bill.vendorName}</span>
                    <span className="truncate text-sm text-muted-foreground">
                      {[bill.billNumber ? `#${bill.billNumber}` : null, bill.description, bill.category].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4 sm:justify-end">
                    <span className="text-sm text-muted-foreground">{bill.dueDate ? `Due ${formatDate(bill.dueDate)}` : formatDate(bill.billDate)}</span>
                    <SemanticBadge tone={BILL_TONE[bill.status]}>{BILL_STATUS_LABELS[bill.status]}</SemanticBadge>
                    <span className="flex min-w-28 flex-col items-end">
                      <span className="font-semibold tabular-nums text-foreground">{formatMoney(bill.amountCents)}</span>
                      {bill.status !== 'voided' && bill.status !== 'draft' && bill.balanceCents > 0 && bill.paidCents > 0 && (
                        <span className="text-xs tabular-nums text-muted-foreground">{formatMoney(bill.balanceCents)} left</span>
                      )}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Sheet open={panel !== null} onOpenChange={(open) => (open ? null : close())}>
        <SheetContent side="right" className={SHEET_CLASS}>
          {panel?.kind === 'new' && (
            <BillForm projectId={projectId} projectName={projectName} bill={null} commitments={commitments} vendors={vendors} today={today} onCancel={close} onSaved={saved} />
          )}
          {panel?.kind === 'edit' && selected && (
            <BillForm
              key={selected.id}
              projectId={projectId}
              projectName={projectName}
              bill={selected}
              commitments={commitments}
              vendors={vendors}
              today={today}
              onCancel={() => setPanel({ kind: 'view', id: selected.id })}
              onSaved={() => {
                setPanel({ kind: 'view', id: selected.id })
                router.refresh()
              }}
            />
          )}
          {panel?.kind === 'pay' && selected && (
            <PaymentForm
              key={selected.id}
              projectId={projectId}
              bill={selected}
              today={today}
              onCancel={() => setPanel({ kind: 'view', id: selected.id })}
              onSaved={() => {
                setPanel({ kind: 'view', id: selected.id })
                router.refresh()
              }}
            />
          )}
          {panel?.kind === 'view' && selected && (
            <BillDetail projectId={projectId} bill={selected} onEdit={() => setPanel({ kind: 'edit', id: selected.id })} onPay={() => setPanel({ kind: 'pay', id: selected.id })} />
          )}
          {panel && panel.kind !== 'new' && !selected && (
            <SheetHeader className="px-6 pt-6">
              <SheetTitle>Bill not found</SheetTitle>
              <SheetDescription>It may have been removed. Close this panel and refresh.</SheetDescription>
            </SheetHeader>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function BillDetail({ projectId, bill, onEdit, onPay }: { projectId: string; bill: BillRecord; onEdit: () => void; onPay: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [reasonFor, setReasonFor] = useState<{ kind: 'void' } | { kind: 'reverse'; paymentId: string } | null>(null)
  const isDraft = bill.status === 'draft'
  const isVoided = bill.status === 'voided'
  const canPay = !isDraft && !isVoided && bill.balanceCents > 0
  const activePayments = bill.payments.filter((p) => !p.reversedAt)

  function approve() {
    startTransition(async () => {
      const result = await approveVendorBillAction(projectId, bill.id)
      if (!result.ok) toast.error(result.error)
      else toast.success('Bill approved')
      router.refresh()
    })
  }

  const history = [
    { at: bill.createdAt, label: 'Bill entered' },
    ...(bill.approvedAt ? [{ at: bill.approvedAt, label: 'Approved' }] : []),
    ...bill.payments.flatMap((p) => [
      { at: p.createdAt, label: `Payment of ${formatMoney(p.amountCents)} recorded` },
      ...(p.reversedAt ? [{ at: p.reversedAt, label: `Payment of ${formatMoney(p.amountCents)} reversed${p.reversalReason ? `: ${p.reversalReason}` : ''}` }] : []),
    ]),
    ...(bill.voidedAt ? [{ at: bill.voidedAt, label: `Voided${bill.voidReason ? `: ${bill.voidReason}` : ''}` }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="gap-2 border-b border-border/70 px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <SheetTitle className="type-section-title text-foreground">{bill.vendorName}</SheetTitle>
          <SemanticBadge tone={BILL_TONE[bill.status]}>{BILL_STATUS_LABELS[bill.status]}</SemanticBadge>
        </div>
        <SheetDescription>{[bill.billNumber ? `Invoice #${bill.billNumber}` : 'No invoice number', bill.category].join(' · ')}</SheetDescription>
      </SheetHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        <dl className="grid grid-cols-3 gap-3 rounded-lg border border-border p-4">
          <div>
            <dt className="text-xs text-muted-foreground">Amount</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(bill.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Paid</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(bill.paidCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Balance</dt>
            <dd className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(bill.balanceCents)}</dd>
          </div>
        </dl>

        {isDraft && (
          <p className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
            Approve this bill to count it as billed cost and record payments against it.
          </p>
        )}

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <DetailItem label="Invoice date" value={formatDate(bill.billDate)} />
          <DetailItem label="Due date" value={formatDate(bill.dueDate)} />
          <DetailItem label="Description" value={bill.description ?? '—'} wide />
          <DetailItem label="Commitment" value={bill.commitmentLabel ?? 'Not linked'} wide />
          {bill.notes && <DetailItem label="Notes" value={bill.notes} wide />}
          <DetailItem
            label="Invoice copy"
            wide
            value={
              bill.attachment?.versionId ? (
                <button
                  type="button"
                  onClick={() => {
                    const versionId = bill.attachment!.versionId!
                    // Open synchronously so mobile browsers don't block the popup, then point it at the signed URL.
                    const win = window.open('', '_blank')
                    void getDocumentFileUrl(versionId, 'preview').then((r) => {
                      if (r.ok && win) win.location.href = r.data.url
                      else {
                        win?.close()
                        toast.error(r.ok ? 'Allow pop-ups to view the invoice.' : r.error)
                      }
                    })
                  }}
                  className="inline-flex items-center gap-1.5 font-medium text-link underline-offset-4 hover:underline"
                >
                  <FileText className="size-4" aria-hidden="true" />
                  {bill.attachment.name}
                </button>
              ) : (
                'None attached'
              )
            }
          />
        </dl>

        <section aria-labelledby="bill-payments" className="flex flex-col gap-2">
          <h3 id="bill-payments" className="text-sm font-semibold text-foreground">
            Payments
          </h3>
          {bill.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments recorded.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {bill.payments.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className={p.reversedAt ? 'text-muted-foreground line-through' : 'font-medium text-foreground'}>
                      {formatDate(p.paymentDate)} · {METHOD_LABEL[p.method] ?? p.method}
                      {p.reference ? ` #${p.reference}` : ''}
                    </span>
                    {p.reversedAt && <span className="text-xs text-muted-foreground">Reversed</span>}
                  </div>
                  <span className="tabular-nums text-foreground">{formatMoney(p.amountCents)}</span>
                  {!p.reversedAt && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReasonFor({ kind: 'reverse', paymentId: p.id })}>
                      Reverse
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="bill-history" className="flex flex-col gap-2">
          <h3 id="bill-history" className="text-sm font-semibold text-foreground">
            History
          </h3>
          <ol className="flex flex-col gap-2 border-l border-border pl-4">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-sm">
                <span className="text-foreground">{h.label}</span>
                <span className="block text-xs text-muted-foreground">{formatDateTime(h.at)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {!isVoided && (
        <SheetFooter className="mt-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
          {activePayments.length === 0 && (
            <Button type="button" variant="ghost" size="lg" className="text-destructive sm:mr-auto" onClick={() => setReasonFor({ kind: 'void' })} disabled={pending}>
              Void bill
            </Button>
          )}
          {isDraft && (
            <>
              <Button type="button" variant="outline" size="lg" onClick={onEdit} disabled={pending}>
                Edit
              </Button>
              <Button type="button" size="lg" onClick={approve} disabled={pending}>
                {pending ? 'Approving...' : 'Approve bill'}
              </Button>
            </>
          )}
          {canPay && (
            <Button type="button" size="lg" onClick={onPay}>
              Record payment
            </Button>
          )}
        </SheetFooter>
      )}

      <ReasonDialog
        open={reasonFor !== null}
        title={reasonFor?.kind === 'void' ? 'Void this bill?' : 'Reverse this payment?'}
        description={
          reasonFor?.kind === 'void'
            ? 'The bill stays in history but no longer counts toward billed cost.'
            : 'The payment stays in history and the bill balance goes back up. Use this to correct a mistaken entry.'
        }
        confirmLabel={reasonFor?.kind === 'void' ? 'Void bill' : 'Reverse payment'}
        onClose={() => setReasonFor(null)}
        onConfirm={async (reason) => {
          const target = reasonFor
          if (!target) return null
          const result = target.kind === 'void' ? await voidVendorBillAction(projectId, bill.id, reason) : await reverseVendorPaymentAction(projectId, target.paymentId, reason)
          if (!result.ok) return result.error
          toast.success(target.kind === 'void' ? 'Bill voided' : 'Payment reversed')
          setReasonFor(null)
          router.refresh()
          return null
        }}
      />
    </div>
  )
}

function DetailItem({ label, value, wide }: { label: string; value: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'sm:col-span-2' : undefined}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-foreground">{value}</dd>
    </div>
  )
}

function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  onClose: () => void
  onConfirm: (reason: string) => Promise<string | null>
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next || pending) return
        setReason('')
        setError(null)
        onClose()
      }}
    >
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (pending) return
            startTransition(async () => {
              const problem = await onConfirm(reason)
              setError(problem)
              if (!problem) setReason('')
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="reason-input">Reason</Label>
            <Textarea id="reason-input" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={500} required minLength={3} />
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 3}>
              {pending ? 'Saving...' : confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
