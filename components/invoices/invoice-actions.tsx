'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Pencil, Printer, Send, Trash2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { deleteDraftInvoice, issueInvoice, setInvoicePublished, voidInvoice } from '@/app/actions/invoices'
import type { InvoiceStatus } from '@/lib/invoices'

export function InvoiceActions({
  invoiceId,
  status,
  published,
  hasLines,
  canManage,
}: {
  invoiceId: string
  status: InvoiceStatus
  published: boolean
  hasLines: boolean
  canManage: boolean
}) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [voiding, setVoiding] = useState(false)
  const [reason, setReason] = useState('')

  const run = (fn: () => Promise<{ error?: string; success?: string } | void>) =>
    startTransition(async () => {
      const result = await fn()
      if (result?.error) setMessage({ tone: 'error', text: result.error })
      else if (result?.success) {
        setMessage({ tone: 'success', text: result.success })
        setVoiding(false)
        setReason('')
      }
    })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" render={<Link href={`/invoices/${invoiceId}/print`} target="_blank" />} nativeButton={false}>
          <Printer data-icon="inline-start" />
          Print / PDF
        </Button>
        {canManage && status === 'draft' && (
          <>
            <Button variant="outline" render={<Link href={`/invoices/${invoiceId}/edit`} />} nativeButton={false}>
              <Pencil data-icon="inline-start" />
              Edit draft
            </Button>
            <Button disabled={pending || !hasLines} onClick={() => run(() => issueInvoice(invoiceId, true))}>
              <Send data-icon="inline-start" />
              Issue and share
            </Button>
            <Button variant="outline" disabled={pending || !hasLines} onClick={() => run(() => issueInvoice(invoiceId, false))}>
              Issue without sharing
            </Button>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => {
                if (window.confirm('Delete this draft invoice? This cannot be undone.')) run(() => deleteDraftInvoice(invoiceId))
              }}
            >
              <Trash2 data-icon="inline-start" />
              Delete draft
            </Button>
          </>
        )}
        {canManage && status !== 'draft' && status !== 'voided' && (
          <>
            <Button variant="outline" disabled={pending} onClick={() => run(() => setInvoicePublished(invoiceId, !published))}>
              {published ? <EyeOff data-icon="inline-start" /> : <Eye data-icon="inline-start" />}
              {published ? 'Hide from portal' : 'Share to portal'}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => setVoiding((v) => !v)} aria-expanded={voiding}>
              <XCircle data-icon="inline-start" />
              Void invoice
            </Button>
          </>
        )}
      </div>

      {status === 'draft' && !hasLines && canManage && (
        <p className="text-sm text-muted-foreground">Add at least one line item before issuing.</p>
      )}

      {voiding && (
        <form
          className="flex flex-col gap-2 rounded-lg border border-destructive/30 p-4"
          onSubmit={(e) => {
            e.preventDefault()
            run(() => voidInvoice(invoiceId, reason))
          }}
        >
          <label htmlFor="void-reason" className="text-sm font-medium">
            Reason for voiding
          </label>
          <Textarea id="void-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} required minLength={3} />
          <p className="text-xs text-muted-foreground">
            Voiding keeps the invoice and its number for your records. Reverse any recorded payments first.
          </p>
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={pending}>
              Confirm void
            </Button>
            <Button type="button" variant="ghost" onClick={() => setVoiding(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {message && (
        <p role={message.tone === 'error' ? 'alert' : 'status'} className={message.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-primary'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
