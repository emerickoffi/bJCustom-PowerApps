'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Check, ClipboardList, ImageIcon, Send, Sparkles, Star, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Surface } from '@/components/shared/page-header'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format'
import {
  CLIENT_UPDATE_SECTIONS,
  clientUpdateState,
  hasPublishableContent,
  type ClientUpdateRow,
  type ClientUpdateSectionKey,
} from '@/lib/client-updates'
import type { CandidateActivity, CandidateLog, CandidatePhoto, DraftPhoto, DraftSource } from '@/lib/client-updates-data'
import {
  deleteClientUpdateDraftAction,
  draftClientUpdateWithAiAction,
  publishClientUpdateAction,
  saveClientUpdateAction,
} from '@/app/actions/client-updates'

type Props = {
  projectId: string
  update: ClientUpdateRow
  initialSources: DraftSource[]
  initialPhotos: DraftPhoto[]
  candidates: { logs: CandidateLog[]; activities: CandidateActivity[]; photos: CandidatePhoto[] }
  canEdit: boolean
  aiAvailable: boolean
}

type PhotoPick = { source_type: DraftPhoto['source_type']; source_id: string; caption: string; is_cover: boolean; url: string | null }
type Status = { tone: 'ok' | 'error'; text: string } | null

const k = (t: string, id: string) => `${t}:${id}`

