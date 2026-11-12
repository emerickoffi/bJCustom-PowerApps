'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ChevronDown, ListChecks, Lock, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { createSelectionsAction } from '@/app/actions/selections'
import {
  MAX_SELECTIONS_PER_BATCH,
  blankDraft,
  hasMoreDetails,
  isDraftTouched,
  validateDraft,
  type DraftErrors,
  type DraftField,
  type SelectionDraft,
} from '@/lib/selection-drafts'
import { selectionPath } from '@/lib/selections'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  projectId: string
  projectName: string
  categories: string[]
  locations: string[]
}

const newKey = () => crypto.randomUUID()

export function NewSelectionDrawer({ open, onOpenChange, projectId, projectName, categories, locations }: Props) {
  const [entries, setEntries] = useState<SelectionDraft[]>(() => [blankDraft(newKey())])
  const [errors, setErrors] = useState<Record<string, DraftErrors>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [knownCategories, setKnownCategories] = useState(categories)
  const focusKey = useRef<string | null>(null)
  const keepRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setKnownCategories(categories), [categories])

  useEffect(() => {
    if (!focusKey.current) return
    document.getElementById(`sel-${focusKey.current}-name`)?.focus()
    focusKey.current = null
  }, [entries])

  const dirty = entries.some(isDraftTouched)

  function reset(carry?: Pick<SelectionDraft, 'category' | 'location'>) {
    const fresh = blankDraft(newKey(), carry)
    focusKey.current = fresh.key
    setEntries([fresh])
    setErrors({})
    setFormError(null)
    setConfirming(false)
  }

  function requestClose() {
    if (pending) return
    if (dirty && !confirming) {
      setConfirming(true)
      requestAnimationFrame(() => keepRef.current?.focus())
      return
    }
    onOpenChange(false)
    reset()
  }

  function update(key: string, field: DraftField, value: string) {
    setEntries((list) => list.map((e) => (e.key === key ? { ...e, [field]: value } : e)))
    setErrors((all) => {
      if (!all[key]?.[field]) return all
      const { [field]: _removed, ...rest } = all[key]
      return { ...all, [key]: rest }
    })
    setConfirming(false)
  }

  function addEntry() {
    const last = entries[entries.length - 1]
    // Room and category usually repeat across a batch; dates, money and notes never carry over.
    const entry = blankDraft(newKey(), { category: last?.category ?? '', location: last?.location ?? '' })
    focusKey.current = entry.key
    setEntries((list) => [...list, entry])
  }

  function removeEntry(key: string) {
    setEntries((list) => (list.length === 1 ? list : list.filter((e) => e.key !== key)))
    setErrors(({ [key]: _removed, ...rest }) => rest)
  }

  function submit(mode: 'close' | 'another') {
    if (pending) return
    const clientErrors: Record<string, DraftErrors> = {}
    for (const e of entries) {
      const { errors: found } = validateDraft(e)
      if (Object.keys(found).length) clientErrors[e.key] = found
    }
    if (Object.keys(clientErrors).length) {
      setErrors(clientErrors)
      setFormError(entries.length > 1 ? 'Fix the highlighted entries before saving.' : null)
      const first = entries.find((e) => clientErrors[e.key])!
      const field = (Object.keys(clientErrors[first.key]) as DraftField[])[0]
      document.getElementById(`sel-${first.key}-${field}`)?.focus()
      return
    }
    setFormError(null)
    startTransition(async () => {
      const result = await createSelectionsAction({ project_id: projectId, entries })
      if (!result.ok) {
        setErrors(result.entryErrors ?? {})
        setFormError(result.error)
        return
      }
      setKnownCategories((list) => [...new Set([...list, ...entries.map((e) => e.category.trim())])].sort((a, b) => a.localeCompare(b)))
      const count = result.created.length
      const only = count === 1 ? result.created[0] : null
      toast.success(count === 1 ? 'Selection created' : `${count} selections created`, {
        description: only ? 'Add product options when you’re ready.' : undefined,
        action: only ? { label: 'Add options', onClick: () => router.push(selectionPath(projectId, only.id)) } : undefined,
      })
      if (mode === 'another') {
        const last = entries[entries.length - 1]
        reset({ category: last.category, location: last.location })
      } else {
        onOpenChange(false)
        reset()
      }
    })
  }

  const count = entries.length

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? onOpenChange(true) : requestClose())}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl data-[side=right]:lg:max-w-2xl">
        {confirming && (
          <div
            role="alertdialog"
            aria-labelledby="sel-discard-title"
            className="flex shrink-0 flex-col gap-3 border-b border-amber-300/70 bg-amber-50 px-6 py-3.5 pr-14 text-amber-950 sm:flex-row sm:items-center dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100"
          >
            <p id="sel-discard-title" className="flex flex-1 items-center gap-2 text-sm font-medium">
              <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
              Discard {count === 1 ? 'this selection' : `${count} selections`}?
            </p>
            <div className="flex gap-2">
              <Button ref={keepRef} type="button" size="sm" variant="outline" className="bg-background" onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
              <Button type="button" size="sm" variant="destructive" onClick={requestClose}>
                Discard
              </Button>
            </div>
          </div>
        )}

        <form
          className="flex h-full min-h-0 flex-col"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit('close')
          }}
        >
          <SheetHeader className="gap-1 border-b border-border/70 px-6 pb-5 pt-6">
            <div className="flex items-center gap-3 pr-8">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sage text-primary ring-1 ring-inset ring-primary/10" aria-hidden="true">
                <ListChecks className="size-5" />
              </span>
              <div className="flex min-w-0 flex-col">
                <SheetTitle className="type-section-title text-foreground">{count === 1 ? 'New selection' : `New selections (${count})`}</SheetTitle>
                <SheetDescription className="truncate">{projectName}</SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <datalist id="sel-category-options">
            {knownCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <datalist id="sel-location-options">
            {locations.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
            {entries.map((entry, index) => (
              <DraftEntry
                key={entry.key}
                entry={entry}
                index={index}
                multiple={count > 1}
                errors={errors[entry.key] ?? {}}
                knownCategories={knownCategories}
                disabled={pending}
                onChange={(field, value) => update(entry.key, field, value)}
                onRemove={() => removeEntry(entry.key)}
              />
            ))}

            {count < MAX_SELECTIONS_PER_BATCH && (
              <button
                type="button"
                onClick={addEntry}
                disabled={pending}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-sage/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                <Plus className="size-4" aria-hidden="true" />
                Add another selection
              </button>
            )}
          </div>

          <SheetFooter className="mt-0 gap-3 border-t border-border/70 bg-muted/30 px-6 py-4">
            {formError && (
              <p role="alert" className="text-sm text-destructive">
                {formError}
              </p>
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
              <Button type="button" variant="ghost" onClick={requestClose} disabled={pending}>
                Cancel
              </Button>
              {count === 1 && (
                <Button type="button" variant="outline" onClick={() => submit('another')} disabled={pending}>
                  Save & add another
                </Button>
              )}
              <Button type="submit" disabled={pending} aria-busy={pending}>
                {pending ? 'Saving…' : count === 1 ? 'Create selection' : `Create ${count} selections`}
              </Button>
            </div>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}

function DraftEntry({
  entry,
  index,
  multiple,
  errors,
  knownCategories,
  disabled,
  onChange,
  onRemove,
}: {
  entry: SelectionDraft
  index: number
  multiple: boolean
  errors: DraftErrors
  knownCategories: string[]
  disabled: boolean
  onChange: (field: DraftField, value: string) => void
  onRemove: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(() => hasMoreDetails(entry))
  const id = (f: DraftField) => `sel-${entry.key}-${f}`
  const typedCategory = entry.category.trim()
  const isNewCategory = typedCategory.length >= 2 && !knownCategories.some((c) => c.toLowerCase() === typedCategory.toLowerCase())
  const hasErrors = Object.keys(errors).length > 0
  // Hidden fields with an error must be revealed so the user can find them.
  const showMore = moreOpen || Boolean(errors.description || errors.cost_code || errors.notes || errors.internal_notes)

  return (
    <fieldset
      aria-label={multiple ? `Selection ${index + 1}` : undefined}
      className={cn('flex min-w-0 flex-col gap-4', multiple && 'rounded-xl border bg-card p-4', multiple && hasErrors && 'border-destructive/50')}
    >
      {multiple && (
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span className="flex size-6 items-center justify-center rounded-full bg-sage text-xs tabular-nums text-primary" aria-hidden="true">
              {index + 1}
            </span>
            {entry.name.trim() || `Selection ${index + 1}`}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onRemove} disabled={disabled} aria-label={`Remove selection ${index + 1}`}>
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      <Field id={id('name')} label="Selection name" required error={errors.name}>
        <Input id={id('name')} value={entry.name} onChange={(e) => onChange('name', e.target.value)} placeholder="Kitchen faucet" maxLength={160} autoComplete="off" disabled={disabled} aria-invalid={!!errors.name} aria-describedby={errors.name ? `${id('name')}-error` : undefined} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id('category')} label="Category" required error={errors.category} hint={isNewCategory && !errors.category ? 'New category — it will be added to your list' : undefined}>
          <Input id={id('category')} list="sel-category-options" value={entry.category} onChange={(e) => onChange('category', e.target.value)} placeholder="Plumbing fixtures" maxLength={60} autoComplete="off" disabled={disabled} aria-invalid={!!errors.category} aria-describedby={errors.category ? `${id('category')}-error` : isNewCategory ? `${id('category')}-hint` : undefined} />
        </Field>
        <Field id={id('location')} label="Room / location" error={errors.location}>
          <Input id={id('location')} list="sel-location-options" value={entry.location} onChange={(e) => onChange('location', e.target.value)} placeholder="Kitchen" maxLength={160} autoComplete="off" disabled={disabled} aria-invalid={!!errors.location} />
        </Field>
        <Field id={id('due_date')} label="Homeowner decision due" error={errors.due_date}>
          <Input id={id('due_date')} type="date" value={entry.due_date} onChange={(e) => onChange('due_date', e.target.value)} disabled={disabled} aria-invalid={!!errors.due_date} aria-describedby={errors.due_date ? `${id('due_date')}-error` : undefined} />
        </Field>
        <Field id={id('allowance')} label="Allowance" error={errors.allowance} hint={!errors.allowance && entry.allowance.trim() === '' ? 'Leave blank for no allowance' : undefined}>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground" aria-hidden="true">
              $
            </span>
            <Input id={id('allowance')} inputMode="decimal" value={entry.allowance} onChange={(e) => onChange('allowance', e.target.value)} placeholder="0.00" className="pl-7 tabular-nums" autoComplete="off" disabled={disabled} aria-invalid={!!errors.allowance} aria-describedby={errors.allowance ? `${id('allowance')}-error` : `${id('allowance')}-hint`} />
          </div>
        </Field>
      </div>

      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setMoreOpen((v) => !v)}
          aria-expanded={showMore}
          aria-controls={`${id('description')}-group`}
          className="flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className={cn('size-4 transition-transform', showMore && 'rotate-180')} aria-hidden="true" />
          More details
        </button>
        {showMore && (
          <div id={`${id('description')}-group`} className="flex flex-col gap-4">
            <Field id={id('description')} label="Description for homeowner" error={errors.description}>
              <Textarea id={id('description')} value={entry.description} onChange={(e) => onChange('description', e.target.value)} rows={2} maxLength={4000} disabled={disabled} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={id('cost_code')} label="Cost code" error={errors.cost_code}>
                <Input id={id('cost_code')} value={entry.cost_code} onChange={(e) => onChange('cost_code', e.target.value)} maxLength={40} autoComplete="off" disabled={disabled} />
              </Field>
            </div>
            <Field id={id('notes')} label="Notes shown to homeowner" error={errors.notes}>
              <Textarea id={id('notes')} value={entry.notes} onChange={(e) => onChange('notes', e.target.value)} rows={2} maxLength={4000} disabled={disabled} />
            </Field>
            <Field
              id={id('internal_notes')}
              label={
                <span className="flex items-center gap-1.5">
                  <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  Internal notes
                  <span className="font-normal text-muted-foreground">· never shown to homeowner</span>
                </span>
              }
              error={errors.internal_notes}
            >
              <Textarea id={id('internal_notes')} value={entry.internal_notes} onChange={(e) => onChange('internal_notes', e.target.value)} rows={2} maxLength={4000} disabled={disabled} className="bg-muted/40" />
            </Field>
          </div>
        )}
      </div>
    </fieldset>
  )
}

function Field({ id, label, required, error, hint, children }: { id: string; label: React.ReactNode; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden="true">
            {' *'}
          </span>
        )}
        {required && <span className="sr-only"> (required)</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
