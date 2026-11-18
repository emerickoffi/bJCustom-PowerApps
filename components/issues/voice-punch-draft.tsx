'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { VoiceCapture, localToday, postJson } from '@/components/voice/voice-capture'
import { formatDate } from '@/lib/format'
import { VOICE_LIMITS, mergeDecision, type AssigneeChoice, type VoiceDraft } from '@/lib/voice-punch'

type FieldName = 'title' | 'description' | 'location' | 'responsible_user_id' | 'due_date'
type Conflict = { name: FieldName; label: string; value: string; display: string }
type Review = { filled: string[]; conflicts: Conflict[]; assigneeChoices: AssigneeChoice[]; notes: string[] }

const FIELD_LABELS: Record<FieldName, string> = {
  title: 'Title',
  description: 'Description',
  location: 'Location',
  responsible_user_id: 'Responsible person',
  due_date: 'Due date',
}

/**
 * Speak a punch item, review the transcript, then fill the surrounding report form. Nothing is saved
 * or sent to anyone here: the user still confirms with the form's own Report button.
 */
export function VoicePunchDraft({
  projectId,
  formRef,
  assignees,
  onApplied,
  disabled,
}: {
  projectId: string
  formRef: React.RefObject<HTMLFormElement | null>
  assignees: AssigneeChoice[]
  onApplied: () => void
  disabled?: boolean
}) {
  const [review, setReview] = useState<Review | null>(null)

  function field(name: FieldName) {
    const el = formRef.current?.elements.namedItem(name)
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el : null
  }

  function setField(name: FieldName, value: string) {
    const el = field(name)
    if (!el) return
    el.value = value
    if (name === 'location' || name === 'responsible_user_id' || name === 'due_date') {
      const details = el.closest('details')
      if (details) details.open = true
    }
    onApplied()
  }

  function applyDraft(draft: VoiceDraft) {
    const filled: string[] = []
    const conflicts: Conflict[] = []
    const notes: string[] = []
    const consider = (name: FieldName, value: string, display = value) => {
      const decision = mergeDecision(field(name)?.value ?? '', value)
      if (decision === 'fill') {
        setField(name, value)
        filled.push(FIELD_LABELS[name])
      } else if (decision === 'conflict') {
        conflicts.push({ name, label: FIELD_LABELS[name], value, display })
      }
    }
    consider('title', draft.title)
    consider('description', draft.description)
    consider('location', draft.location)

    let assigneeChoices: AssigneeChoice[] = []
    if (draft.assignee.mention) {
      if (draft.assignee.matches.length === 1) {
        consider('responsible_user_id', draft.assignee.matches[0].value, draft.assignee.matches[0].label)
      } else if (draft.assignee.matches.length > 1) {
        assigneeChoices = draft.assignee.matches
      } else {
        notes.push(
          `You said to assign it to “${draft.assignee.mention}”, but nobody by that name can own issues on this project. It stays unassigned; a subcontractor can be assigned from the issue page after you report it.`,
        )
      }
    }

    if (draft.dueDate.phrase) {
      if (draft.dueDate.date && !draft.dueDate.needsReview) {
        consider('due_date', draft.dueDate.date, `${formatDate(draft.dueDate.date)} (from “${draft.dueDate.phrase}”)`)
        if (field('due_date')?.value === draft.dueDate.date) notes.push(`Due date set to ${formatDate(draft.dueDate.date)} from “${draft.dueDate.phrase}”. Check it is right.`)
      } else {
        notes.push(`“${draft.dueDate.phrase}” could not be turned into one exact date. Pick the due date below.`)
      }
    }

    setReview({ filled, conflicts, assigneeChoices, notes })
  }

  async function prepareDraft(transcript: string, signal: AbortSignal) {
    const res = await postJson<{ draft: VoiceDraft }>(
      `/api/projects/${projectId}/voice-punch/draft`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, today: localToday(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      },
      VOICE_LIMITS.extractTimeoutMs + 10_000,
      signal,
    )
    applyDraft(res.draft)
  }

  function resolveConflict(conflict: Conflict, replace: boolean) {
    if (replace) setField(conflict.name, conflict.value)
    setReview((r) => (r ? { ...r, conflicts: r.conflicts.filter((c) => c.name !== conflict.name) } : r))
  }

  function chooseAssignee(choice: AssigneeChoice) {
    setField('responsible_user_id', choice.value)
    setReview((r) => (r ? { ...r, assigneeChoices: [], filled: [...r.filled, FIELD_LABELS.responsible_user_id] } : r))
  }

  return (
    <VoiceCapture
      projectId={projectId}
      title="Speak the issue"
      fileName="punch-note"
      hasDraft={review !== null}
      onPrepare={prepareDraft}
      onClear={() => setReview(null)}
      disabled={disabled}
    >
      {review && (
        <div role="status" className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm">
          <p className="font-medium text-foreground">
            {review.filled.length ? `Filled: ${review.filled.join(', ')}. Review the form below before reporting.` : 'No empty fields were filled. Review the suggestions below.'}
          </p>
          {review.conflicts.map((c) => (
            <div key={c.name} className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
              <p className="text-foreground">
                <span className="font-medium">{`${c.label} already has text. `}</span>
                <span className="text-muted-foreground">{`Voice suggests: “${c.display}”`}</span>
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => resolveConflict(c, true)}>
                  Replace
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => resolveConflict(c, false)}>
                  Keep mine
                </Button>
              </div>
            </div>
          ))}
          {review.assigneeChoices.length > 0 && (
            <fieldset className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
              <legend className="sr-only">Choose the responsible person</legend>
              <p className="text-foreground">Several people match the name you said. Choose one, or leave it unassigned.</p>
              <div className="flex flex-wrap gap-2">
                {review.assigneeChoices.map((a) => (
                  <Button key={a.value} type="button" size="sm" variant="outline" className="h-auto min-h-9 whitespace-normal text-left" onClick={() => chooseAssignee(a)}>
                    {a.label}
                  </Button>
                ))}
              </div>
            </fieldset>
          )}
          {review.notes.map((n) => (
            <p key={n} className="text-muted-foreground">
              {n}
            </p>
          ))}
        </div>
      )}
    </VoiceCapture>
  )
}
