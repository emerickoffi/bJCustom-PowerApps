'use client'

import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  Building2,
  CalendarRange,
  Check,
  Copy,
  FolderKanban,
  Mail,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { useAssistantProject, type AssistantProject } from './assistant-context'

type QuickActionKey = 'overview' | 'schedule' | 'update' | 'warranty'

type Message =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; status: 'loading' }
  | { id: string; role: 'assistant'; status: 'error'; text: string }
  | { id: string; role: 'assistant'; status: 'answer'; text: string; reviewDraft?: boolean }

const QUICK_ACTIONS: { key: QuickActionKey; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'overview', label: 'Project Overview', hint: 'Status, progress, and open items', icon: FolderKanban },
  { key: 'schedule', label: 'Schedule Review', hint: 'Delays and upcoming milestones', icon: CalendarRange },
  { key: 'update', label: 'Draft Homeowner Update', hint: 'A message you review first', icon: Mail },
  { key: 'warranty', label: 'Warranty Overview', hint: 'Open claims and due dates', icon: ShieldCheck },
]

function promptFor(key: QuickActionKey, project: AssistantProject | null) {
  const scope = project ? `the ${project.name} project` : 'my active projects'
  switch (key) {
    case 'overview':
      return `Give me an overview of ${scope}: current status, construction progress, open punch list items, and the next milestones.`
    case 'schedule':
      return `Review the schedule for ${scope}. Call out delayed or at-risk activities and list what is coming up in the next two weeks.`
    case 'update':
      return project
        ? `Draft a short weekly progress update for the homeowner of ${project.name}, based on recent progress and upcoming work.`
        : 'Draft a short weekly progress update template I can send to a homeowner.'
    case 'warranty':
      return `Summarize warranty status for ${scope}: open claims, items awaiting homeowner validation, and coverage dates.`
  }
}

let idCounter = 0
const nextId = () => `m${++idCounter}`

export function AssistantLauncher({ configured }: { configured: boolean }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div data-floating-control className="group fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] z-40 print:hidden">
        <span
          role="presentation"
          className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-lg bg-brand-deep px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-md transition-opacity group-hover:opacity-100 group-has-[:focus-visible]:opacity-100"
        >
          Ask B &amp; J AI
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Ask B & J AI"
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            'flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg ring-1 ring-black/5 transition-all',
            'hover:-translate-y-0.5 hover:bg-brand-deep hover:shadow-xl',
            'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/30',
            open && 'pointer-events-none scale-90 opacity-0',
          )}
        >
          <Sparkles className="size-6" aria-hidden="true" />
        </button>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="gap-0 overflow-hidden border-l bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[420px]"
        >
          <AssistantPanel configured={configured} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  )
}

function AssistantPanel({ configured, onClose }: { configured: boolean; onClose: () => void }) {
  const project = useAssistantProject()
  const [messages, setMessages] = useState<Message[]>([])
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const inFlight = useRef<AbortController | null>(null)
  const busy = messages.some((m) => m.role === 'assistant' && m.status === 'loading')

  useEffect(() => () => inFlight.current?.abort(), [])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages])

  async function send(text: string, reviewDraft = false) {
    const question = text.trim()
    if (!configured || busy || !question) return

    const history = messages
      .filter((m): m is Extract<Message, { text: string }> => m.role === 'user' || m.status === 'answer')
      .map((m) => ({ role: m.role, text: m.text }))
      .slice(-10)
    const loadingId = nextId()
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', text: question },
      { id: loadingId, role: 'assistant', status: 'loading' },
    ])
    setDraft('')

    const controller = new AbortController()
    inFlight.current = controller
    const settle = (next: Message) => setMessages((prev) => prev.map((m) => (m.id === loadingId ? next : m)))

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project?.id ?? null, messages: [...history, { role: 'user', text: question }] }),
        signal: controller.signal,
      })
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string } | null
      if (!res.ok || !data?.text) {
        settle({ id: loadingId, role: 'assistant', status: 'error', text: data?.error ?? 'The assistant could not answer right now. Please try again.' })
        return
      }
      settle({ id: loadingId, role: 'assistant', status: 'answer', text: data.text, reviewDraft })
    } catch {
      if (controller.signal.aborted) return
      settle({ id: loadingId, role: 'assistant', status: 'error', text: 'Network problem. Check your connection and try again.' })
    } finally {
      if (inFlight.current === controller) inFlight.current = null
    }
  }

  function runQuickAction(key: QuickActionKey) {
    void send(promptFor(key, project), key === 'update')
  }

  function resetConversation() {
    inFlight.current?.abort()
    inFlight.current = null
    setMessages([])
    setDraft('')
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-3 border-b bg-card px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
          <Sparkles className="size-5" aria-hidden="true" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <SheetTitle className="font-serif text-lg font-semibold leading-tight text-foreground">
            B &amp; J AI Assistant
          </SheetTitle>
          <SheetDescription className="text-xs">Your construction copilot</SheetDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={resetConversation}
            disabled={messages.length === 0}
            aria-label="New conversation"
            title="New conversation"
          >
            <RotateCcw aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close assistant" title="Close">
            <X aria-hidden="true" />
          </Button>
        </div>
      </header>

      <ContextBar project={project} />

      <div
        ref={logRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5 focus-visible:outline-none"
      >
        {messages.length === 0 ? (
          <WelcomeState project={project} configured={configured} onAction={runQuickAction} />
        ) : (
          <ol className="flex flex-col gap-4">
            {messages.map((m) => (
              <li key={m.id}>
                <MessageBubble message={m} />
              </li>
            ))}
          </ol>
        )}
      </div>

      <Composer configured={configured} busy={busy} draft={draft} onDraftChange={setDraft} onSend={() => void send(draft)} />
    </div>
  )
}

