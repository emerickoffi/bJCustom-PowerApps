'use client'

import { useActionState, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { AlertCircle, Check, ClipboardList as ClipboardListIcon, ListChecks as ListChecksIcon, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createWalkthroughAction } from '@/app/actions/walkthroughs'
import { initialActionState } from '@/lib/action-state'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { FieldShell, FormSection, NativeSelect, TextAreaField, TextField } from '@/components/shared/form-field'
import { useSmartForm } from '@/components/shared/smart-form'
import { DEFAULT_CHECKLIST, WALKTHROUGH_TYPE_LABELS } from '@/lib/walkthroughs'
import {
  buildChecklistPayload,
  checklistSummary,
  findChecklistProblem,
  previewItemNumbers,
  suggestTitle,
  type BuilderItem,
  type BuilderSection,
} from '@/lib/walkthrough-builder'
import { ChecklistBuilderSection, itemLabelId, newItemId, sectionNameId } from '@/components/walkthroughs/checklist-builder-section'

const DISCARD_PROMPT = 'You have unsaved changes. Discard them and leave this page?'
const DEFAULT_TYPE = 'final'

let counter = 0
const key = () => `k${++counter}`

function defaultSections(): BuilderSection[] {
  return DEFAULT_CHECKLIST.map((s) => ({
    key: key(),
    category: s.category,
    items: s.items.map((label) => ({ key: key(), label, number: '', location: '' })),
  }))
}

export function WalkthroughBuilder({ projectId }: { projectId: string }) {
  const [state, formAction] = useActionState(createWalkthroughAction.bind(null, projectId), initialActionState)
  const { dirty, formProps } = useSmartForm(state, 'walkthrough-new')
  const v = state.values ?? {}
  const fe = state.fieldErrors ?? {}

  const [type, setType] = useState(v.walkthrough_type ?? DEFAULT_TYPE)
  const [title, setTitle] = useState(v.title ?? suggestTitle(DEFAULT_TYPE, '', false))
  const [titleEdited, setTitleEdited] = useState(false)
  const [titleError, setTitleError] = useState<string>()

  const [sections, setSections] = useState<BuilderSection[]>(defaultSections)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [editing, setEditing] = useState(false)
  const [checklistError, setChecklistError] = useState<string>()
  const [showErrors, setShowErrors] = useState(false)
  const [newCategory, setNewCategory] = useState('')

  const payload = buildChecklistPayload(sections)
  const numbers = previewItemNumbers(sections)
  const allOpen = sections.length > 0 && sections.every((s) => open.has(s.key))
  const cancelHref = `/projects/${projectId}/walkthroughs`

  function toggle(sectionKey: string) {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(sectionKey)) next.delete(sectionKey)
      else next.add(sectionKey)
      return next
    })
  }

  function updateSection(sectionKey: string, change: (s: BuilderSection) => BuilderSection) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? change(s) : s)))
  }

  function updateItem(sectionKey: string, itemKey: string, patch: Partial<BuilderItem>) {
    updateSection(sectionKey, (s) => ({ ...s, items: s.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)) }))
  }

  function addCategory() {
    const name = newCategory.trim()
    if (!name) return
    const sectionKey = key()
    flushSync(() => {
      setSections((prev) => [...prev, { key: sectionKey, category: name, items: [] }])
      setOpen((prev) => new Set(prev).add(sectionKey))
      setNewCategory('')
    })
    document.getElementById(newItemId(sectionKey))?.focus()
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const titleProblem = title.trim().length < 2 ? 'Enter a title' : undefined
    const problem = findChecklistProblem(sections)
    setTitleError(titleProblem)
    setChecklistError(problem?.message)
    if (!titleProblem && !problem) return

    e.preventDefault()
    setShowErrors(true)
    if (titleProblem) {
      document.getElementById('title')?.focus()
      return
    }
    if (!problem) return
    flushSync(() => {
      setEditing(true)
      if (problem.kind !== 'empty') setOpen((prev) => new Set(prev).add(problem.sectionKey))
    })
    const targetId =
      problem.kind === 'section' ? sectionNameId(problem.sectionKey) : problem.kind === 'item' ? itemLabelId(problem.itemKey) : 'new-section'
    const target = document.getElementById(targetId)
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    target?.focus({ preventScroll: true })
  }

  return (
    <form action={formAction} {...formProps} onSubmit={handleSubmit}>
      <input type="hidden" name="items" value={JSON.stringify(payload)} />

      <FormSection icon={ClipboardListIcon} title="Details" description="The homeowner sees the title and message in their portal.">
        <TextField
          name="title"
          label="Title"
          required
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setTitleEdited(true)
            if (titleError) setTitleError(undefined)
          }}
          error={titleError ?? fe.title}
          maxLength={160}
          className="sm:col-span-2"
        />
        <FieldShell name="walkthrough_type" label="Type" required error={fe.walkthrough_type}>
          <NativeSelect
            id="walkthrough_type"
            name="walkthrough_type"
            required
            value={type}
            aria-invalid={fe.walkthrough_type ? true : undefined}
            aria-describedby={fe.walkthrough_type ? 'walkthrough_type-error' : undefined}
            onChange={(e) => {
              setType(e.target.value)
              setTitle((current) => suggestTitle(e.target.value, current, titleEdited))
            }}
          >
            {Object.entries(WALKTHROUGH_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </FieldShell>
        <TextField name="scheduled_date" label="Scheduled date" type="date" defaultValue={v.scheduled_date} error={fe.scheduled_date} />
        <TextAreaField
          name="instructions"
          label="Message to homeowner (optional)"
          defaultValue={v.instructions}
          error={fe.instructions}
          maxLength={2000}
          className="sm:col-span-2"
          inputClassName="min-h-20"
          hint="For example: walk each room in order and test every door, drawer, and fixture."
        />
      </FormSection>

      <section aria-labelledby="checklist-heading" className="rounded-xl border border-border/80 bg-card shadow-xs">
        <header className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4 sm:px-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
            <ListChecksIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="checklist-heading" className="text-sm font-semibold text-foreground">
              Checklist
            </h2>
            <p className="text-sm text-muted-foreground tabular-nums" aria-live="polite">
              {checklistSummary(sections)}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {sections.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((s) => s.key)))}
              >
                {allOpen ? 'Collapse all' : 'Expand all'}
              </Button>
            )}
            <Button type="button" variant={editing ? 'default' : 'outline'} size="sm" aria-pressed={editing} onClick={() => setEditing((e) => !e)}>
              {editing ? <Check data-icon="inline-start" /> : <Pencil data-icon="inline-start" />}
              {editing ? 'Done editing' : 'Edit checklist'}
            </Button>
          </div>
        </header>

        {(checklistError || fe.items) && (
          <p role="alert" className="mx-4 mt-4 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive sm:mx-5">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {checklistError ?? fe.items}
          </p>
        )}

        {sections.length > 0 && (
          <ul className="flex flex-col divide-y divide-border/60">
            {sections.map((section) => (
              <ChecklistBuilderSection
                key={section.key}
                section={section}
                open={open.has(section.key)}
                editing={editing}
                showErrors={showErrors}
                numbers={numbers}
                onToggle={() => toggle(section.key)}
                onRename={(name) => updateSection(section.key, (s) => ({ ...s, category: name }))}
                onRemove={() => setSections((prev) => prev.filter((s) => s.key !== section.key))}
                onUpdateItem={(itemKey, patch) => updateItem(section.key, itemKey, patch)}
                onRemoveItem={(itemKey) => updateSection(section.key, (s) => ({ ...s, items: s.items.filter((i) => i.key !== itemKey) }))}
                onAddItem={(label) =>
                  updateSection(section.key, (s) => ({ ...s, items: [...s.items, { key: key(), label, number: '', location: '' }] }))
                }
              />
            ))}
          </ul>
        )}

        {editing && (
          <div className="flex items-center gap-2 border-t border-border/60 p-4 sm:px-5">
            <Input
              id="new-section"
              aria-label="New section name"
              placeholder="New section, e.g. Basement"
              value={newCategory}
              maxLength={80}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault()
                  addCategory()
                }
              }}
              className="h-9 min-w-0 flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addCategory} disabled={!newCategory.trim()}>
              <Plus data-icon="inline-start" />
              Add section
            </Button>
          </div>
        )}
      </section>

      <div className="sticky bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-20 flex flex-col gap-3 rounded-xl border border-border/80 bg-card/95 p-3 shadow-md backdrop-blur max-[599.98px]:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] tablet:bottom-[calc(4.75rem+env(safe-area-inset-bottom))] supports-backdrop-filter:bg-card/85 sm:p-4">
        <FormMessage state={state} />
        <div className="flex items-center justify-end gap-2">
          <p className="mr-auto hidden text-xs text-muted-foreground sm:block" aria-live="polite">
            {dirty ? 'Unsaved changes' : 'Fields marked * are required.'}
          </p>
          <Button
            variant="outline"
            size="lg"
            render={
              <Link
                href={cancelHref}
                data-skip-leave-guard
                onClick={(e) => {
                  if (dirty && !window.confirm(DISCARD_PROMPT)) e.preventDefault()
                }}
              />
            }
            nativeButton={false}
          >
            Cancel
          </Button>
          <SubmitButton pendingLabel="Creating...">Create walkthrough</SubmitButton>
        </div>
      </div>
    </form>
  )
}
