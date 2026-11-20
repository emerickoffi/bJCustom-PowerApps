'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { CheckCircle2, CircleHelp, LifeBuoy, Mail } from 'lucide-react'
import { submitHelpRequestAction } from '@/app/actions/help'
import { formatRecentErrors, installHelpErrorCapture, recentHelpErrors } from '@/lib/help-errors'
import {
  helpTopicFor,
  projectIdFromPath,
  SUPPORT_EMAIL,
  SUPPORT_RESPONSE_PROMISE,
  type HelpArea,
} from '@/lib/help-topics'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  area: HelpArea
  /** Company admins filing from a project can also open support access for an hour. */
  canGrantSupport?: boolean
  /** "header" sits with the other top-bar icons; "floating" is for the signed-out pages. */
  variant?: 'header' | 'floating'
  /** Floating button colours: "dark" over the teal sign-in page, "light" over white pages. */
  tone?: 'dark' | 'light'
  className?: string
}

type Sent = { reference: string; emailedTo: string | null; warning?: string }

/** Error messages showing on the page right now (form errors, failed saves), outside the Help panel. */
function visibleAlerts(panel: HTMLElement | null): string[] {
  if (typeof document === 'undefined') return []
  return Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]'))
    .filter((el) => !panel?.contains(el) && el.offsetParent !== null)
    .map((el) => el.innerText.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 3)
}

