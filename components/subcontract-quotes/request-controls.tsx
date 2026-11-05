'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { REVISION_PREFILL_EVENT, type RevisionPrefillDetail } from '@/lib/ai/quote-analysis'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  amendQuoteScopeAction,
  inviteQuoteCompaniesAction,
  requestQuoteRevisionAction,
  transitionQuoteRequestAction,
} from '@/app/actions/subcontract-quotes'
import { QUOTE_TIMEZONES, type RequestStatus } from '@/lib/subcontract-quotes'
import type { CompanyOption, DocumentOption } from '@/lib/subcontract-quotes-data'

type Panel = null | 'extend' | 'reopen' | 'amend' | 'invite' | 'cancel'

type Props = {
  projectId: string
  requestId: string
  status: RequestStatus
  rowVersion: number
  timezone: string
  scope: string
  documentIds: string[]
  documents: DocumentOption[]
  uninvited: CompanyOption[]
}

const selectClass = 'h-9 rounded-md border border-input bg-background px-3 text-sm'

export function RequestControls(p: Props) {
  const router = useRouter()
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const [deadline, setDeadline] = useState('')
  const [tz, setTz] = useState(p.timezone)
  const [scope, setScope] = useState(p.scope)
  const [docs, setDocs] = useState(p.documentIds)
  const [summary, setSummary] = useState('')
  const [invite, setInvite] = useState<string[]>([])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(null)
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Something went wrong.')
      else {
        setPanel(null)
        router.refresh()
      }
    })
  const open = (next: Panel) => {
    setError(null)
    setPanel(panel === next ? null : next)
  }

  const deadlineFields = (
    <div className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">New deadline</span>
        <Input type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Timezone</span>
        <select className={selectClass} value={tz} onChange={(e) => setTz(e.target.value)}>
          {QUOTE_TIMEZONES.map((z) => (
            <option key={z} value={z}>
              {z.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {p.status === 'open' ? (
          <>
            <Button variant="outline" onClick={() => open('amend')}>Amend scope</Button>
            <Button variant="outline" onClick={() => open('invite')} disabled={!p.uninvited.length}>Invite companies</Button>
            <Button variant="outline" onClick={() => open('extend')}>Change deadline</Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => transitionQuoteRequestAction(p.projectId, p.requestId, p.rowVersion, 'close'))}
            >
              Close responses
            </Button>
          </>
        ) : null}
        {p.status === 'closed' ? <Button variant="outline" onClick={() => open('reopen')}>Reopen</Button> : null}
        {p.status !== 'cancelled' ? (
          <Button variant="outline" className="text-destructive" onClick={() => open('cancel')}>Cancel request</Button>
        ) : null}
      </div>

      {panel === 'extend' || panel === 'reopen' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          {deadlineFields}
          {panel === 'reopen' ? <p className="text-xs text-muted-foreground">Leave blank to keep the current deadline if it is still in the future.</p> : null}
          <div className="flex gap-2">
            <Button
              disabled={pending || (panel === 'extend' && !deadline)}
              onClick={() =>
                run(() =>
                  transitionQuoteRequestAction(p.projectId, p.requestId, p.rowVersion, panel, deadline || undefined, deadline ? tz : undefined),
                )
              }
            >
              {panel === 'extend' ? 'Save deadline' : 'Reopen responses'}
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'amend' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">
            Creates a new scope version. Every invitee must acknowledge it before submitting, and earlier quotes stay tied to the version they priced.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Scope of work</span>
            <Textarea rows={6} maxLength={20000} value={scope} onChange={(e) => setScope(e.target.value)} />
          </label>
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium">Documents</legend>
            {p.documents.map((d) => (
              <label key={d.id} className="flex min-h-9 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={docs.includes(d.id)}
                  onChange={() => setDocs(docs.includes(d.id) ? docs.filter((x) => x !== d.id) : [...docs, d.id])}
                />
                {d.name} <span className="text-xs text-muted-foreground">current v{d.versionNumber}</span>
              </label>
            ))}
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">What changed (shown to invitees)</span>
            <Input maxLength={2000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Added two skylights; area now 34 squares." />
          </label>
          <div>
            <Button disabled={pending} onClick={() => run(() => amendQuoteScopeAction(p.projectId, p.requestId, p.rowVersion, scope, docs, summary))}>
              Issue new version
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'invite' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
          {p.uninvited.map((c) => (
            <label key={c.id} className="flex min-h-9 items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-primary"
                disabled={Boolean(c.blocked)}
                checked={invite.includes(c.id)}
                onChange={() => setInvite(invite.includes(c.id) ? invite.filter((x) => x !== c.id) : [...invite, c.id])}
              />
              <span className="flex flex-col">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.trade} · {c.badge}</span>
                {c.blocked ? <span className="text-xs text-destructive">{c.blocked}</span> : null}
              </span>
            </label>
          ))}
          <div>
            <Button disabled={pending || !invite.length} onClick={() => run(() => inviteQuoteCompaniesAction(p.projectId, p.requestId, invite))}>
              Send invitations
            </Button>
          </div>
        </div>
      ) : null}

      {panel === 'cancel' ? (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4">
          <p className="text-sm text-foreground">Cancelling ends this request permanently. Invitees are notified and keep read-only access to their quotes.</p>
          <div>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => run(() => transitionQuoteRequestAction(p.projectId, p.requestId, p.rowVersion, 'cancel'))}
            >
              Cancel request
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}

export function RevisionRequestButton({ projectId, requestId, invitationId }: { projectId: string; requestId: string; invitationId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const fieldId = `revision-text-${invitationId}`

  // AI-suggested questions only prefill this form; the builder still edits and sends it.
  useEffect(() => {
    function onPrefill(e: Event) {
      const detail = (e as CustomEvent<RevisionPrefillDetail>).detail
      if (detail?.invitationId !== invitationId || !detail.text) return
      setOpen(true)
      setText((prev) => (prev.includes(detail.text) ? prev : prev.trim() ? `${prev.trim()}\n${detail.text}` : detail.text).slice(0, 4000))
      requestAnimationFrame(() => {
        const el = document.getElementById(fieldId)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el?.focus({ preventScroll: true })
      })
    }
    window.addEventListener(REVISION_PREFILL_EVENT, onPrefill)
    return () => window.removeEventListener(REVISION_PREFILL_EVENT, onPrefill)
  }, [invitationId, fieldId])

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Request revision
      </Button>
    )
  }
  return (
    <div className="flex w-full flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Revision instructions</span>
        <Textarea id={fieldId} rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Break out the skylight cost separately." />
      </label>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await requestQuoteRevisionAction(projectId, requestId, invitationId, text)
              if (!r.ok) setError(r.error)
              else {
                setOpen(false)
                router.refresh()
              }
            })
          }
        >
          Send request
        </Button>
        <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
