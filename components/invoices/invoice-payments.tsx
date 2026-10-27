'use client'

import { useActionState, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TextField, NativeSelect } from '@/components/shared/form-field'
import { recordPayment, reversePayment } from '@/app/actions/invoices'
import { initialActionState } from '@/lib/action-state'
import { formatCentsExact } from '@/lib/estimates'
import { formatDate } from '@/lib/format'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from '@/lib/invoices'
import type { InvoicePayment } from '@/lib/invoice-queries'

export function InvoicePayments({
  invoiceId,
  payments,
  balanceCents,
  canRecord,
}: {
  invoiceId: string
  payments: InvoicePayment[]
  balanceCents: number
  canRecord: boolean
}) {
  const [state, formAction, pending] = useActionState(recordPayment, initialActionState)
  const [formKey, setFormKey] = useState(0)
  const [lastSuccess, setLastSuccess] = useState<string | undefined>()
  if (state.success && state.success !== lastSuccess) {
    setLastSuccess(state.success)
    setFormKey((k) => k + 1)
  }
  const v = state.success ? undefined : state.values
  const fe = state.fieldErrors ?? {}
  const today = new Date().toISOString().slice(0, 10)

  return (
    <section aria-labelledby="payments-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="payments-heading" className="font-serif text-xl">
          Payments
        </h2>
        <p className="text-sm text-muted-foreground">
          Balance <span className="font-semibold tabular-nums text-foreground">{formatCentsExact(balanceCents)}</span>
        </p>
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {payments.map((p) => (
            <PaymentRow key={p.id} invoiceId={invoiceId} payment={p} canReverse={canRecord} />
          ))}
        </ul>
      )}

      {canRecord && balanceCents > 0 && (
        <form key={formKey} action={formAction} className="flex flex-col gap-4 border-t pt-5" noValidate>
          <h3 className="text-sm font-medium">Record a payment</h3>
          <input type="hidden" name="invoice_id" value={invoiceId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              name="amount"
              label="Amount ($)"
              inputMode="decimal"
              required
              defaultValue={v?.amount ?? (balanceCents / 100).toFixed(2)}
              error={fe.amount}
            />
            <TextField
              name="payment_date"
              label="Date received"
              type="date"
              required
              max={today}
              defaultValue={v?.payment_date ?? today}
              error={fe.payment_date}
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor="method" className="text-sm font-medium">
                Method<span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <NativeSelect id="method" name="method" defaultValue={v?.method ?? 'check'} aria-invalid={fe.method ? true : undefined}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </NativeSelect>
              {fe.method && <p className="text-xs text-destructive">{fe.method}</p>}
            </div>
            <TextField name="reference" label="Reference" placeholder="Check #1042" defaultValue={v?.reference ?? ''} error={fe.reference} />
            <TextField name="notes" label="Notes" defaultValue={v?.notes ?? ''} error={fe.notes} className="sm:col-span-2" />
          </div>
          {state.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}
          {state.success && (
            <p role="status" className="text-sm text-primary">
              {state.success}
            </p>
          )}
          <div>
            <Button type="submit" disabled={pending}>
              {pending ? 'Recording…' : 'Record payment'}
            </Button>
          </div>
        </form>
      )}
    </section>
  )
}

function PaymentRow({ invoiceId, payment, canReverse }: { invoiceId: string; payment: InvoicePayment; canReverse: boolean }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const reversed = Boolean(payment.reversed_at)

  return (
    <li className="flex flex-col gap-2 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={reversed ? 'text-muted-foreground line-through' : ''}>
          {formatDate(payment.payment_date)} · {PAYMENT_METHOD_LABELS[payment.method]}
          {payment.reference ? ` · ${payment.reference}` : ''}
        </span>
        <div className="flex items-center gap-3">
          <span className={`tabular-nums ${reversed ? 'text-muted-foreground line-through' : 'font-medium'}`}>
            {formatCentsExact(payment.amount_cents)}
          </span>
          {canReverse && !reversed && (
            <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              Reverse
            </Button>
          )}
        </div>
      </div>
      {payment.notes && <p className="text-muted-foreground">{payment.notes}</p>}
      {reversed && <p className="text-xs text-destructive">Reversed {formatDate(payment.reversed_at)}: {payment.reversal_reason}</p>}
      {open && (
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              const result = await reversePayment(invoiceId, payment.id, reason)
              if (result.error) setError(result.error)
              else setOpen(false)
            })
          }}
        >
          <Input aria-label="Reason for reversal" placeholder="Reason (e.g. check bounced)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="submit" variant="destructive" size="sm" disabled={pending}>
            Confirm reversal
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </li>
  )
}
