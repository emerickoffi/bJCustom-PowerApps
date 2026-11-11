'use client'

import { useActionState, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { recordVendorPaymentAction, saveCommitmentAction, saveVendorBillAction } from '@/app/actions/vendor-bills'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { formatMoney } from '@/lib/financials'
import { COST_CATEGORY_OPTIONS, PAYMENT_METHODS, centsToInput } from '@/lib/vendor-bills'
import type { BillRecord, CommitmentRecord } from '@/lib/vendor-bills-data'
import { SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { InvoiceAttachmentField } from './invoice-attachment-field'

const CATEGORY_OPTIONS = COST_CATEGORY_OPTIONS.map((c) => ({ value: c, label: c }))

/** Closes the drawer once the action reports a save; the key stays stable across retries so duplicates are ignored. */
function useSaved(state: ActionState, onSaved: () => void) {
  useEffect(() => {
    if (!state.savedId) return
    if (state.warning) toast.warning(state.warning)
    else if (state.success) toast.success(state.success)
    onSaved()
  }, [state, onSaved])
}

function DrawerHeader({ title, description }: { title: string; description: string }) {
  return (
    <SheetHeader className="gap-1 border-b border-border/70 px-6 pb-5 pt-6">
      <SheetTitle className="type-section-title text-foreground">{title}</SheetTitle>
      <SheetDescription className="truncate">{description}</SheetDescription>
    </SheetHeader>
  )
}

function VendorSuggestions({ id, vendors }: { id: string; vendors: string[] }) {
  return (
    <datalist id={id}>
      {vendors.map((v) => (
        <option key={v} value={v} />
      ))}
    </datalist>
  )
}

export function BillForm({
  projectId,
  projectName,
  bill,
  commitments,
  vendors,
  today,
  onCancel,
  onSaved,
}: {
  projectId: string
  projectName: string
  bill: BillRecord | null
  commitments: CommitmentRecord[]
  vendors: string[]
  today: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, action] = useActionState(saveVendorBillAction, initialActionState)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [uploading, setUploading] = useState(false)
  const v = state.values
  const fe = state.fieldErrors ?? {}
  const [vendor, setVendor] = useState(v?.vendor_name ?? bill?.vendorName ?? '')
  const [commitmentId, setCommitmentId] = useState(v?.commitment_id ?? bill?.commitmentId ?? '')
  const [category, setCategory] = useState(v?.cost_category ?? bill?.category ?? '')
  const linkable = commitments.filter((c) => c.status === 'approved')
  const linked = linkable.find((c) => c.id === commitmentId)
  useSaved(state, onSaved)

  return (
    <form action={action} className="flex h-full min-h-0 flex-col">
      <DrawerHeader title={bill ? 'Edit bill' : 'Add bill'} description={projectName} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="bill_id" value={bill?.id ?? ''} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <FormMessage state={state.savedId ? {} : state} />
        <div className="flex flex-col gap-1.5">
          <TextField
            name="vendor_name"
            label="Vendor or subcontractor"
            required
            list="bill-vendor-suggestions"
            autoComplete="off"
            value={vendor}
            onChange={(e) => setVendor(e.target.value)}
            error={fe.vendor_name}
            maxLength={160}
          />
          <VendorSuggestions id="bill-vendor-suggestions" vendors={vendors} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField name="bill_number" label="Invoice number" defaultValue={v?.bill_number ?? bill?.billNumber ?? ''} error={fe.bill_number} maxLength={60} />
          <TextField
            name="amount"
            label="Amount"
            required
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={v?.amount ?? centsToInput(bill?.amountCents)}
            error={fe.amount}
          />
          <TextField name="bill_date" label="Invoice date" type="date" required defaultValue={v?.bill_date ?? bill?.billDate ?? today} error={fe.bill_date} />
          <TextField name="due_date" label="Due date" type="date" defaultValue={v?.due_date ?? bill?.dueDate ?? ''} error={fe.due_date} />
        </div>
        <TextAreaField
          name="description"
          label="What is this bill for?"
          required
          rows={2}
          maxLength={500}
          defaultValue={v?.description ?? bill?.description ?? ''}
          error={fe.description}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Commitment <span className="font-normal text-muted-foreground">(optional)</span>
            </span>
            <select
              name="commitment_id"
              value={commitmentId}
              onChange={(e) => {
                setCommitmentId(e.target.value)
                const c = linkable.find((x) => x.id === e.target.value)
                if (c) setCategory(c.category)
              }}
              aria-invalid={fe.commitment_id ? true : undefined}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:h-10"
            >
              <option value="">Not linked</option>
              {linkable.map((c) => (
                <option key={c.id} value={c.id}>
                  {`${c.vendorName} — ${c.description} (${formatMoney(c.remainingCents)} left)`}
                </option>
              ))}
            </select>
            {fe.commitment_id && <span className="text-xs text-destructive">{fe.commitment_id}</span>}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Cost category
              <span className="text-destructive" aria-hidden="true">
                {' *'}
              </span>
            </span>
            <select
              name="cost_category"
              required
              value={category}
              disabled={Boolean(linked)}
              onChange={(e) => setCategory(e.target.value)}
              aria-invalid={fe.cost_category ? true : undefined}
              className="h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-70 md:h-10"
            >
              <option value="" disabled>
                Choose a category
              </option>
              {CATEGORY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {linked && <input type="hidden" name="cost_category" value={category} />}
            {linked && <span className="text-xs text-muted-foreground">Matches the linked commitment.</span>}
            {fe.cost_category && <span className="text-xs text-destructive">{fe.cost_category}</span>}
          </label>
        </div>
        <InvoiceAttachmentField
          projectId={projectId}
          vendorName={vendor}
          initial={bill?.attachment ? { documentId: bill.attachment.documentId, name: bill.attachment.name } : null}
          error={fe.attachment_document_id}
          onBusyChange={setUploading}
        />
        <TextAreaField name="notes" label="Notes" rows={2} maxLength={2000} defaultValue={v?.notes ?? bill?.notes ?? ''} error={fe.notes} />
      </div>

      <SheetFooter className="mt-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton name="intent" value="draft" variant="outline" pendingLabel="Saving..." disabled={uploading}>
          Save for approval
        </SubmitButton>
        <SubmitButton name="intent" value="approve" pendingLabel="Saving..." disabled={uploading}>
          Save and approve
        </SubmitButton>
      </SheetFooter>
    </form>
  )
}

export function PaymentForm({
  projectId,
  bill,
  today,
  onCancel,
  onSaved,
}: {
  projectId: string
  bill: BillRecord
  today: string
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, action] = useActionState(recordVendorPaymentAction, initialActionState)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const v = state.values
  const fe = state.fieldErrors ?? {}
  useSaved(state, onSaved)

  return (
    <form action={action} className="flex h-full min-h-0 flex-col">
      <DrawerHeader title="Record payment" description={`${bill.vendorName}${bill.billNumber ? ` · #${bill.billNumber}` : ''}`} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="bill_id" value={bill.id} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <p className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          Records a payment you have already made. Trefort does not send money.
        </p>
        <FormMessage state={state.savedId ? {} : state} />
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Bill</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatMoney(bill.amountCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Paid</dt>
            <dd className="font-medium tabular-nums text-foreground">{formatMoney(bill.paidCents)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Balance</dt>
            <dd className="font-semibold tabular-nums text-foreground">{formatMoney(bill.balanceCents)}</dd>
          </div>
        </dl>
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="amount"
            label="Payment amount"
            required
            inputMode="decimal"
            defaultValue={v?.amount ?? centsToInput(bill.balanceCents)}
            hint={`Up to ${formatMoney(bill.balanceCents)}`}
            error={fe.amount}
          />
          <TextField name="payment_date" label="Payment date" type="date" required defaultValue={v?.payment_date ?? today} error={fe.payment_date} />
          <SelectField
            name="method"
            label="Payment method"
            required
            placeholder="Choose a method"
            options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            defaultValue={v?.method ?? 'check'}
            error={fe.method}
          />
          <TextField name="reference" label="Check or reference number" defaultValue={v?.reference ?? ''} maxLength={120} error={fe.reference} />
        </div>
        <TextAreaField name="notes" label="Notes" rows={2} maxLength={1000} defaultValue={v?.notes ?? ''} error={fe.notes} />
      </div>

      <SheetFooter className="mt-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton pendingLabel="Recording...">Record payment</SubmitButton>
      </SheetFooter>
    </form>
  )
}

export function CommitmentForm({
  projectId,
  projectName,
  commitment,
  vendors,
  onCancel,
  onSaved,
}: {
  projectId: string
  projectName: string
  commitment: CommitmentRecord | null
  vendors: string[]
  onCancel: () => void
  onSaved: () => void
}) {
  const [state, action] = useActionState(saveCommitmentAction, initialActionState)
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const v = state.values
  const fe = state.fieldErrors ?? {}
  useSaved(state, onSaved)

  return (
    <form action={action} className="flex h-full min-h-0 flex-col">
      <DrawerHeader title={commitment ? 'Edit commitment' : 'Add commitment'} description={projectName} />
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="commitment_id" value={commitment?.id ?? ''} />
      <input type="hidden" name="idempotency_key" value={idempotencyKey} />

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-5">
        <p className="rounded-md bg-muted/50 px-3 py-2.5 text-sm text-muted-foreground">
          For purchase orders, supplier orders, rentals or agreements made outside a quote. Awarded quotes create their commitment automatically.
        </p>
        <FormMessage state={state.savedId ? {} : state} />
        <div className="flex flex-col gap-1.5">
          <TextField
            name="vendor_name"
            label="Vendor or subcontractor"
            required
            list="commitment-vendor-suggestions"
            autoComplete="off"
            defaultValue={v?.vendor_name ?? commitment?.vendorName ?? ''}
            error={fe.vendor_name}
            maxLength={160}
          />
          <VendorSuggestions id="commitment-vendor-suggestions" vendors={vendors} />
        </div>
        <TextAreaField
          name="description"
          label="What was committed?"
          required
          rows={2}
          maxLength={500}
          placeholder="e.g. Lumber package, excavator rental"
          defaultValue={v?.description ?? commitment?.description ?? ''}
          error={fe.description}
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            name="amount"
            label="Committed amount"
            required
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={v?.amount ?? centsToInput(commitment?.amountCents)}
            error={fe.amount}
          />
          <SelectField
            name="cost_category"
            label="Cost category"
            required
            placeholder="Choose a category"
            options={CATEGORY_OPTIONS}
            defaultValue={v?.cost_category ?? commitment?.category ?? ''}
            error={fe.cost_category}
          />
        </div>
        <TextAreaField name="notes" label="Notes" rows={2} maxLength={2000} defaultValue={v?.notes ?? commitment?.notes ?? ''} error={fe.notes} />
      </div>

      <SheetFooter className="mt-0 flex-col-reverse gap-2 border-t border-border/70 bg-muted/30 px-6 py-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <SubmitButton name="intent" value="draft" variant="outline" pendingLabel="Saving...">
          Save draft
        </SubmitButton>
        <SubmitButton name="intent" value="approve" pendingLabel="Saving...">
          Save and approve
        </SubmitButton>
      </SheetFooter>
    </form>
  )
}
