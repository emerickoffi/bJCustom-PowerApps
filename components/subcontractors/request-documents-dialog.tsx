'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Copy, Info, Mail, MailPlus, Plus, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AddContactDialog } from '@/components/contacts/company-contacts'
import { requestDocumentsAction } from '@/app/actions/subcontractor-qualification'
import { CATEGORIES, CATEGORY_LABELS } from '@/lib/subcontractor-qualification'
import type { ChecklistItem } from '@/lib/subcontractor-qualification-data'
import type { CompanyContact } from '@/lib/contacts-data'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const NOTES_LIMIT = 2000

export type LastRequest = { at: string; actor: string | null } | null

type Props = {
  companyId: string
  companyName: string
  items: ChecklistItem[]
  contacts: CompanyContact[]
  people: { id: string; label: string }[]
  companyInactive: boolean
  lastRequest: LastRequest
  label?: string
  variant?: 'default' | 'outline'
  size?: 'sm' | 'default'
}

const STATE_TEXT: Record<ChecklistItem['effective'], string> = {
  missing: 'Not received',
  rejected: 'Needs correction',
  expired: 'Expired',
  awaiting_review: 'Received, pending review',
  satisfied: 'Approved',
}

/** Items that are not approved yet. Expired items count, so renewals can be requested. */
export function requestableItems(items: ChecklistItem[]) {
  return items.filter((i) => i.effective !== 'satisfied' && i.state !== 'not_applicable')
}

function defaultSelection(items: ChecklistItem[]) {
  return new Set(
    requestableItems(items)
      .filter((i) => i.mandatory && i.effective !== 'awaiting_review')
      .map((i) => i.requirementId),
  )
}

export function RequestDocumentsButton(props: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button size={props.size ?? 'sm'} variant={props.variant ?? 'default'} onClick={() => setOpen(true)}>
        <MailPlus data-icon="inline-start" />
        {props.label ?? 'Request documents'}
      </Button>
      {open && <RequestDocumentsDialog {...props} onClose={() => setOpen(false)} />}
    </>
  )
}

