'use client'

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, AlertTriangle, Check, ChevronLeft, ChevronRight, CircleSlash, Cloud, CloudOff, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import {
  saveStaffWalkthroughResponse,
  saveWalkthroughResponse,
  submitStaffWalkthroughAction,
  submitWalkthroughAction,
} from '@/app/actions/walkthroughs'
import { MediaUploader, type MediaMeta } from '@/components/walkthroughs/media-uploader'
import {
  ISSUE_DESCRIPTION_MAX,
  MEDIA_BUCKET,
  RESPONSE_LABELS,
  RESPONSE_ORDER,
  type MediaItem,
  type ResponseValue,
} from '@/lib/walkthroughs'

export type ChecklistItem = { id: string; category: string; label: string }
export type SavedResponse = { response: ResponseValue | null; draft_description: string | null }

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type ItemState = { response: ResponseValue | null; description: string; saveState: SaveState; error?: string }

type ChecklistFormProps = {
  walkthroughId: string
  organizationId: string
  userId: string
  items: ChecklistItem[]
  responses: Record<string, SavedResponse>
  attachments: Record<string, MediaItem[]>
  /** `staff` saves through the builder-lead RPCs and returns to `doneHref` after submitting. */
  mode?: 'homeowner' | 'staff'
  doneHref?: string
}

const RESPONSE_ICON = { satisfactory: Check, needs_attention: AlertTriangle, not_applicable: CircleSlash }

