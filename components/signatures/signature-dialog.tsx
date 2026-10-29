'use client'

import { Suspense, use, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowDown, ArrowUp, CircleAlert, Download, Eye, FileSignature, Loader2, Mail, MonitorSmartphone, Plus, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  cancelSignatureRequestAction,
  createSignatureRequest,
  getSignaturePanel,
  getSignedPdfUrl,
  refreshSignatureRequest,
  type SignaturePanelData,
} from '@/app/actions/signatures'
import { SignatureBadge } from '@/components/signatures/signature-badge'
import { OPEN_STATUSES, SIGNER_STATUS_LABELS, eventLabel, needsSignedArtifactSync, type SignatureRequestView, type SigningMethod } from '@/lib/signatures'
import { formatBytes } from '@/lib/documents'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

type PanelResult = Awaited<ReturnType<typeof getSignaturePanel>>
export type SignatureDialogTarget = { id: string; name: string }

export type SignatureDialogState = { doc: SignatureDialogTarget; request: Promise<PanelResult> }

export function openSignatureState(doc: SignatureDialogTarget): SignatureDialogState {
  return { doc, request: getSignaturePanel(doc.id) }
}

export function SignatureDialog({
  state,
  onChange,
  onClose,
}: {
  state: SignatureDialogState | null
  onChange: (next: SignatureDialogState) => void
  onClose: () => void
}) {
  const doc = state?.doc ?? null
  const promise = state?.request ?? null
  const reload = () => doc && onChange(openSignatureState(doc))

  return (
    <Dialog open={Boolean(doc)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-4 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSignature className="size-5 text-primary" aria-hidden="true" />
            Signatures
          </DialogTitle>
          <DialogDescription className="truncate">{doc?.name}</DialogDescription>
        </DialogHeader>
        {doc && promise && (
          <Suspense fallback={<PanelSkeleton />}>
            <PanelBody promise={promise} doc={doc} onChanged={reload} />
          </Suspense>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Loading signatures">
      {[0, 1].map((i) => (
        <div key={i} className="h-24 animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  )
}

function PanelBody({ promise, doc, onChanged }: { promise: Promise<PanelResult>; doc: SignatureDialogTarget; onChanged: () => void }) {
  const result = use(promise)
  const [composing, setComposing] = useState(false)
  if (!result.ok) return <Notice tone="error">{result.error}</Notice>
  const data = result.data

  if (composing) return <Composer data={data} doc={doc} onCancel={() => setComposing(false)} onSent={() => { setComposing(false); onChanged() }} />

  const v = data.currentVersion
  const blocker =
    data.setup === 'disabled'
      ? 'Electronic signatures are turned off for your company. Existing signed records stay viewable.'
      : data.setup === 'setup_required'
        ? 'Dropbox Sign is not connected yet. An administrator needs to add DROPBOX_SIGN_API_KEY to the project environment.'
        : !data.canManage
          ? null
          : !v
            ? 'This document has no file to sign.'
            : !v.isPdf
              ? 'Only PDF documents can be sent for signature. Upload a PDF version to continue.'
              : !v.sizeOk
                ? 'PDFs sent for signature must be 25 MB or smaller.'
                : data.hasOpenRequestOnCurrent
                  ? null
                  : null

  return (
    <div className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1">
      {blocker && <Notice tone={data.setup === 'enabled' ? 'info' : 'warning'}>{blocker}</Notice>}
      {data.setup === 'enabled' && data.testMode && (
        <Notice tone="info">Test mode is on. Requests are sent with Dropbox Sign test mode and are not legally binding.</Notice>
      )}
      {data.canManage && data.setup === 'enabled' && v?.isPdf && v.sizeOk && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-[#E2E8E2] bg-[#F8F7F3] p-4">
          <p className="text-sm text-muted-foreground">
            {data.hasOpenRequestOnCurrent
              ? `Version ${v.number} already has an open request. Cancel it to send again.`
              : `Send version ${v.number} for signature.`}
          </p>
          <Button size="sm" onClick={() => setComposing(true)} disabled={data.hasOpenRequestOnCurrent}>
            <Plus aria-hidden="true" /> Request signatures
          </Button>
        </div>
      )}
      {data.requests.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">No signature requests for this document yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data.requests.map((r) => (
            <RequestCard key={r.id} request={r} canManage={data.canManage && data.setup !== 'setup_required'} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Notice({ tone, children }: { tone: 'error' | 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2 rounded-lg p-3 text-sm',
        tone === 'error' && 'bg-destructive/5 text-destructive',
        tone === 'warning' && 'bg-champagne-soft text-warning',
        tone === 'info' && 'bg-[#EAF0E9] text-primary',
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

async function openSigned(id: string, mode: 'preview' | 'download') {
  const res = await getSignedPdfUrl(id, mode)
  if (!res.ok) return toast.error(res.error)
  if (mode === 'preview') window.open(res.data.url, '_blank', 'noopener,noreferrer')
  else window.location.assign(res.data.url)
}

function RequestCard({ request: r, canManage, onChanged }: { request: SignatureRequestView; canManage: boolean; onChanged: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [showLog, setShowLog] = useState(false)
  const open = OPEN_STATUSES.includes(r.status)
  const signed = r.signers.filter((s) => s.status === 'signed').length

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const res = await fn()
      if (!res.ok) toast.error(res.error ?? 'Something went wrong.')
      else toast.success(success)
      onChanged()
      router.refresh()
    })

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-[#E2E8E2] bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="truncate font-medium text-foreground">{r.title}</p>
          <p className="text-xs text-muted-foreground">
            {[
              r.sourceVersionNumber ? `Version ${r.sourceVersionNumber}` : null,
              r.method === 'embedded' ? 'In-app signing' : 'Email signing',
              r.ordered ? 'In order' : null,
              `Sent by ${r.requestedBy} ${formatDateTime(r.createdAt)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {r.testMode && <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Test</span>}
          <SignatureBadge status={r.status} signed={signed} total={r.signers.length} />
        </div>
      </div>

      {r.errorMessage && <Notice tone="error">{r.errorMessage}</Notice>}
      {r.status === 'completed' && r.artifactError && <Notice tone="warning">{r.artifactError}</Notice>}

      <ol className="flex flex-col divide-y divide-[#E2E8E2] rounded-lg border border-[#E2E8E2]">
        {r.signers.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              {r.ordered && <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{s.order + 1}</span>}
              <div className="min-w-0">
                <p className="truncate text-foreground">
                  {s.name}
                  <span className="ml-1.5 text-xs text-muted-foreground">{s.kind === 'homeowner' ? 'Homeowner' : 'Staff'}</span>
                </p>
                <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.email}</p>
              </div>
            </div>
            <div className="text-right text-xs">
              <p className={cn('font-medium', s.status === 'signed' ? 'text-success' : s.status === 'declined' || s.status === 'error' ? 'text-destructive' : 'text-muted-foreground')}>
                {SIGNER_STATUS_LABELS[s.status]}
              </p>
              <p className="text-muted-foreground">
                {s.signedAt ? formatDateTime(s.signedAt) : s.lastViewedAt ? `Viewed ${formatDateTime(s.lastViewedAt)}` : ''}
              </p>
              {s.declineReason && <p className="max-w-60 text-destructive">{`"${s.declineReason}"`}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {r.hasSignedPdf && (
          <>
            <Button size="sm" variant="outline" onClick={() => void openSigned(r.id, 'preview')}>
              <Eye aria-hidden="true" /> View signed PDF
            </Button>
            <Button size="sm" variant="outline" onClick={() => void openSigned(r.id, 'download')}>
              <Download aria-hidden="true" /> Download
              {r.signedSizeBytes ? <span className="text-muted-foreground">{formatBytes(r.signedSizeBytes)}</span> : null}
            </Button>
          </>
        )}
        {canManage && (open || needsSignedArtifactSync(r)) && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => act(() => refreshSignatureRequest(r.id), open ? 'Status refreshed' : 'Signed copy synchronized')}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}{' '}
            {open ? 'Refresh status' : r.hasSignedPdf ? 'File signed copy' : 'Retrieve signed PDF'}
          </Button>
        )}
        {canManage && open && (
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={() => {
              if (window.confirm('Cancel this signature request? Signers will no longer be able to sign it.')) act(() => cancelSignatureRequestAction(r.id), 'Request cancelled')
            }}
          >
            <X aria-hidden="true" /> Cancel request
          </Button>
        )}
        {r.events.length > 0 && (
          <Button size="sm" variant="ghost" className="ml-auto" aria-expanded={showLog} onClick={() => setShowLog((x) => !x)}>
            {showLog ? 'Hide activity' : `Activity (${r.events.length})`}
          </Button>
        )}
      </div>

      {showLog && (
        <ol className="flex flex-col gap-1.5 border-l-2 border-[#E2E8E2] pl-3 text-xs">
          {r.events.map((e) => (
            <li key={e.id} className="flex flex-wrap justify-between gap-2">
              <span className="text-foreground">{eventLabel(e.type)}</span>
              <time dateTime={e.time} className="text-muted-foreground">{formatDateTime(e.time)}</time>
            </li>
          ))}
        </ol>
      )}
    </li>
  )
}

function Composer({ data, doc, onCancel, onSent }: { data: SignaturePanelData; doc: SignatureDialogTarget; onCancel: () => void; onSent: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [title, setTitle] = useState(doc.name.slice(0, 200))
  const [message, setMessage] = useState('')
  const [method, setMethod] = useState<SigningMethod>('email')
  const [ordered, setOrdered] = useState(false)
  const [selected, setSelected] = useState<{ key: string; initials: boolean }[]>([])
  const [error, setError] = useState<string | null>(null)
  const ready = new Set(data.embeddedReadyKeys)

  const toggle = (key: string) =>
    setSelected((list) => (list.some((s) => s.key === key) ? list.filter((s) => s.key !== key) : list.length >= 10 ? list : [...list, { key, initials: false }]))
  const move = (i: number, d: -1 | 1) =>
    setSelected((list) => {
      const next = [...list]
      ;[next[i], next[i + d]] = [next[i + d], next[i]]
      return next
    })
  const blockedForMethod = (key: string) => method === 'embedded' && !ready.has(key)
  const invalid = selected.filter((s) => blockedForMethod(s.key))

  const submit = () => {
    setError(null)
    start(async () => {
      const res = await createSignatureRequest({
        documentId: doc.id,
        versionId: data.currentVersion!.id,
        title,
        message: message || undefined,
        method,
        ordered,
        signers: selected,
      })
      if (!res.ok) return setError(res.error)
      toast.success('Signature request sent')
      router.refresh()
      onSent()
    })
  }

  const groups = [
    { label: 'Homeowners', items: data.candidates.filter((c) => c.kind === 'homeowner') },
    { label: 'Team', items: data.candidates.filter((c) => c.kind === 'staff') },
  ]

  return (
    <form
      className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sig-title">Title</Label>
        <Input id="sig-title" value={title} maxLength={200} required onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="sig-message">Message to signers (optional)</Label>
        <Textarea id="sig-message" value={message} maxLength={2000} rows={2} onChange={(e) => setMessage(e.target.value)} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-foreground">How signers sign</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([
            { value: 'email', Icon: Mail, label: 'By email', hint: 'Dropbox Sign emails each signer a secure link.', disabled: false },
            { value: 'embedded', Icon: MonitorSmartphone, label: 'In the app', hint: data.embeddedAvailable ? 'Homeowners sign from their portal; staff sign here.' : 'Needs DROPBOX_SIGN_CLIENT_ID.', disabled: !data.embeddedAvailable },
          ] as const).map((o) => (
            <label
              key={o.value}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                method === o.value ? 'border-primary bg-[#EAF0E9]' : 'border-[#E2E8E2]',
                o.disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              <input type="radio" name="method" className="sr-only" value={o.value} checked={method === o.value} disabled={o.disabled} onChange={() => setMethod(o.value)} />
              <o.Icon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                <span className="block font-medium text-foreground">{o.label}</span>
                <span className="block text-xs text-muted-foreground">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1.5 text-sm font-medium text-foreground">Signers</legend>
        {groups.map((g) => (
          <div key={g.label} className="flex flex-col gap-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{g.label}</p>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">{g.label === 'Homeowners' ? 'This project has no client contacts.' : 'No team members found.'}</p>
            ) : (
              <ul className="flex flex-col rounded-lg border border-[#E2E8E2]">
                {g.items.map((c) => {
                  const checked = selected.some((s) => s.key === c.key)
                  const reason = c.reason ?? (blockedForMethod(c.key) ? 'No portal access to this project' : undefined)
                  return (
                    <li key={c.key} className="border-b border-[#E2E8E2] last:border-b-0">
                      <label className={cn('flex min-h-11 items-start gap-3 px-3 py-2.5 text-sm sm:min-h-0 sm:py-2', c.eligible ? 'cursor-pointer' : 'cursor-not-allowed opacity-60')}>
                        <input type="checkbox" className="mt-1 size-4 shrink-0 accent-primary" checked={checked} disabled={!c.eligible} onChange={() => toggle(c.key)} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-foreground">{c.name}</span>
                          <span className="block text-xs text-muted-foreground [overflow-wrap:anywhere]">{[c.email, c.detail].filter(Boolean).join(' · ')}</span>
                          {reason && <span className="block text-xs text-warning">{reason}</span>}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        ))}
      </fieldset>

      {selected.length > 0 && (
        <div className="flex flex-col gap-2 rounded-lg bg-[#F8F7F3] p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={ordered} onChange={(e) => setOrdered(e.target.checked)} />
            Signers must sign in this order
          </label>
          <ol className="flex flex-col gap-1.5">
            {selected.map((s, i) => {
              const c = data.candidates.find((x) => x.key === s.key)
              return (
                <li key={s.key} className="flex flex-wrap items-center gap-2 rounded-md bg-card px-2 py-1.5 text-sm">
                  <span className="flex size-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{c?.name}</span>
                  <label className="flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground sm:min-h-0">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary sm:size-3.5"
                      checked={s.initials}
                      onChange={(e) => setSelected((list) => list.map((x) => (x.key === s.key ? { ...x, initials: e.target.checked } : x)))}
                    />
                    Initial each page
                  </label>
                  <Button type="button" size="icon" variant="ghost" className="size-11 sm:size-7" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c?.name} up`}>
                    <ArrowUp aria-hidden="true" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" className="size-11 sm:size-7" disabled={i === selected.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c?.name} down`}>
                    <ArrowDown aria-hidden="true" />
                  </Button>
                </li>
              )
            })}
          </ol>
          <p className="text-xs text-muted-foreground">A signature page is added to the end of the PDF with a signature and date field for each signer.</p>
        </div>
      )}

      {error && <Notice tone="error">{error}</Notice>}
      <DialogFooter className="sticky bottom-0 bg-background pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Back
        </Button>
        <Button type="submit" disabled={pending || !selected.length || invalid.length > 0 || !title.trim()}>
          {pending && <Loader2 className="animate-spin" aria-hidden="true" />}
          {pending ? 'Sending…' : `Send to ${selected.length || ''} signer${selected.length === 1 ? '' : 's'}`.replace('  ', ' ')}
        </Button>
      </DialogFooter>
    </form>
  )
}
