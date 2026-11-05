'use client'

import { useId, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NativeSelect } from '@/components/shared/form-field'
import { ESTIMATE_CATEGORIES, formatCentsExact, type EstimateCategory } from '@/lib/estimates'
import { blankRow, rowMath, validateRow, type RowErrors, type SheetRow } from '@/lib/estimate-sheet'
import { cn } from '@/lib/utils'

type Field = 'category' | 'description' | 'quantity' | 'unit' | 'material' | 'labor' | 'other' | 'notes'
type DraftErrors = RowErrors & { category?: string }
type Draft = Omit<SheetRow, 'category'> & { category: EstimateCategory | '' }

const FIELD_ORDER: Field[] = ['category', 'description', 'quantity', 'unit', 'material', 'labor', 'other', 'notes']

export type DrawerTarget = { row: SheetRow | null; category: EstimateCategory | null; showErrors?: boolean }
export type DrawerSaveResult = { ok: true } | { ok: false; error: string }

function toDraft(target: DrawerTarget): Draft {
  if (target.row) return { ...target.row }
  const blank = blankRow(target.category ?? ESTIMATE_CATEGORIES[0])
  return { ...blank, category: target.category ?? '' }
}

function draftErrors(draft: Draft): DraftErrors {
  const errors: DraftErrors = validateRow({ ...draft, category: draft.category || ESTIMATE_CATEGORIES[0] })
  if (!draft.category) errors.category = 'Choose a category'
  return errors
}

const sameDraft = (a: Draft, b: Draft) => JSON.stringify({ ...a, key: '' }) === JSON.stringify({ ...b, key: '' })
/** Ignores the retained category, so a reset form with only its carried-over category is not a new entry. */
const sameItem = (a: Draft, b: Draft) => sameDraft({ ...a, category: '' }, { ...b, category: '' })

/**
 * Right-side form for one line item. Edits stay local until Save, so estimate totals only change on commit.
 * The parent commits through the sheet's history (undoable) and decides whether the commit succeeded.
 */