export function ChecklistForm({
  walkthroughId,
  organizationId,
  userId,
  items,
  responses,
  attachments,
  mode = 'homeowner',
  doneHref,
}: ChecklistFormProps) {
  const router = useRouter()
  const saveResponse = mode === 'staff' ? saveStaffWalkthroughResponse : saveWalkthroughResponse
  const submitChecklist = mode === 'staff' ? submitStaffWalkthroughAction : submitWalkthroughAction
  const categories = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, ChecklistItem[]>()
    for (const item of items) {
      if (!map.has(item.category)) {
        map.set(item.category, [])
        order.push(item.category)
      }
      map.get(item.category)!.push(item)
    }
    return order.map((name) => ({ name, items: map.get(name)! }))
  }, [items])

  const [state, setState] = useState<Record<string, ItemState>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.id,
        { response: responses[i.id]?.response ?? null, description: responses[i.id]?.draft_description ?? '', saveState: 'idle' },
      ]),
    ),
  )
  const [media, setMedia] = useState<Record<string, MediaItem[]>>(attachments)
  const [active, setActive] = useState(0)
  const [showErrors, setShowErrors] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, startSubmit] = useTransition()

  const stateRef = useRef(state)
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
  const inflight = useRef(new Map<string, Promise<void>>())

  function patch(itemId: string, change: Partial<ItemState>) {
    setState((prev) => {
      const next = { ...prev, [itemId]: { ...prev[itemId], ...change } }
      stateRef.current = next
      return next
    })
  }

  function runSave(itemId: string) {
    const previous = inflight.current.get(itemId) ?? Promise.resolve()
    const task = previous.then(async () => {
      const current = stateRef.current[itemId]
      patch(itemId, { saveState: 'saving' })
      const result = await saveResponse({
        itemId,
        response: current.response,
        description: current.description.trim() ? current.description : null,
      })
      patch(itemId, result.error ? { saveState: 'error', error: result.error } : { saveState: 'saved', error: undefined })
    })
    inflight.current.set(itemId, task)
    return task
  }

  function scheduleSave(itemId: string, delay: number) {
    const existing = timers.current.get(itemId)
    if (existing) clearTimeout(existing)
    timers.current.set(
      itemId,
      setTimeout(() => {
        timers.current.delete(itemId)
        void runSave(itemId)
      }, delay),
    )
  }

  async function flushSaves() {
    for (const [itemId, timer] of timers.current) {
      clearTimeout(timer)
      timers.current.delete(itemId)
      void runSave(itemId)
    }
    await Promise.all(inflight.current.values())
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const pending = timers.current.size > 0 || Object.values(stateRef.current).some((s) => s.saveState === 'saving')
      if (pending) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const setResponse = (itemId: string, response: ResponseValue) => {
    patch(itemId, { response })
    scheduleSave(itemId, 0)
  }
  const setDescription = (itemId: string, description: string) => {
    patch(itemId, { description: description.slice(0, ISSUE_DESCRIPTION_MAX) })
    scheduleSave(itemId, 800)
  }
  const discardNote = (itemId: string) => {
    patch(itemId, { description: '' })
    scheduleSave(itemId, 0)
  }

  const unanswered = items.filter((i) => !state[i.id].response)
  const missingNotes = items.filter((i) => state[i.id].response === 'needs_attention' && !state[i.id].description.trim())
  const flagged = items.filter((i) => state[i.id].response === 'needs_attention')
  const answeredCount = items.length - unanswered.length
  const progress = items.length ? Math.round((answeredCount / items.length) * 100) : 0
  const reviewIndex = categories.length
  const anySaving = Object.values(state).some((s) => s.saveState === 'saving')
  const anySaveError = Object.values(state).some((s) => s.saveState === 'error')

  function goTo(index: number) {
    setActive(index)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function handleSubmit() {
    setSubmitError(null)
    if (unanswered.length || missingNotes.length) {
      setShowErrors(true)
      const first = unanswered[0] ?? missingNotes[0]
      const index = categories.findIndex((c) => c.name === first.category)
      setActive(index)
      requestAnimationFrame(() => document.getElementById(`item-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    startSubmit(async () => {
      await flushSaves()
      if (Object.values(stateRef.current).some((s) => s.saveState === 'error')) {
        setSubmitError('Some answers could not be saved. Check your connection and try again.')
        return
      }
      const result = await submitChecklist(walkthroughId)
      if (result.error) setSubmitError(result.error)
      else if (doneHref) router.push(doneHref)
      else router.refresh()
    })
  }

  const category = categories[active]

  return (
    <div className="grid gap-6 lg:grid-cols-[15rem_1fr] lg:gap-10">
      <nav aria-label="Checklist sections" className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-foreground">Progress</span>
            <span className="tabular-nums text-muted-foreground">{`${answeredCount} of ${items.length}`}</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label="Checklist progress"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <SaveIndicator saving={anySaving} error={anySaveError} />
        </div>
        <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0">
          {categories.map((c, index) => {
            const done = c.items.filter((i) => state[i.id].response).length
            const issues = c.items.filter((i) => state[i.id].response === 'needs_attention').length
            const hasError = showErrors && c.items.some((i) => !state[i.id].response || (state[i.id].response === 'needs_attention' && !state[i.id].description.trim()))
            return (
              <li key={c.name} className="shrink-0">
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={active === index ? 'step' : undefined}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg border px-3 py-2 text-left text-sm transition-colors lg:border-transparent',
                    active === index ? 'border-primary bg-primary/10 font-medium text-primary lg:border-primary/20' : 'bg-card text-foreground hover:bg-muted lg:bg-transparent',
                  )}
                >
                  <span className="flex items-center gap-2">
                    {hasError && <AlertCircle className="size-4 text-destructive" aria-label="Needs your input" />}
                    {c.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted-foreground">
                    {issues > 0 && (
                      <span className="rounded-full bg-warning/15 px-1.5 py-0.5 font-medium text-warning-foreground">{issues}</span>
                    )}
                    {`${done}/${c.items.length}`}
                  </span>
                </button>
              </li>
            )
          })}
          <li className="shrink-0 lg:mt-2 lg:border-t lg:pt-2">
            <button
              type="button"
              onClick={() => goTo(reviewIndex)}
              aria-current={active === reviewIndex ? 'step' : undefined}
              className={cn(
                'w-full whitespace-nowrap rounded-lg border px-3 py-2 text-left text-sm font-medium transition-colors lg:border-transparent',
                active === reviewIndex ? 'border-primary bg-primary text-primary-foreground' : 'bg-card text-foreground hover:bg-muted lg:bg-transparent',
              )}
            >
              Review & submit
            </button>
          </li>
        </ol>
      </nav>

      <div className="flex min-w-0 flex-col gap-4">
        {category ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="font-serif text-2xl font-semibold text-foreground">{category.name}</h2>
              <span className="text-sm text-muted-foreground">{`Section ${active + 1} of ${categories.length}`}</span>
            </div>
            <ul className="flex flex-col gap-4">
              {category.items.map((item) => (
                <li key={item.id}>
                  <ChecklistItemCard
                    item={item}
                    state={state[item.id]}
                    showErrors={showErrors}
                    media={media[item.id] ?? []}
                    onResponse={(r) => setResponse(item.id, r)}
                    onDescription={(d) => setDescription(item.id, d)}
                    onDiscard={() => discardNote(item.id)}
                    onMediaChange={(list) => setMedia((prev) => ({ ...prev, [item.id]: list }))}
                    pathFor={(name) => `walkthroughs/${walkthroughId}/${item.id}/${name}`}
                    register={async (meta) => {
                      const { data, error } = await createClient()
                        .from('walkthrough_attachments')
                        .insert({ ...meta, organization_id: organizationId, walkthrough_id: walkthroughId, item_id: item.id, uploaded_by: userId })
                        .select('id')
                        .single()
                      return error ? { error: 'The file uploaded but could not be linked. Please try again.' } : { id: data.id }
                    }}
                    unregister={async (m) => {
                      const supabase = createClient()
                      const { error } = await supabase.from('walkthrough_attachments').delete().eq('id', m.id)
                      if (error) return 'That file could not be removed.'
                      await supabase.storage.from(MEDIA_BUCKET).remove([m.storage_path])
                      return null
                    }}
                  />
                </li>
              ))}
            </ul>
          </>
        ) : (
          <ReviewPanel
            total={items.length}
            unanswered={unanswered}
            missingNotes={missingNotes}
            flagged={flagged}
            state={state}
            media={media}
            onJump={(item) => {
              setActive(categories.findIndex((c) => c.name === item.category))
              requestAnimationFrame(() => document.getElementById(`item-${item.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
            }}
          />
        )}

        {submitError && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {submitError}
          </p>
        )}
        {showErrors && (unanswered.length > 0 || missingNotes.length > 0) && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {[
              unanswered.length && `${unanswered.length} item${unanswered.length === 1 ? '' : 's'} still need a response`,
              missingNotes.length && `${missingNotes.length} flagged item${missingNotes.length === 1 ? '' : 's'} need a description`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        )}

        <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <Button type="button" variant="ghost" size="lg" disabled={active === 0} onClick={() => goTo(active - 1)}>
            <ChevronLeft data-icon="inline-start" />
            Previous
          </Button>
          {active < reviewIndex ? (
            <Button type="button" size="lg" className="h-11" onClick={() => goTo(active + 1)}>
              {active === reviewIndex - 1 ? 'Review & submit' : `Next: ${categories[active + 1]?.name}`}
              <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button type="button" size="lg" className="h-11" disabled={submitting} onClick={handleSubmit}>
              {submitting ? 'Submitting...' : 'Submit walkthrough'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function SaveIndicator({ saving, error }: { saving: boolean; error: boolean }) {
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {saving ? (
        <>
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Saving draft...
        </>
      ) : error ? (
        <span className="flex items-center gap-1.5 text-destructive">
          <CloudOff className="size-3.5" aria-hidden="true" />
          Some changes did not save
        </span>
      ) : (
        <>
          <Cloud className="size-3.5" aria-hidden="true" />
          Draft saves automatically
        </>
      )}
    </p>
  )
}

type ItemCardProps = {
  item: ChecklistItem
  state: ItemState
  showErrors: boolean
  media: MediaItem[]
  onResponse: (r: ResponseValue) => void
  onDescription: (d: string) => void
  onDiscard: () => void
  onMediaChange: (items: MediaItem[]) => void
  pathFor: (name: string) => string
  register: (meta: MediaMeta) => Promise<{ id?: string; error?: string }>
  unregister: (item: MediaItem) => Promise<string | null>
}

function ChecklistItemCard({ item, state, showErrors, media, onResponse, onDescription, onDiscard, onMediaChange, pathFor, register, unregister }: ItemCardProps) {
  const flagged = state.response === 'needs_attention'
  const missingResponse = showErrors && !state.response
  const missingNote = showErrors && flagged && !state.description.trim()
  const descriptionId = `desc-${item.id}`
  const hasDraftNote = !flagged && state.description.trim().length > 0

  return (
    <fieldset
      id={`item-${item.id}`}
      className={cn(
        'flex scroll-mt-24 flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5',
        flagged && 'border-warning/60',
        (missingResponse || missingNote) && 'border-destructive',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <legend className="text-base font-medium text-foreground">{item.label}</legend>
        <ItemSaveState state={state} />
      </div>

      <div role="radiogroup" aria-label={`${item.label} condition`} className="grid grid-cols-3 gap-2">
        {RESPONSE_ORDER.map((value) => {
          const Icon = RESPONSE_ICON[value]
          const selected = state.response === value
          return (
            <label
              key={value}
              className={cn(
                'flex min-h-11 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 sm:flex-row sm:gap-2 sm:text-sm',
                !selected && 'bg-background text-foreground hover:bg-muted',
                selected && value === 'satisfactory' && 'border-primary bg-primary text-primary-foreground',
                selected && value === 'needs_attention' && 'border-warning bg-warning/15 text-warning-foreground',
                selected && value === 'not_applicable' && 'border-foreground/30 bg-muted text-foreground',
              )}
            >
              <input
                type="radio"
                name={`response-${item.id}`}
                value={value}
                checked={selected}
                onChange={() => onResponse(value)}
                className="sr-only"
              />
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {RESPONSE_LABELS[value]}
            </label>
          )
        })}
      </div>
      {missingResponse && <p className="text-xs text-destructive">Choose a response for this item.</p>}

      {flagged && (
        <div className="flex flex-col gap-4 border-t pt-4">
          <div className="flex flex-col gap-2">
            <label htmlFor={descriptionId} className="text-sm font-medium text-foreground">
              Describe the issue
              <span className="text-destructive" aria-hidden="true">
                {' *'}
              </span>
            </label>
            <p id={`${descriptionId}-hint`} className="text-xs leading-relaxed text-muted-foreground">
              Please explain what you observed and what needs to be repaired or corrected.
            </p>
            <Textarea
              id={descriptionId}
              value={state.description}
              onChange={(e) => onDescription(e.target.value)}
              maxLength={ISSUE_DESCRIPTION_MAX}
              rows={5}
              required
              aria-required="true"
              aria-invalid={missingNote || undefined}
              aria-describedby={`${descriptionId}-hint ${descriptionId}-count${missingNote ? ` ${descriptionId}-error` : ''}`}
              placeholder="For example: The cabinet door below the sink is misaligned and does not close properly."
              className="min-h-32 w-full text-base sm:text-sm"
            />
            <div className="flex items-center justify-between gap-3 text-xs">
              {missingNote ? (
                <span id={`${descriptionId}-error`} className="text-destructive">
                  A description is required for items that need attention.
                </span>
              ) : (
                <span />
              )}
              <span id={`${descriptionId}-count`} className="tabular-nums text-muted-foreground">
                {`${state.description.length.toLocaleString()} / ${ISSUE_DESCRIPTION_MAX.toLocaleString()}`}
              </span>
            </div>
          </div>
          <MediaUploader evidence="original" floatingCameraLabel={`${item.label} photos`} items={media} onItemsChange={onMediaChange} pathFor={pathFor} register={register} unregister={unregister} />
        </div>
      )}

      {hasDraftNote && (
        <div className="flex flex-col gap-3 rounded-lg bg-muted p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {`Your issue note is kept as a draft and won't be submitted while this item is marked ${RESPONSE_LABELS[state.response!]}.`}
          </p>
          <div className="flex shrink-0 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onResponse('needs_attention')}>
              Restore note
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
              Discard note
            </Button>
          </div>
        </div>
      )}
      {!flagged && media.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {`${media.length} attached file${media.length === 1 ? '' : 's'} will only be sent if this item is marked Needs Attention.`}
        </p>
      )}
    </fieldset>
  )
}

function ItemSaveState({ state }: { state: ItemState }) {
  if (state.saveState === 'saving') return <span className="shrink-0 text-xs text-muted-foreground">Saving...</span>
  if (state.saveState === 'error')
    return (
      <span role="alert" className="shrink-0 text-xs text-destructive">
        {state.error ?? 'Not saved'}
      </span>
    )
  if (state.saveState === 'saved') return <span className="shrink-0 text-xs text-muted-foreground">Saved</span>
  return null
}

function ReviewPanel({
  total,
  unanswered,
  missingNotes,
  flagged,
  state,
  media,
  onJump,
}: {
  total: number
  unanswered: ChecklistItem[]
  missingNotes: ChecklistItem[]
  flagged: ChecklistItem[]
  state: Record<string, ItemState>
  media: Record<string, MediaItem[]>
  onJump: (item: ChecklistItem) => void
}) {
  const ready = !unanswered.length && !missingNotes.length
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-2xl font-semibold text-foreground">Review & submit</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {ready
            ? `All ${total} items have a response. Each item marked Needs Attention will be sent to your builder as a repair request with your description, exactly as written.`
            : 'Finish the items below before submitting. Your answers are saved as you go.'}
        </p>
      </div>

      {(unanswered.length > 0 || missingNotes.length > 0) && (
        <section aria-labelledby="todo-heading" className="flex flex-col gap-2 rounded-xl border border-destructive/40 bg-card p-4">
          <h3 id="todo-heading" className="text-sm font-semibold text-foreground">
            Still to do
          </h3>
          <ul className="flex flex-col divide-y">
            {[...unanswered.map((i) => ({ i, why: 'Needs a response' })), ...missingNotes.map((i) => ({ i, why: 'Needs a description' }))].map(({ i, why }) => (
              <li key={`${i.id}-${why}`}>
                <button type="button" onClick={() => onJump(i)} className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-primary">
                  <span>
                    <span className="text-muted-foreground">{`${i.category} · `}</span>
                    {i.label}
                  </span>
                  <span className="shrink-0 text-xs text-destructive">{why}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="flagged-heading" className="flex flex-col gap-3">
        <h3 id="flagged-heading" className="text-sm font-semibold text-foreground">
          {`Items needing attention (${flagged.length})`}
        </h3>
        {flagged.length ? (
          <ul className="flex flex-col gap-3">
            {flagged.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">
                    <span className="text-muted-foreground">{`${i.category} · `}</span>
                    {i.label}
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => onJump(i)}>
                    Edit
                  </Button>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">
                  {state[i.id].description.trim() || <span className="text-destructive">No description yet</span>}
                </p>
                {(media[i.id]?.length ?? 0) > 0 && (
                  <p className="text-xs text-muted-foreground">{`${media[i.id].length} attachment${media[i.id].length === 1 ? '' : 's'}`}</p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
            Nothing flagged. Your builder will be notified that the walkthrough is complete.
          </p>
        )}
      </section>
    </div>
  )
}
