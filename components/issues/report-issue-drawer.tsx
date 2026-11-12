'use client'

import { useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronDown, ImagePlus, Link2, Plus, X } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { SelectField, TextAreaField, TextField } from '@/components/shared/form-field'
import { createClient } from '@/lib/supabase/client'
import { reportFieldIssueAction } from '@/app/actions/field-issues'
import { useIssueDraft } from '@/components/issues/use-issue-draft'
import { VoicePunchDraft } from '@/components/issues/voice-punch-draft'
import { ISSUE_PRIORITIES, MAX_MEDIA_BYTES, MEDIA_BUCKET, PRIORITY_LABELS, mediaKindFor, safeFileName } from '@/lib/walkthroughs'
import type { AssigneeOption, IssueSource } from '@/lib/field-issues'
import type { ActionState } from '@/lib/action-state'

type Props = {
  projectId: string
  projectLabel: string
  organizationId: string
  userId: string
  assignees: AssigneeOption[]
  categories: string[]
  source?: IssueSource
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
}

type Saved = { id: string; photoWarning: string | null }

export function ReportIssueDrawer({
  projectId,
  projectLabel,
  organizationId,
  userId,
  assignees,
  categories,
  source,
  triggerLabel = 'Report issue',
  triggerVariant = 'outline',
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [state, setState] = useState<ActionState>({})
  const [saved, setSaved] = useState<Saved | null>(null)
  const [photos, setPhotos] = useState<File[]>([])
  const [photoError, setPhotoError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const draft = useIssueDraft({
    open,
    formRef,
    userId,
    orgId: organizationId,
    projectId,
    sourceId: source?.id ?? null,
  })

  function reset() {
    setRequestId(crypto.randomUUID())
    setState({})
    setSaved(null)
    setPhotos([])
    setPhotoError(null)
    setDirty(false)
    formRef.current?.reset()
  }

  function handleOpenChange(next: boolean) {
    if (!next && pending) return
    if (!next && dirty && !saved && photos.length && !window.confirm('Close this issue? Your text is kept on this device as a draft, but the selected photos will need to be added again.')) return
    setOpen(next)
    if (!next) reset()
  }

  function discardDraft() {
    draft.clear()
    reset()
  }

  function addPhotos(files: FileList | null) {
    if (!files) return
    const accepted: File[] = []
    for (const file of Array.from(files)) {
      if (!mediaKindFor(file.type)) {
        setPhotoError(`${file.name} is not a supported photo or video.`)
        continue
      }
      if (file.size > MAX_MEDIA_BYTES) {
        setPhotoError(`${file.name} is larger than 50 MB.`)
        continue
      }
      accepted.push(file)
    }
    if (accepted.length) {
      setPhotos((prev) => [...prev, ...accepted].slice(0, 10))
      setDirty(true)
    }
  }

  async function uploadPhotos(issueId: string): Promise<string | null> {
    if (!photos.length) return null
    const supabase = createClient()
    let failed = 0
    for (const file of photos) {
      const path = `issues/${issueId}/original/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        failed++
        continue
      }
      const { error: linkError } = await supabase.from('issue_attachments').insert({
        organization_id: organizationId,
        issue_id: issueId,
        attachment_kind: 'original',
        storage_path: path,
        file_name: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        media_kind: mediaKindFor(file.type),
        uploaded_by: userId,
      })
      if (linkError) failed++
    }
    return failed ? `${failed} of ${photos.length} photo${photos.length === 1 ? '' : 's'} could not be attached. Add them from the issue page.` : null
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    startTransition(async () => {
      const result = await reportFieldIssueAction(formData)
      setState(result)
      if (!result.savedId) return
      draft.clear()
      const photoWarning = await uploadPhotos(result.savedId)
      setSaved({ id: result.savedId, photoWarning })
      router.refresh()
    })
  }

  const fieldError = (name: string) => state.fieldErrors?.[name]

  return (
    <>
      <Button type="button" variant={triggerVariant} onClick={() => setOpen(true)}>
        <AlertTriangle className="size-4" aria-hidden="true" />
        {triggerLabel}
      </Button>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-lg">
          <SheetHeader className="border-b p-5">
            <SheetTitle className="type-section-title">Report issue</SheetTitle>
            <SheetDescription>Recorded for the builder team only. Homeowners do not see field issues.</SheetDescription>
          </SheetHeader>

          {saved ? (
            <div className="flex flex-col gap-4 p-5" role="status">
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-medium text-foreground">{state.success ?? 'Issue reported.'}</p>
                  <p className="text-sm text-muted-foreground">
                    The issue is open. Anyone assigned sees it in their work list in the app. Nothing is emailed.
                  </p>
                </div>
              </div>
              {saved.photoWarning && (
                <p className="rounded-md bg-warning/15 px-3 py-2 text-sm text-warning-foreground">{saved.photoWarning}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Link href={`/projects/${projectId}/issues/${saved.id}`} className={buttonVariants({ variant: 'default' })}>
                  Open issue
                </Link>
                <Button type="button" variant="outline" onClick={reset}>
                  <Plus className="size-4" aria-hidden="true" />
                  Report another
                </Button>
              </div>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} onChange={() => {
                setDirty(true)
                draft.save()
              }}
              className="flex flex-col gap-5 p-5"
              noValidate
            >
              <input type="hidden" name="request_id" value={requestId} />
              {draft.restoredAt && (
                <div role="status" className="flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-foreground">
                    {`Unsent draft restored from ${new Date(draft.restoredAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}. It is only on this device until you report it. Photos are not kept.`}
                  </p>
                  <Button type="button" variant="ghost" size="sm" className="h-10 shrink-0" onClick={discardDraft}>
                    Discard draft
                  </Button>
                </div>
              )}
              <input type="hidden" name="project_id" value={projectId} />
              {source?.kind === 'daily_log' && <input type="hidden" name="source_daily_log_id" value={source.id} />}
              {source?.kind === 'walkthrough' && <input type="hidden" name="source_walkthrough_id" value={source.id} />}

              <dl className="flex flex-col gap-1 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Project</dt>
                  <dd className="font-medium text-foreground">{projectLabel}</dd>
                </div>
                {source && (
                  <div className="flex items-center gap-2">
                    <dt className="flex items-center gap-1 text-muted-foreground">
                      <Link2 className="size-3.5" aria-hidden="true" />
                      Linked to
                    </dt>
                    <dd className="font-medium text-foreground">{source.label}</dd>
                  </div>
                )}
              </dl>

              <VoicePunchDraft
                projectId={projectId}
                formRef={formRef}
                assignees={assignees}
                disabled={pending}
                onApplied={() => {
                  setDirty(true)
                  draft.save()
                }}
              />

              <TextField name="title" label="Title" required maxLength={160} autoFocus error={fieldError('title')} placeholder="e.g. Cracked tile at front entry" />
              <TextAreaField
                name="description"
                label="What did you see?"
                required
                rows={4}
                maxLength={5000}
                error={fieldError('description')}
              />

              <div className="flex flex-col gap-2">
                <span className="text-sm font-medium text-foreground">Photos</span>
                <label className="flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed px-3 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:bg-muted/40 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
                  <ImagePlus className="size-4" aria-hidden="true" />
                  Add photos or video
                  <input
                    type="file"
                    accept="image/*,video/*"
                    capture="environment"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addPhotos(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
                {photoError && <p className="text-sm text-destructive">{photoError}</p>}
                {photos.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {photos.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                        <span className="truncate">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => setPhotos((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <details className="group rounded-lg border">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-medium text-foreground">
                  More details
                  <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                    Location, category, assignee, due date, priority
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  </span>
                </summary>
                <div className="flex flex-col gap-4 border-t p-3">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField name="location" label="Location / area" maxLength={120} error={fieldError('location')} placeholder="e.g. Primary bath" />
                    <TextField name="category" label="Category" maxLength={80} list="field-issue-categories" error={fieldError('category')} placeholder="General" />
                    <datalist id="field-issue-categories">
                      {categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </div>
                  <SelectField
                    name="responsible_user_id"
                    label="Responsible person"
                    placeholder="Unassigned"
                    options={assignees}
                    error={fieldError('responsible_user_id')}
                    hint="Only builder staff who can already see this project are listed. Assigning does not change anyone's access."
                  />
                  <Link href={`/projects/${projectId}/contacts`} className="-mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline">
                    Manage access
                  </Link>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <TextField name="due_date" label="Due date" type="date" error={fieldError('due_date')} />
                    <SelectField
                      name="priority"
                      label="Priority"
                      defaultValue="normal"
                      options={ISSUE_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }))}
                    />
                  </div>
                </div>
              </details>

              {state.error && (
                <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {state.error}
                </p>
              )}

              <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={() => handleOpenChange(false)} disabled={pending}>
                  Cancel
                </Button>
                <Button type="submit" disabled={pending}>
                  {pending ? 'Reporting...' : 'Report issue'}
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
