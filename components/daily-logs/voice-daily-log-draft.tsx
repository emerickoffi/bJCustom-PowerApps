'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { VoiceCapture, postJson } from '@/components/voice/voice-capture'
import { VOICE_LIMITS, mergeDecision } from '@/lib/voice'
import { DAILY_LOG_TRANSCRIPT_MAX, DAILY_LOG_VOICE_TEXT_FIELDS, type DailyLogVoiceCrew, type DailyLogVoiceDraft, type DailyLogVoiceTextField } from '@/lib/voice-daily-log'

type FieldName = DailyLogVoiceTextField | 'temperature_f'
type Conflict = { name: FieldName; label: string; value: string; long: boolean }
type Review = { filled: string[]; conflicts: Conflict[]; notes: string[] }

const FIELD_LABELS: Record<FieldName, string> = {
  temperature_f: 'Temperature',
  weather_conditions: 'Conditions',
  weather_impact: 'Weather impact',
  site_conditions: 'Site conditions',
  work_performed: 'Work performed',
  progress_notes: 'Progress notes',
  work_planned_next: 'Planned next work',
  materials_delivered: 'Materials delivered',
  equipment_used: 'Equipment on site',
  delivery_notes: 'Delivery notes',
  delay_description: 'Delay description',
  delay_reason: 'Delay reason',
  delay_impact: 'Delay impact',
  corrective_actions: 'Corrective actions',
  safety_observations: 'Safety observations',
}

/** Short single-line fields get Replace / Keep; longer notes can also be added to what is there. */
const SHORT_FIELDS = new Set<FieldName>(['temperature_f', 'weather_conditions', 'delay_reason', 'delay_impact'])

/**
 * Speak the day's report, review the transcript, then fill the surrounding daily log form. Nothing is
 * saved here: the user still checks every section and saves the draft with the form's own button.
 */
export function VoiceDailyLogDraft({
  projectId,
  formRef,
  onAddCrews,
  disabled,
}: {
  projectId: string
  formRef: React.RefObject<HTMLFormElement | null>
  /** Appends crew rows to the form; returns how many fitted under the crew limit. */
  onAddCrews: (crews: DailyLogVoiceCrew[]) => number
  disabled?: boolean
}) {
  const [review, setReview] = useState<Review | null>(null)

  function field(name: FieldName) {
    const el = formRef.current?.elements.namedItem(name)
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el : null
  }

  /** Lets the form's device autosave notice the change, as if it had been typed. */
  function notifyForm() {
    requestAnimationFrame(() => formRef.current?.dispatchEvent(new Event('input', { bubbles: true })))
  }

  function setField(name: FieldName, value: string) {
    const el = field(name)
    if (!el) return
    el.value = value
    const details = el.closest('details')
    if (details) details.open = true
    notifyForm()
  }

  function applyDraft(draft: DailyLogVoiceDraft) {
    const filled: string[] = []
    const conflicts: Conflict[] = []
    const notes: string[] = []
    const consider = (name: FieldName, value: string) => {
      const decision = mergeDecision(field(name)?.value ?? '', value)
      if (decision === 'fill') {
        setField(name, value)
        filled.push(FIELD_LABELS[name])
      } else if (decision === 'conflict') {
        conflicts.push({ name, label: FIELD_LABELS[name], value, long: !SHORT_FIELDS.has(name) })
      }
    }
    if (draft.temperature_f) consider('temperature_f', draft.temperature_f)
    for (const [name, value] of Object.entries(draft.fields) as [DailyLogVoiceTextField, string][]) consider(name, value)

    if (draft.crews.length) {
      const added = onAddCrews(draft.crews)
      if (added) {
        filled.push(added === 1 ? '1 crew entry' : `${added} crew entries`)
        notifyForm()
      }
      if (added < draft.crews.length) notes.push(`${draft.crews.length - added} more crew entries did not fit under the crew limit. Add them by hand if needed.`)
      for (const c of draft.crews.slice(0, added)) {
        if (c.companyChoices.length > 1) notes.push(`“${c.companyMention}” matches several subcontractors. Pick the right one in the ${c.trade} crew row.`)
        else if (c.companyMention && !c.subcontractor_company_id) notes.push(`“${c.companyMention}” is not an active subcontractor, so the ${c.trade} crew is recorded as own crew / not listed.`)
      }
    }

    setReview({ filled, conflicts, notes })
  }

  async function prepareDraft(transcript: string, signal: AbortSignal) {
    const res = await postJson<{ draft: DailyLogVoiceDraft }>(
      `/api/projects/${projectId}/voice-daily-log/draft`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transcript }) },
      VOICE_LIMITS.extractTimeoutMs + 10_000,
      signal,
    )
    applyDraft(res.draft)
  }

  function resolveConflict(conflict: Conflict, choice: 'replace' | 'append' | 'keep') {
    if (choice === 'replace') setField(conflict.name, conflict.value)
    if (choice === 'append' && conflict.name !== 'temperature_f') {
      const joined = `${field(conflict.name)?.value.trim() ?? ''}\n${conflict.value}`.trim()
      setField(conflict.name, joined.slice(0, DAILY_LOG_VOICE_TEXT_FIELDS[conflict.name]))
    }
    setReview((r) => (r ? { ...r, conflicts: r.conflicts.filter((c) => c.name !== conflict.name) } : r))
  }

  return (
    <VoiceCapture
      projectId={projectId}
      title="Speak today’s log"
      fileName="daily-log"
      transcriptMax={DAILY_LOG_TRANSCRIPT_MAX}
      hasDraft={review !== null}
      onPrepare={prepareDraft}
      onClear={() => setReview(null)}
      disabled={disabled}
    >
      {review === null ? (
        <p className="text-xs text-muted-foreground">Say what work was done, who was on site, deliveries, delays, safety, and what is planned next. Use Record more to add to it.</p>
      ) : (
        <div role="status" className="flex flex-col gap-2 rounded-md border bg-background p-3 text-sm">
          <p className="font-medium text-foreground">
            {review.filled.length ? `Filled: ${review.filled.join(', ')}. Review each section before saving.` : 'No empty fields were filled. Review the suggestions below.'}
          </p>
          {review.conflicts.map((c) => (
            <div key={c.name} className="flex flex-col gap-2 rounded-md bg-muted/50 p-2">
              <p className="text-foreground">
                <span className="font-medium">{`${c.label} already has text. `}</span>
                <span className="whitespace-pre-line text-muted-foreground">{`Voice suggests: “${c.value}”`}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {c.long && (
                  <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => resolveConflict(c, 'append')}>
                    Add to mine
                  </Button>
                )}
                <Button type="button" size="sm" variant="outline" className="h-9" onClick={() => resolveConflict(c, 'replace')}>
                  Replace
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => resolveConflict(c, 'keep')}>
                  Keep mine
                </Button>
              </div>
            </div>
          ))}
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