export function EstimateLineItemDrawer({
  target,
  locked,
  onSave,
  onClose,
}: {
  target: DrawerTarget
  locked: boolean
  onSave: (row: SheetRow, addAnother: boolean) => DrawerSaveResult
  onClose: () => void
}) {
  const uid = useId()
  const isEdit = target.row !== null
  const [initial, setInitial] = useState(() => toDraft(target))
  const [draft, setDraft] = useState(initial)
  const [attempted, setAttempted] = useState(Boolean(target.showErrors))
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<{ count: number; last: string }>({ count: 0, last: '' })
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const submitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)
  const firstFieldRef = useRef<HTMLElement | null>(null)

  const errors = draftErrors(draft)
  const math = rowMath({ ...draft, category: draft.category || ESTIMATE_CATEGORIES[0] })
  const afterAdd = !isEdit && added.count > 0
  // After "Save & add another", only item-specific edits count; before that, any change (including category) does.
  const hasEntry = afterAdd ? !sameItem(draft, initial) : !sameDraft(draft, initial)
  const idle = afterAdd && !hasEntry
  const id = (f: Field) => `${uid}-${f}`
  const shown = (f: Field) => (attempted ? errors[f as keyof DraftErrors] : undefined)

  const set = (f: keyof Draft, value: string | boolean) => {
    setDraft((d) => ({ ...d, [f]: value }))
    setError(null)
  }

  function requestClose() {
    if (submitting.current) return
    if (hasEntry) setConfirmDiscard(true)
    else onClose()
  }

  function focusField(f: Field) {
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(id(f))}`)?.focus())
  }

  function submit(addAnother: boolean) {
    if (submitting.current || locked || idle) return
    submitting.current = true
    try {
      const first = FIELD_ORDER.find((f) => errors[f as keyof DraftErrors])
      if (first) {
        setAttempted(true)
        focusField(first)
        return
      }
      const row: SheetRow = { ...draft, category: draft.category as EstimateCategory }
      const result = onSave(row, addAnother)
      if (!result.ok) {
        setError(result.error)
        return
      }
      if (addAnother) {
        const next = { ...blankRow(row.category), category: row.category } satisfies Draft
        setInitial(next)
        setDraft(next)
        setAttempted(false)
        setAdded((a) => ({ count: a.count + 1, last: row.description.trim() }))
        focusField('description')
      }
    } finally {
      requestAnimationFrame(() => {
        submitting.current = false
      })
    }
  }

  const fieldClass = 'flex flex-col gap-1.5'
  const labelClass = 'text-sm font-medium text-foreground'
  const errorText = (f: Field) =>
    shown(f) ? (
      <p id={`${id(f)}-error`} className="text-xs text-destructive">
        {shown(f)}
      </p>
    ) : null
  const aria = (f: Field) => ({
    id: id(f),
    'aria-invalid': shown(f) ? true : undefined,
    'aria-describedby': shown(f) ? `${id(f)}-error` : undefined,
  })

  const moneyField = (f: 'material' | 'labor' | 'other', label: string) => (
    <div className={fieldClass}>
      <label htmlFor={id(f)} className={labelClass}>
        {label}
      </label>
      <div className="relative">
        <span aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
          $
        </span>
        <Input
          {...aria(f)}
          value={draft[f]}
          onChange={(e) => set(f, e.target.value)}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          className="h-10 pl-6 text-right tabular-nums"
        />
      </div>
      {errorText(f)}
    </div>
  )

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) requestClose()
      }}
    >
      <SheetContent
        side="right"
        initialFocus={() => firstFieldRef.current ?? true}
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:w-[min(36rem,100vw)] data-[side=right]:sm:max-w-[36rem]"
        onKeyDown={(e) => {
          // Portaled events still bubble through React to the sheet; keep its undo/redo shortcuts out of the form.
          if (e.metaKey || e.ctrlKey) e.stopPropagation()
        }}
      >
        <SheetHeader className="shrink-0 gap-1 border-b p-4 pr-12 sm:px-6">
          <SheetTitle className="font-serif text-lg font-semibold">{isEdit ? 'Edit line item' : 'Add line item'}</SheetTitle>
          <SheetDescription>Saving adds this item to the draft. Use Save draft to save it to the estimate.</SheetDescription>
        </SheetHeader>

        <form
          ref={formRef}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.nativeEvent.isComposing || e.keyCode === 229)) e.preventDefault()
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 sm:px-6">
            <div className={fieldClass}>
              <label htmlFor={id('category')} className={labelClass}>
                Category <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <NativeSelect
                {...aria('category')}
                ref={(el) => {
                  if (!target.row && !target.category) firstFieldRef.current = el
                }}
                required
                value={draft.category}
                onChange={(e) => set('category', e.target.value)}
              >
                <option value="">Choose a category</option>
                {ESTIMATE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
              {errorText('category')}
            </div>

            <div className={fieldClass}>
              <label htmlFor={id('description')} className={labelClass}>
                Description <span className="text-destructive" aria-hidden="true">*</span>
              </label>
              <Input
                {...aria('description')}
                ref={(el) => {
                  if (target.row || target.category) firstFieldRef.current = el
                }}
                required
                value={draft.description}
                onChange={(e) => set('description', e.target.value)}
                autoComplete="off"
                placeholder="e.g. Frame interior walls"
                className="h-10"
              />
              {errorText('description')}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className={fieldClass}>
                <label htmlFor={id('quantity')} className={labelClass}>
                  Quantity
                </label>
                <Input
                  {...aria('quantity')}
                  value={draft.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  className="h-10 text-right tabular-nums"
                />
                {errorText('quantity')}
              </div>
              <div className={fieldClass}>
                <label htmlFor={id('unit')} className={labelClass}>
                  Unit
                </label>
                <Input
                  {...aria('unit')}
                  value={draft.unit}
                  onChange={(e) => set('unit', e.target.value)}
                  autoComplete="off"
                  placeholder="ea, sf, lf, hr"
                  className="h-10"
                />
                {errorText('unit')}
              </div>
            </div>

            <fieldset className="flex flex-col gap-3 rounded-xl border p-4">
              <legend className="px-1 text-sm font-medium text-foreground">Cost per unit</legend>
              <div className="grid gap-4 sm:grid-cols-3">
                {moneyField('material', 'Material')}
                {moneyField('labor', 'Labor')}
                {moneyField('other', 'Other')}
              </div>
            </fieldset>

            <label className="flex items-start gap-3 rounded-xl border p-4">
              <input
                type="checkbox"
                checked={draft.is_allowance}
                onChange={(e) => set('is_allowance', e.target.checked)}
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">Allowance</span>
                <span className="text-xs text-muted-foreground">Tracked separately from direct cost and excluded from markup.</span>
              </span>
            </label>

            <div className={fieldClass}>
              <label htmlFor={id('notes')} className={labelClass}>
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Textarea {...aria('notes')} value={draft.notes} onChange={(e) => set('notes', e.target.value)} rows={3} />
              {errorText('notes')}
            </div>
          </div>

          <div className="shrink-0 border-t bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
            <dl className="mb-3 grid grid-cols-2 gap-3 rounded-lg bg-muted/50 px-3 py-2 text-sm">
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">Unit cost</dt>
                <dd className="font-medium tabular-nums">{formatCentsExact(math.unitCostCents)}</dd>
              </div>
              <div className="flex flex-col text-right">
                <dt className="text-xs text-muted-foreground">Line total</dt>
                <dd className="font-semibold tabular-nums">{math.valid ? formatCentsExact(math.totalCents) : '—'}</dd>
              </div>
            </dl>
            <p
              role={error ? 'alert' : 'status'}
              aria-live="polite"
              className={cn('mb-3 min-h-4 text-xs', error ? 'text-destructive' : 'text-muted-foreground')}
            >
              {error ??
                (locked
                  ? 'Saving the draft. Item actions are paused.'
                  : idle
                    ? `Added "${added.last}" to the draft${added.count > 1 ? ` (${added.count} items this session)` : ''}. Enter another item, or choose Done.`
                    : attempted && Object.keys(errors).length
                      ? 'Fix the highlighted fields to continue.'
                      : '')}
            </p>
            {idle ? (
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button type="button" onClick={onClose} className="h-10 sm:min-w-28">
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={requestClose} className="h-10">
                  Cancel
                </Button>
                {!isEdit && (
                  <Button type="button" variant="outline" onClick={() => submit(true)} disabled={locked} className="h-10">
                    Save &amp; add another
                  </Button>
                )}
                <Button type="submit" disabled={locked} className="h-10">
                  {isEdit ? 'Save changes' : 'Save & close'}
                </Button>
              </div>
            )}
          </div>
        </form>

        <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <DialogContent showCloseButton={false}>
            <DialogHeader>
              <DialogTitle>{isEdit ? 'Discard changes?' : 'Discard current item?'}</DialogTitle>
              <DialogDescription>
                {isEdit
                  ? 'Your edits to this line item will be lost.'
                  : afterAdd
                    ? `The item you're entering has not been added. The ${added.count === 1 ? 'item' : `${added.count} items`} you already added stay in the draft.`
                    : 'This line item has not been added to the draft.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  setConfirmDiscard(false)
                  onClose()
                }}
              >
                {isEdit ? 'Discard changes' : 'Discard current item'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
}