function ContextBar({ project }: { project: AssistantProject | null }) {
  return (
    <div className="flex items-center gap-3 border-b bg-sage/60 px-4 py-2.5">
      <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
      {project ? (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold text-foreground">
            {project.name}
            {project.number && <span className="font-normal text-muted-foreground">{` · ${project.number}`}</span>}
          </span>
          <span className="text-xs text-muted-foreground">{project.statusLabel}</span>
        </div>
      ) : (
        <span className="text-sm font-medium text-foreground">All accessible projects</span>
      )}
    </div>
  )
}

function WelcomeState({
  project,
  configured,
  onAction,
}: {
  project: AssistantProject | null
  configured: boolean
  onAction: (k: QuickActionKey) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h3 className="text-balance font-serif text-xl font-semibold text-foreground">How can I help today?</h3>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          {project
            ? `Ask about ${project.name}, or start with a suggestion below.`
            : 'Ask about any project you can access, or start with a suggestion below.'}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        {QUICK_ACTIONS.map(({ key, label, hint, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onAction(key)}
            disabled={!configured}
            className="flex min-h-24 flex-col items-start gap-2 rounded-xl border bg-card p-3 text-left shadow-xs transition-colors hover:border-primary/40 hover:bg-sage/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:bg-card"
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-sage text-primary">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-semibold leading-snug text-foreground">{label}</span>
              <span className="text-xs leading-snug text-muted-foreground">{hint}</span>
            </span>
          </button>
        ))}
      </div>
      <p className="rounded-lg border border-dashed bg-card/60 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        Answers are AI-generated from records you can access and may be incomplete. The assistant is read-only: it never
        sends, approves, or changes anything.
      </p>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-foreground">
          <span className="sr-only">You: </span>
          {message.text}
        </p>
      </div>
    )
  }

  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-sage text-primary" aria-hidden="true">
        <Sparkles className="size-3.5" />
      </span>
      <div className="flex min-w-0 max-w-[85%] flex-col gap-2">
        <span className="sr-only">Assistant: </span>
        {message.status === 'loading' && (
          <div className="flex w-fit items-center gap-1 rounded-2xl rounded-tl-md border bg-card px-3.5 py-3" aria-label="Assistant is responding">
            {[0, 150, 300].map((delay) => (
              <span
                key={delay}
                className="size-1.5 animate-bounce rounded-full bg-primary/50 motion-reduce:animate-none"
                style={{ animationDelay: `${delay}ms` }}
              />
            ))}
          </div>
        )}
        {message.status === 'error' && (
          <div className="flex items-start gap-2 rounded-2xl rounded-tl-md border border-destructive/30 bg-destructive/5 px-3.5 py-2.5 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {message.text}
          </div>
        )}
        {message.status === 'answer' && (
          <>
            <div className="flex flex-col gap-2 rounded-2xl rounded-tl-md border bg-card px-3.5 py-3">
              <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-foreground">{message.text}</p>
            </div>
            <div className="flex items-center gap-1">
              <CopyButton text={message.text} />
            </div>
            {message.reviewDraft && <ReviewArea />}
          </>
        )}
      </div>
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }
  return (
    <Button variant="ghost" size="sm" onClick={copy} className="h-7 gap-1.5 px-2 text-xs text-muted-foreground">
      {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

function ReviewArea() {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-primary/30 bg-sage/30 p-3">
      <span className="text-xs font-semibold text-foreground">Review before sending</span>
      <p className="text-xs leading-relaxed text-muted-foreground">
        This draft was not sent. Copy it, fill in any placeholders, check every detail, and send it yourself from your
        usual channel.
      </p>
    </div>
  )
}

function Composer({
  configured,
  busy,
  draft,
  onDraftChange,
  onSend,
}: {
  configured: boolean
  busy: boolean
  draft: string
  onDraftChange: (v: string) => void
  onSend: () => void
}) {
  const canSend = configured && !busy && draft.trim().length > 0
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (canSend) onSend()
      }}
      className="border-t bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3"
    >
      {!configured && (
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
          The AI provider is not reachable in this environment.
        </p>
      )}
      <div
        className={cn(
          'flex items-end gap-2 rounded-xl border bg-background p-1.5 transition-colors focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15',
          !configured && 'opacity-60',
        )}
      >
        <label htmlFor="assistant-input" className="sr-only">
          Message B &amp; J AI
        </label>
        <textarea
          id="assistant-input"
          rows={1}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return
            e.preventDefault()
            if (canSend) onSend()
          }}
          maxLength={2000}
          disabled={!configured}
          placeholder={configured ? 'Ask about a project…' : 'Chat is unavailable until AI is configured'}
          className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-2 text-base leading-snug outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed sm:text-sm"
        />
        <Button type="submit" size="icon-sm" disabled={!canSend} aria-label="Send message" className="mb-0.5 size-8">
          <Send aria-hidden="true" />
        </Button>
      </div>
    </form>
  )
}