function RequestDocumentsDialog({
  companyId,
  companyName,
  items,
  contacts,
  people,
  companyInactive,
  lastRequest,
  onClose,
}: Props & { onClose: () => void }) {
  const router = useRouter()
  const requestable = useMemo(() => requestableItems(items), [items])
  const [selected, setSelected] = useState<Set<string>>(() => defaultSelection(items))
  const [recipientId, setRecipientId] = useState<string>(() => contacts.find((c) => c.is_primary_contact)?.relationship_id ?? '')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState<{ text: string; email: string | null } | null>(null)
  const [addingContact, setAddingContact] = useState(false)
  const inFlight = useRef(false)

  const recipient = contacts.find((c) => c.relationship_id === recipientId) ?? null
  const grouped = CATEGORIES.map((c) => ({ category: c, items: requestable.filter((i) => i.category === c) })).filter(
    (g) => g.items.length,
  )
  const chosen = requestable.filter((i) => selected.has(i.requirementId))

  const requestText = [
    recipient ? `To: ${recipient.name}${recipient.role ? ` (${recipient.role})` : ''}${recipient.email ? ` <${recipient.email}>` : ''}` : null,
    `Requested from ${companyName} (${chosen.length} ${chosen.length === 1 ? 'item' : 'items'}):`,
    ...chosen.map((i) => `- ${CATEGORY_LABELS[i.category]}: ${i.title}${i.evidenceRequired ? '' : ' (confirmation or information)'}`),
    message.trim() ? `\nMessage: ${message.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n')

  function toggle(id: string, on: boolean) {
    setSelected((s) => {
      const next = new Set(s)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (inFlight.current) return
    if (!chosen.length) return setError('Select at least one item to request.')
    if (requestText.length > NOTES_LIMIT) return setError('This request is too long. Shorten the message or select fewer items.')
    inFlight.current = true
    setError(null)
    startTransition(async () => {
      try {
        const result = await requestDocumentsAction({ companyId, notes: requestText })
        if (!result.ok) return setError(result.error)
        setDone({ text: requestText, email: recipient?.email ?? null })
        toast.success('Document request recorded in vetting history.')
        router.refresh()
      } catch {
        setError('The request could not be saved. Nothing was recorded. Try again.')
      } finally {
        inFlight.current = false
      }
    })
  }

  async function copyText() {
    if (!done) return
    try {
      await navigator.clipboard.writeText(done.text)
      toast.success('Request text copied.')
    } catch {
      toast.error('Could not copy. Select the text and copy it manually.')
    }
  }

  const mailto = done?.email
    ? `mailto:${done.email}?subject=${encodeURIComponent(`Qualification documents for ${companyName}`)}&body=${encodeURIComponent(done.text)}`
    : null

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent
        className={cn(
          'flex max-h-[min(90dvh,52rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl',
          'max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none',
        )}
      >
        {done ? (
          <>
            <DialogHeader className="border-b px-5 pt-5 pb-4 pr-12">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                Request recorded
              </DialogTitle>
              <DialogDescription>
                {`Saved to ${companyName}'s vetting history. It has not been sent — this app does not email subcontractors.`}
              </DialogDescription>
            </DialogHeader>
            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              <p className="text-sm text-foreground">
                {done.email
                  ? 'Open it in your email app to send it, or copy the text into a message.'
                  : 'Copy the text and send it by email or phone. The selected contact has no email on file.'}
              </p>
              <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 font-sans text-xs text-foreground">{done.text}</pre>
            </div>
            <DialogFooter className="mx-0 mb-0 rounded-none">
              <Button type="button" variant="outline" onClick={copyText}>
                <Copy data-icon="inline-start" />
                Copy request text
              </Button>
              {mailto && (
                <Button variant="outline" render={<a href={mailto} />} nativeButton={false}>
                  <Mail data-icon="inline-start" />
                  Open in email app
                </Button>
              )}
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
            <DialogHeader className="border-b px-5 pt-5 pb-4 pr-12">
              <DialogTitle>Request documents</DialogTitle>
              <DialogDescription>{companyName}</DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4">
              {lastRequest && (
                <p role="status" className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-foreground" aria-hidden="true" />
                  <span>
                    {`A request was already recorded ${formatDateTime(lastRequest.at)}${lastRequest.actor ? ` by ${lastRequest.actor}` : ''}. `}
                    Creating another adds a new history entry; it does not replace the earlier one.
                  </span>
                </p>
              )}

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-semibold text-foreground">Recipient</legend>
                {contacts.length === 0 ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-dashed px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground">No contact person added. Your selections are kept while you add one.</span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAddingContact(true)}
                      disabled={companyInactive}
                      title={companyInactive ? 'Activate this company to add contacts' : undefined}
                    >
                      <Plus data-icon="inline-start" />
                      Add contact person
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {contacts.map((c) => (
                      <label
                        key={c.relationship_id}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                      >
                        <input
                          type="radio"
                          name="recipient"
                          value={c.relationship_id}
                          checked={recipientId === c.relationship_id}
                          onChange={() => setRecipientId(c.relationship_id)}
                          className="mt-1 accent-primary"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="text-sm font-medium text-foreground">
                            {c.name}
                            {c.is_primary_contact && <span className="ml-2 text-xs font-normal text-muted-foreground">Primary</span>}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[c.role, c.email ?? 'No email on file'].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!recipient && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <UserRound className="size-3.5" aria-hidden="true" />
                        No recipient selected. The request will be recorded without one.
                      </p>
                    )}
                  </div>
                )}
              </fieldset>

              <fieldset className="flex flex-col gap-3">
                <legend className="mb-1 flex w-full items-baseline justify-between gap-3 text-sm font-semibold text-foreground">
                  Requested items
                  <span className="text-xs font-normal text-muted-foreground" aria-live="polite">
                    {chosen.length} of {requestable.length} selected
                  </span>
                </legend>
                {grouped.length === 0 ? (
                  <p className="rounded-lg bg-muted/50 px-3 py-3 text-sm text-muted-foreground">
                    Every checklist item is already approved. There is nothing to request.
                  </p>
                ) : (
                  grouped.map((g) => (
                    <div key={g.category} className="flex flex-col gap-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{CATEGORY_LABELS[g.category]}</p>
                      <ul className="flex flex-col divide-y rounded-lg border">
                        {g.items.map((i) => (
                          <li key={i.requirementId}>
                            <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
                              <input
                                type="checkbox"
                                checked={selected.has(i.requirementId)}
                                onChange={(e) => toggle(i.requirementId, e.target.checked)}
                                className="mt-1 size-4 accent-primary"
                              />
                              <span className="flex min-w-0 flex-col gap-0.5">
                                <span className="text-sm font-medium text-foreground">
                                  {i.title}
                                  {i.mandatory && <span className="ml-2 text-xs font-normal text-muted-foreground">Required</span>}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {[i.evidenceRequired ? 'File upload' : 'Confirmation or information', STATE_TEXT[i.effective]].join(' · ')}
                                </span>
                                {i.guidance && <span className="text-xs text-muted-foreground text-pretty">{i.guidance}</span>}
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
                )}
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="request-message">Message (optional)</Label>
                <Textarea id="request-message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={3} />
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <p className="text-pretty">
                  <span className="font-semibold text-foreground">Delivery: recorded in this app only.</span> Nothing is emailed
                  automatically. After creating the request you can open it in your email app or copy the text.
                </p>
              </div>

              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
            </div>

            <DialogFooter className="mx-0 mb-0 rounded-none">
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || chosen.length === 0}>
                {pending ? 'Creating…' : `Create request (${chosen.length})`}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
      <AddContactDialog
        open={addingContact}
        onOpenChange={setAddingContact}
        target={{ subcontractorId: companyId }}
        people={people.filter((p) => !contacts.some((c) => c.person_id === p.id))}
        hasPrimary={contacts.some((c) => c.is_primary_contact)}
        subcontractor
      />
    </Dialog>
  )
}