export function HelpButton({ area, canGrantSupport = false, variant = 'header', tone = 'dark', className }: Props) {
  const pathname = usePathname() ?? '/'
  const topic = useMemo(() => helpTopicFor(area, pathname), [area, pathname])
  const projectId = projectIdFromPath(area, pathname)
  const panelRef = useRef<HTMLDivElement>(null)

  const [open, setOpen] = useState(false)
  const [contact, setContact] = useState(false)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [grant, setGrant] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState<Sent | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => installHelpErrorCapture(), [])

  function openPanel() {
    // Capture what was wrong at the moment they asked for help, before the panel covers the page.
    const onPage = visibleAlerts(panelRef.current)
    const recorded = formatRecentErrors(recentHelpErrors())
    setErrorText([...onPage, recorded].filter(Boolean).join('\n').slice(0, 1000))
    setOpen(true)
  }

  function reset() {
    setContact(false)
    setSubject('')
    setMessage('')
    setGrant(false)
    setError(null)
    setFieldErrors({})
    setSent(null)
  }

  function submit() {
    setError(null)
    setFieldErrors({})
    startTransition(async () => {
      const result = await submitHelpRequestAction({
        area,
        subject,
        message,
        name: area === 'public' ? name : undefined,
        email: area === 'public' ? email : undefined,
        pagePath: pathname.slice(0, 500),
        projectId: projectId ?? undefined,
        lastError: errorText || undefined,
        grantMinutes: grant && projectId ? 60 : undefined,
        website,
      })
      if (!result.ok) {
        setError(result.error)
        setFieldErrors(result.fieldErrors ?? {})
        return
      }
      setSent({ reference: result.reference, emailedTo: result.emailedTo, warning: result.warning })
    })
  }

  const trigger =
    variant === 'floating' ? (
      <button
        type="button"
        onClick={openPanel}
        className={cn(
          'fixed right-3 top-3 z-40 flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 sm:right-5 sm:top-5',
          tone === 'dark'
            ? 'bg-white/15 text-white hover:bg-white/25 focus-visible:ring-white'
            : 'border border-border bg-card/90 text-foreground shadow-sm hover:bg-muted focus-visible:ring-ring',
          className,
        )}
      >
        <CircleHelp className="size-4" aria-hidden="true" />
        Help
      </button>
    ) : (
      <button
        type="button"
        onClick={openPanel}
        aria-label="Help"
        title="Help"
        className={cn(
          'relative flex size-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-sage/70 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-10',
          className,
        )}
      >
        <CircleHelp className="size-[1.125rem]" aria-hidden="true" />
      </button>
    )

  return (
    <>
      {trigger}
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (pending) return
          setOpen(next)
          if (!next) reset()
        }}
      >
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-md">
          <div ref={panelRef} className="flex flex-col gap-5 p-5 sm:p-6">
            <SheetHeader className="p-0">
              <SheetTitle className="flex items-center gap-2">
                <LifeBuoy className="size-5 text-primary" aria-hidden="true" />
                Help
              </SheetTitle>
              <SheetDescription>{`Tips for ${topic.title.toLowerCase()}, or contact Trefort support.`}</SheetDescription>
            </SheetHeader>

            {!contact && !sent && (
              <>
                <section aria-labelledby="help-tips-heading" className="flex flex-col gap-2">
                  <h3 id="help-tips-heading" className="text-sm font-semibold text-foreground">
                    {topic.title}
                  </h3>
                  <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-foreground">
                    {topic.tips.map((tip) => (
                      <li key={tip}>{tip}</li>
                    ))}
                  </ul>
                </section>

                <section className="flex flex-col gap-3 rounded-xl bg-sage/50 p-4">
                  <div className="flex flex-col gap-1">
                    <h3 className="text-sm font-semibold text-foreground">Still stuck?</h3>
                    <p className="text-sm text-muted-foreground">
                      Tell us what happened. We include this page and the last error you saw, so you do not have to explain
                      it all. {SUPPORT_RESPONSE_PROMISE}
                    </p>
                  </div>
                  <Button variant="action" onClick={() => setContact(true)} className="w-fit">
                    Contact support
                  </Button>
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="flex w-fit items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline">
                    <Mail className="size-4" aria-hidden="true" />
                    {SUPPORT_EMAIL}
                  </a>
                </section>
              </>
            )}

            {contact && !sent && (
              <section aria-labelledby="help-contact-heading" className="flex flex-col gap-4">
                <h3 id="help-contact-heading" className="text-sm font-semibold text-foreground">
                  Contact Trefort support
                </h3>

                {area === 'public' && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="help-name">Your name</Label>
                      <Input id="help-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="help-email">Email for our reply</Label>
                      <Input
                        id="help-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        maxLength={254}
                        autoComplete="email"
                        aria-invalid={Boolean(fieldErrors.email)}
                      />
                      {fieldErrors.email && <p className="text-xs text-destructive">{fieldErrors.email}</p>}
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="help-subject">What were you trying to do?</Label>
                  <Input
                    id="help-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="For example: save an estimate"
                    maxLength={140}
                    aria-invalid={Boolean(fieldErrors.subject)}
                  />
                  {fieldErrors.subject && <p className="text-xs text-destructive">{fieldErrors.subject}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="help-message">What happened?</Label>
                  <Textarea
                    id="help-message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What you clicked, what you expected, and what you saw instead."
                    maxLength={4000}
                    rows={5}
                    aria-invalid={Boolean(fieldErrors.message)}
                  />
                  {fieldErrors.message && <p className="text-xs text-destructive">{fieldErrors.message}</p>}
                </div>

                {/* Hidden from people; bots fill it in. */}
                <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
                  <label htmlFor="help-website">Website</label>
                  <input id="help-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>

                {canGrantSupport && projectId && (
                  <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
                    <input
                      type="checkbox"
                      checked={grant}
                      onChange={(e) => setGrant(e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground">Let support view this project for 1 hour</span>
                      <span className="text-muted-foreground">
                        Read-only, ends on its own, and you can revoke it under Settings → Support access.
                      </span>
                    </span>
                  </label>
                )}

                <div className="flex flex-col gap-1 rounded-xl bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
                  <p>{`We include: this page (${pathname.length > 60 ? `${pathname.slice(0, 57)}...` : pathname}), your browser${area === 'public' ? '' : ', your company and role'}.`}</p>
                  {errorText ? (
                    <p className="break-words text-foreground">{`Last error: ${errorText.split('\n')[0]}`}</p>
                  ) : (
                    <p>No error was showing.</p>
                  )}
                </div>

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button variant="action" onClick={submit} disabled={pending}>
                    {pending ? 'Sending...' : 'Send to support'}
                  </Button>
                  <Button variant="outline" onClick={() => setContact(false)} disabled={pending}>
                    Back
                  </Button>
                </div>
              </section>
            )}

            {sent && (
              <section role="status" className="flex flex-col gap-3">
                <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                  {`Request ${sent.reference} sent`}
                </p>
                <p className="text-sm text-muted-foreground">
                  {SUPPORT_RESPONSE_PROMISE}
                  {sent.emailedTo ? ` A copy is on its way to ${sent.emailedTo}.` : area === 'public' && email ? ` We will reply to ${email}.` : ''}
                </p>
                {sent.warning && <p className="rounded-xl bg-champagne-soft px-3 py-2 text-sm text-foreground">{sent.warning}</p>}
                <Button variant="outline" className="w-fit" onClick={() => setOpen(false)}>
                  Close
                </Button>
              </section>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
