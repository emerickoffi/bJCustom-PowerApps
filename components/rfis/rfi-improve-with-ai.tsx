'use client'

import { useState } from 'react'
import { AlertCircle, Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RfiSuggestion } from '@/app/api/rfis/improve/route'

type Draft = { subject: string; question: string; location: string }

/**
 * Asks the AI for a clearer wording of what the user typed and shows it for review.
 * Nothing in the form changes until the user chooses "Use this wording".
 */
export function RfiImproveWithAi({
  projectId,
  draft,
  disabled,
  onAccept,
}: {
  projectId: string
  draft: Draft
  disabled: boolean
  onAccept: (s: { subject: string; question: string }) => void
}) {
  const [state, setState] = useState<
    { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; suggestion: RfiSuggestion; basis: Draft }
  >({ kind: 'idle' })

  const hasText = draft.subject.trim().length + draft.question.trim().length >= 3

  async function improve() {
    const basis = { ...draft }
    setState({ kind: 'loading' })
    try {
      const res = await fetch('/api/rfis/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ...basis }),
      })
      const body = (await res.json().catch(() => null)) as { suggestion?: RfiSuggestion; error?: string } | null
      if (!res.ok || !body?.suggestion) {
        setState({ kind: 'error', message: body?.error ?? 'A suggestion could not be prepared right now. Your text is unchanged.' })
        return
      }
      setState({ kind: 'ready', suggestion: body.suggestion, basis })
    } catch {
      setState({ kind: 'error', message: 'The connection was interrupted. Your text is unchanged.' })
    }
  }

  if (state.kind !== 'ready') {
    return (
      <div className="flex flex-col items-start gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || !hasText || state.kind === 'loading'}
          onClick={improve}
        >
          {state.kind === 'loading' ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Sparkles className="size-4" aria-hidden="true" />
          )}
          {state.kind === 'loading' ? 'Preparing a suggestion…' : 'Improve with AI'}
        </Button>
        {state.kind === 'error' ? (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {state.message}
          </p>
        ) : !hasText ? (
          <p className="text-xs text-muted-foreground">Write a subject or question first, then ask for a clearer wording.</p>
        ) : null}
      </div>
    )
  }

  const { suggestion, basis } = state
  const editedSince = basis.subject !== draft.subject || basis.question !== draft.question
  const replacesText = Boolean(draft.subject.trim() || draft.question.trim())

  return (
    <section aria-label="AI suggestion" className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary">
        <Sparkles className="size-3.5" aria-hidden="true" />
        Suggested wording. Review it before using it.
      </p>
      {suggestion.subject && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Subject</span>
          <p className="text-sm font-medium text-foreground">{suggestion.subject}</p>
        </div>
      )}
      {suggestion.question && (
        <div className="flex flex-col gap-0.5">
          <span className="text-xs text-muted-foreground">Question</span>
          <p className="whitespace-pre-wrap text-sm text-foreground">{suggestion.question}</p>
        </div>
      )}
      {suggestion.missing_information.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">The responder may also need</span>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {suggestion.missing_information.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      {suggestion.clarifying_questions.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Questions you could add</span>
          <ul className="list-disc pl-5 text-sm text-foreground">
            {suggestion.clarifying_questions.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {editedSince
          ? 'You edited the text after asking. Using this wording replaces your latest edits.'
          : replacesText
            ? 'Using this wording replaces the subject and question you typed.'
            : 'Using this wording fills in the subject and question.'}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onAccept({ subject: suggestion.subject || draft.subject, question: suggestion.question || draft.question })
            setState({ kind: 'idle' })
          }}
        >
          Use this wording
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setState({ kind: 'idle' })}>
          Keep my text
        </Button>
      </div>
    </section>
  )
}