export function ClientUpdateComposer({ projectId, update, initialSources, initialPhotos, candidates, canEdit, aiAvailable }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [version, setVersion] = useState(update.version)
  const [status, setStatus] = useState<Status>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [title, setTitle] = useState(update.title)
  const [period, setPeriod] = useState({ start: update.period_start, end: update.period_end })
  const [sections, setSections] = useState<Record<ClientUpdateSectionKey, string>>(() =>
    Object.fromEntries(CLIENT_UPDATE_SECTIONS.map((s) => [s.key, update[s.key] ?? ''])) as Record<ClientUpdateSectionKey, string>,
  )
  const [aiAssisted, setAiAssisted] = useState(update.ai_assisted)
  const [sources, setSources] = useState(() => new Set(initialSources.map((s) => k(s.source_type, s.source_id))))
  const [photos, setPhotos] = useState<PhotoPick[]>(() => initialPhotos.map((p) => ({ ...p, caption: p.caption ?? '' })))

  const disabled = !canEdit || pending
  const periodChanged = period.start !== update.period_start || period.end !== update.period_end
  const state = clientUpdateState({ ...update, version })

  const toggleSource = (key: string) =>
    setSources((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const togglePhoto = (c: CandidatePhoto) =>
    setPhotos((prev) => {
      const key = k(c.source_type, c.source_id)
      if (prev.some((p) => k(p.source_type, p.source_id) === key)) return prev.filter((p) => k(p.source_type, p.source_id) !== key)
      if (prev.length >= 24) return prev
      return [...prev, { source_type: c.source_type, source_id: c.source_id, caption: c.caption ?? '', is_cover: prev.length === 0, url: c.url }]
    })

  const buildPayload = () => ({
    title,
    period_start: period.start,
    period_end: period.end,
    ...Object.fromEntries(CLIENT_UPDATE_SECTIONS.map((s) => [s.key, sections[s.key]])),
    ai_assisted: aiAssisted,
    sources: [...sources].map((key) => {
      const [source_type, source_id] = key.split(':')
      return { source_type: source_type as DraftSource['source_type'], source_id }
    }),
    photos: photos.map((p) => ({ source_type: p.source_type, source_id: p.source_id, caption: p.caption, is_cover: p.is_cover })),
  }) as Parameters<typeof saveClientUpdateAction>[3]

  const save = () =>
    new Promise<number | null>((resolve) => {
      startTransition(async () => {
        const res = await saveClientUpdateAction(projectId, update.id, version, buildPayload())
        if (!res.ok) {
          setStatus({ tone: 'error', text: res.error })
          resolve(null)
          return
        }
        setVersion(res.version)
        setStatus({ tone: 'ok', text: res.message ?? 'Saved.' })
        resolve(res.version)
      })
    })

  const onSave = async () => {
    const v = await save()
    if (v !== null && periodChanged) router.push(`?from=${period.start}&to=${period.end}`)
    else if (v !== null) router.refresh()
  }

  const onPublish = async () => {
    setConfirmPublish(false)
    const v = await save()
    if (v === null) return
    startTransition(async () => {
      const res = await publishClientUpdateAction(projectId, update.id, v)
      setStatus(res.ok ? { tone: 'ok', text: res.message ?? 'Published.' } : { tone: 'error', text: res.error })
      if (res.ok) router.refresh()
    })
  }

  const onAiDraft = () =>
    startTransition(async () => {
      const selected = [...sources]
        .map((key) => key.split(':'))
        .filter(([t]) => t === 'daily_log' || t === 'schedule_activity')
        .map(([source_type, source_id]) => ({ source_type: source_type as 'daily_log' | 'schedule_activity', source_id }))
      const res = await draftClientUpdateWithAiAction(projectId, period.start, period.end, selected)
      if (!res.ok) return setStatus({ tone: 'error', text: res.error })
      setSections((prev) => ({
        ...prev,
        overview: res.draft.overview ?? prev.overview,
        completed_work: res.draft.completed_work ?? prev.completed_work,
        in_progress_work: res.draft.in_progress_work ?? prev.in_progress_work,
        upcoming_work: res.draft.upcoming_work ?? prev.upcoming_work,
      }))
      setAiAssisted(true)
      setStatus({ tone: 'ok', text: 'AI draft added. Read and edit every section before saving — nothing was saved yet.' })
    })

  const publishable = hasPublishableContent(sections) && title.trim().length > 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex flex-col gap-6">
        <Surface aria-label="Update details">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">Title</span>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} disabled={disabled} className="h-11" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">From</span>
              <Input type="date" value={period.start} onChange={(e) => setPeriod((p) => ({ ...p, start: e.target.value }))} disabled={disabled} className="h-11 md:w-44" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">To</span>
              <Input type="date" value={period.end} onChange={(e) => setPeriod((p) => ({ ...p, end: e.target.value }))} disabled={disabled} className="h-11 md:w-44" />
            </label>
          </div>
          {periodChanged && <p className="text-sm text-muted-foreground">Save to refresh the daily logs and photos available for the new dates.</p>}
        </Surface>

        <Surface aria-label="Update sections">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-foreground">What the homeowner will read</h2>
            {aiAvailable && canEdit && (
              <Button type="button" variant="outline" size="sm" onClick={onAiDraft} disabled={disabled}>
                <Sparkles className="size-4" aria-hidden="true" />
                Draft from selected sources
              </Button>
            )}
          </div>
          {aiAssisted && <p className="text-sm text-muted-foreground">Parts of this update were drafted with AI from the selected sources. Review them carefully.</p>}
          {CLIENT_UPDATE_SECTIONS.map((s) => (
            <label key={s.key} className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-foreground">{s.label}</span>
              <span className="text-muted-foreground">{s.hint}</span>
              <Textarea
                value={sections[s.key]}
                onChange={(e) => setSections((prev) => ({ ...prev, [s.key]: e.target.value }))}
                maxLength={4000}
                rows={s.key === 'overview' ? 3 : 4}
                disabled={disabled}
              />
            </label>
          ))}
        </Surface>

        <Surface aria-label="Photos">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <ImageIcon className="size-4" aria-hidden="true" />
              Photos
            </h2>
            <span className="text-sm text-muted-foreground">{photos.length} of 24 selected</span>
          </div>
          {photos.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {photos.map((p) => (
                <li key={k(p.source_type, p.source_id)} className="flex gap-3 rounded-md border p-2">
                  {p.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                    <img src={p.url} alt={p.caption || 'Selected photo'} className="size-20 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="size-20 shrink-0 rounded bg-muted" aria-hidden="true" />
                  )}
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Input
                      value={p.caption}
                      placeholder="Caption for the homeowner"
                      maxLength={300}
                      aria-label="Photo caption"
                      disabled={disabled}
                      onChange={(e) => setPhotos((prev) => prev.map((x) => (x === p ? { ...x, caption: e.target.value } : x)))}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={p.is_cover ? 'secondary' : 'ghost'}
                        disabled={disabled}
                        aria-pressed={p.is_cover}
                        onClick={() => setPhotos((prev) => prev.map((x) => ({ ...x, is_cover: x === p })))}
                      >
                        <Star className={cn('size-4', p.is_cover && 'fill-current')} aria-hidden="true" />
                        {p.is_cover ? 'Cover' : 'Make cover'}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => setPhotos((prev) => prev.filter((x) => x !== p))}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {candidates.photos.length === 0 ? (
            <p className="text-sm text-muted-foreground">No photos from finalized daily logs or issue reports in this period.</p>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-foreground">Available from this period</span>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                {candidates.photos.map((c) => {
                  const selected = photos.some((p) => k(p.source_type, p.source_id) === k(c.source_type, c.source_id))
                  return (
                    <li key={k(c.source_type, c.source_id)}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => togglePhoto(c)}
                        aria-pressed={selected}
                        aria-label={`${selected ? 'Remove' : 'Add'} photo from ${c.label}, ${formatDate(c.date)}`}
                        className={cn(
                          'relative block aspect-square w-full overflow-hidden rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                          selected ? 'border-primary' : 'border-transparent hover:border-border',
                        )}
                      >
                        {c.url ? (
                          // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                          <img src={c.url} alt="" className="size-full object-cover" />
                        ) : (
                          <span className="block size-full bg-muted" />
                        )}
                        {selected && (
                          <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground">
                            <Check className="size-3" aria-hidden="true" />
                          </span>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </Surface>
      </div>

      <aside className="flex flex-col gap-6">
        <Surface aria-label="Publish" className="gap-4">
          <h2 className="text-base font-semibold text-foreground">Review & publish</h2>
          <p className="text-sm text-muted-foreground">
            {state === 'draft' && 'This update has never been shared. Homeowners cannot see it.'}
            {state === 'published' && `Revision ${update.revision} is live in the homeowner portal.`}
            {state === 'pending_changes' && `Revision ${update.revision} is live. Your newer edits are not visible until you publish again.`}
          </p>
          {status && (
            <p role={status.tone === 'error' ? 'alert' : 'status'} className={cn('text-sm', status.tone === 'error' ? 'text-destructive' : 'text-foreground')}>
              {status.text}
            </p>
          )}
          {canEdit ? (
            <div className="flex flex-col gap-2">
              <Button type="button" variant="outline" onClick={onSave} disabled={disabled}>
                Save draft
              </Button>
              {confirmPublish ? (
                <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
                  <p className="text-sm text-foreground">Publish to the homeowner portal? No email or text message is sent.</p>
                  <div className="flex gap-2">
                    <Button type="button" onClick={onPublish} disabled={disabled} className="flex-1">
                      Publish
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => setConfirmPublish(false)} disabled={pending}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button type="button" onClick={() => setConfirmPublish(true)} disabled={disabled || !publishable}>
                  <Send className="size-4" aria-hidden="true" />
                  {update.revision > 0 ? 'Publish new revision' : 'Publish'}
                </Button>
              )}
              {!publishable && <p className="text-xs text-muted-foreground">Add a title and an overview or work section to publish.</p>}
              {update.revision === 0 && (
                <form action={deleteClientUpdateDraftAction}>
                  <input type="hidden" name="project_id" value={projectId} />
                  <input type="hidden" name="update_id" value={update.id} />
                  <Button type="submit" variant="ghost" size="sm" disabled={pending} className="w-full text-destructive hover:text-destructive">
                    <Trash2 className="size-4" aria-hidden="true" />
                    Delete draft
                  </Button>
                </form>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">You can view this update. Administrators and project managers edit and publish.</p>
          )}
        </Surface>

        <Surface aria-label="Sources" className="gap-4">
          <h2 className="text-base font-semibold text-foreground">Sources</h2>
          <p className="text-sm text-muted-foreground">Only finalized daily logs and published schedule activities are listed. Internal notes are never shared.</p>
          <SourceGroup icon={ClipboardList} title="Daily logs" empty="No finalized daily logs in this period.">
            {candidates.logs.map((l) => (
              <SourceItem key={l.id} checked={sources.has(k('daily_log', l.id))} disabled={disabled} onToggle={() => toggleSource(k('daily_log', l.id))} label={formatDate(l.log_date)} detail={l.work_performed} />
            ))}
          </SourceGroup>
          <SourceGroup icon={CalendarDays} title="Schedule" empty="No published schedule activities.">
            {candidates.activities.map((a) => (
              <SourceItem
                key={a.id}
                checked={sources.has(k('schedule_activity', a.id))}
                disabled={disabled}
                onToggle={() => toggleSource(k('schedule_activity', a.id))}
                label={a.name}
                detail={`${a.status.replace(/_/g, ' ')} · ${a.percent_complete ?? 0}%`}
              />
            ))}
          </SourceGroup>
        </Surface>
      </aside>
    </div>
  )
}

function SourceGroup({ icon: Icon, title, empty, children }: { icon: React.ComponentType<{ className?: string }>; title: string; empty: string; children: React.ReactNode[] }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Icon className="size-4" aria-hidden="true" />
        {title}
      </legend>
      {children.length ? <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">{children}</ul> : <p className="text-sm text-muted-foreground">{empty}</p>}
    </fieldset>
  )
}

function SourceItem({ checked, disabled, onToggle, label, detail }: { checked: boolean; disabled: boolean; onToggle: () => void; label: string; detail: string | null }) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 rounded-md p-2 text-sm hover:bg-muted/50">
        <input type="checkbox" checked={checked} onChange={onToggle} disabled={disabled} className="mt-0.5 size-4 accent-primary" />
        <span className="flex min-w-0 flex-col">
          <span className="font-medium text-foreground">{label}</span>
          {detail && <span className="line-clamp-2 text-muted-foreground">{detail}</span>}
        </span>
      </label>
    </li>
  )
}
