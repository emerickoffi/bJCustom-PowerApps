'use client'

import { useActionState, useEffect, useRef, useState, useTransition } from 'react'
import { Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { initialActionState, type ActionState } from '@/lib/action-state'
import { addLineItemAction, deleteLineItemAction, updateLineItemAction } from '@/app/actions/estimates'
import {
  ESTIMATE_CATEGORIES,
  ESTIMATE_UNITS,
  centsToInput,
  formatCentsExact,
  formatQuantity,
  type EstimateLineItem,
} from '@/lib/estimates'
import { cn } from '@/lib/utils'

const inputClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive'

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </label>
  )
}

function LineItemForm({
  action,
  item,
  submitLabel,
  onDone,
  defaultCategory = 'Site Preparation',
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  item?: EstimateLineItem
  submitLabel: string
  onDone?: () => void
  defaultCategory?: string
}) {
  const [state, formAction] = useActionState(action, initialActionState)
  const formRef = useRef<HTMLFormElement>(null)
  const categoryRef = useRef<HTMLSelectElement>(null)
  const lastCategory = useRef<string>(item?.category ?? defaultCategory)
  const fe = state.fieldErrors ?? {}
  const v = state.values ?? {}

  useEffect(() => {
    if (!state.success) return
    if (onDone) {
      onDone()
      return
    }
    // Keep the category the user just used so consecutive items in the same group are quick to add.
    formRef.current?.reset()
    if (categoryRef.current) categoryRef.current.value = lastCategory.current
  }, [state, onDone])

  const val = (key: string, fallback: string) => v[key] ?? fallback

  return (
    <form
      ref={formRef}
      action={formAction}
      onSubmit={() => {
        if (categoryRef.current) lastCategory.current = categoryRef.current.value
      }}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-12"
      noValidate
    >
      <Field label="Category" error={fe.category} className="lg:col-span-3">
        <NativeSelect
          ref={categoryRef}
          name="category"
          defaultValue={val('category', item?.category ?? defaultCategory)}
          className="h-9"
        >
          {ESTIMATE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Description" error={fe.description} className="sm:col-span-2 lg:col-span-5">
        <input
          name="description"
          required
          maxLength={300}
          defaultValue={val('description', item?.description ?? '')}
          aria-invalid={fe.description ? true : undefined}
          className={inputClass}
        />
      </Field>
      <Field label="Qty" error={fe.quantity} className="lg:col-span-2">
        <input
          name="quantity"
          inputMode="decimal"
          defaultValue={val('quantity', item ? String(Number(item.quantity)) : '1')}
          aria-invalid={fe.quantity ? true : undefined}
          className={inputClass}
        />
      </Field>
      <Field label="Unit" error={fe.unit} className="lg:col-span-2">
        <input
          name="unit"
          list="estimate-units"
          maxLength={20}
          defaultValue={val('unit', item?.unit ?? 'ea')}
          aria-invalid={fe.unit ? true : undefined}
          className={inputClass}
        />
      </Field>
      <Field label="Material / unit ($)" error={fe.material_unit} className="lg:col-span-3">
        <input
          name="material_unit"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={val('material_unit', centsToInput(item?.material_unit_cents ?? null))}
          aria-invalid={fe.material_unit ? true : undefined}
          className={inputClass}
        />
      </Field>
      <Field label="Labor / unit ($)" error={fe.labor_unit} className="lg:col-span-3">
        <input
          name="labor_unit"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={val('labor_unit', centsToInput(item?.labor_unit_cents ?? null))}
          aria-invalid={fe.labor_unit ? true : undefined}
          className={inputClass}
        />
      </Field>
      <Field label="Other direct / unit ($)" error={fe.other_unit} className="lg:col-span-3">
        <input
          name="other_unit"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={val('other_unit', centsToInput(item?.other_unit_cents ?? null))}
          aria-invalid={fe.other_unit ? true : undefined}
          className={inputClass}
        />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-foreground lg:col-span-3">
        <input
          type="checkbox"
          name="is_allowance"
          defaultChecked={(v.is_allowance ?? (item?.is_allowance ? 'on' : '')) === 'on'}
          className="size-4 accent-primary"
        />
        Allowance
      </label>
      <Field label="Notes" error={fe.notes} className="sm:col-span-2 lg:col-span-9">
        <input name="notes" maxLength={1000} defaultValue={val('notes', item?.notes ?? '')} className={inputClass} />
      </Field>
      <div className="flex items-end justify-end gap-2 sm:col-span-2 lg:col-span-3">
        {onDone && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            <X data-icon="inline-start" />
            Cancel
          </Button>
        )}
        <SubmitButton size="sm" pendingLabel={submitLabel === 'Add item' ? 'Adding item…' : 'Saving item…'}>
          {submitLabel}
        </SubmitButton>
      </div>
      <div className="sm:col-span-2 lg:col-span-12">
        <FormMessage state={state.success ? initialActionState : state} />
      </div>
    </form>
  )
}

function DeleteButton({ estimateId, itemId }: { estimateId: string; itemId: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string>()
  return (
    <div className="flex flex-col items-end">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label="Remove line item"
        onClick={() => {
          if (!window.confirm('Remove this line item?')) return
          start(async () => setError((await deleteLineItemAction(estimateId, itemId)).error))
        }}
      >
        <Trash2 />
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  )
}

function ItemRow({ item, estimateId, editable }: { item: EstimateLineItem; estimateId: string; editable: boolean }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <li className="border-b bg-sage/30 p-4 last:border-b-0">
        <LineItemForm
          action={updateLineItemAction.bind(null, estimateId, item.id)}
          item={item}
          submitLabel="Save item"
          onDone={() => setEditing(false)}
        />
      </li>
    )
  }
  const unitCost = item.material_unit_cents + item.labor_unit_cents + item.other_unit_cents
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1 border-b px-4 py-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_6rem_7rem_7rem_7rem_auto] md:items-center">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
          {item.description}
          {item.is_allowance && (
            <span className="rounded-full bg-champagne-soft px-2 py-0.5 text-[0.65rem] font-medium text-champagne-foreground">
              Allowance
            </span>
          )}
        </span>
        {item.notes && <span className="text-xs text-muted-foreground">{item.notes}</span>}
      </div>
      <span className="text-right text-sm font-semibold tabular-nums text-foreground md:order-last md:hidden">
        {formatCentsExact(item.line_total_cents)}
      </span>
      <span className="col-span-2 text-xs text-muted-foreground md:col-span-1 md:text-right md:text-sm md:text-foreground">
        <span className="md:hidden">{`${formatQuantity(item.quantity)} ${item.unit} × ${formatCentsExact(unitCost)}`}</span>
        <span className="hidden tabular-nums md:inline">{`${formatQuantity(item.quantity)} ${item.unit}`}</span>
      </span>
      <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
        {formatCentsExact(item.material_unit_cents)}
      </span>
      <span className="hidden text-right text-sm tabular-nums text-muted-foreground md:block">
        {formatCentsExact(item.labor_unit_cents)}
      </span>
      <span className="hidden text-right text-sm font-semibold tabular-nums text-foreground md:block">
        {formatCentsExact(item.line_total_cents)}
      </span>
      <div className="col-span-2 flex justify-end gap-1 md:col-span-1">
        {editable ? (
          <>
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit line item" onClick={() => setEditing(true)}>
              <Pencil />
            </Button>
            <DeleteButton estimateId={estimateId} itemId={item.id} />
          </>
        ) : (
          <span className="hidden w-16 md:block" aria-hidden="true" />
        )}
      </div>
    </li>
  )
}

export function LineItemsEditor({
  estimateId,
  items,
  editable,
}: {
  estimateId: string
  items: EstimateLineItem[]
  editable: boolean
}) {
  const [adding, setAdding] = useState(items.length === 0 && editable)
  const lastUsedCategory = items.reduce<EstimateLineItem | undefined>(
    (latest, i) => (!latest || i.sort_order >= latest.sort_order ? i : latest),
    undefined,
  )?.category
  const groups = ESTIMATE_CATEGORIES.map((category) => ({
    category,
    items: items.filter((i) => i.category === category),
  })).filter((g) => g.items.length > 0)

  return (
    <section aria-labelledby="line-items-heading" className="surface flex flex-col gap-0 overflow-hidden p-0">
      <datalist id="estimate-units">
        {ESTIMATE_UNITS.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex flex-col gap-0.5">
          <h2 id="line-items-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
            Line items
          </h2>
          <p className="text-sm text-muted-foreground">
            {editable
              ? 'Line totals are calculated on the server from quantity and unit costs.'
              : 'This estimate is locked. Create a revision to change line items.'}
          </p>
        </div>
        {editable && !adding && (
          <Button type="button" onClick={() => setAdding(true)}>
            <Plus data-icon="inline-start" />
            Add line item
          </Button>
        )}
      </div>

      {adding && editable && (
        <div className="border-b bg-sage/30 p-4">
          <LineItemForm
            action={addLineItemAction.bind(null, estimateId)}
            submitLabel="Add item"
            defaultCategory={lastUsedCategory}
          />
          <div className="flex justify-end pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
              Close
            </Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">
          No line items yet. Add your first cost item to build the estimate.
        </p>
      ) : (
        <div className="flex flex-col">
          <div className="hidden grid-cols-[minmax(0,1fr)_6rem_7rem_7rem_7rem_auto] gap-x-4 bg-muted/40 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
            <span>Item</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Material/unit</span>
            <span className="text-right">Labor/unit</span>
            <span className="text-right">Line total</span>
            <span className="w-16" aria-hidden="true" />
          </div>
          {groups.map((group) => {
            const subtotal = group.items.reduce((sum, i) => sum + i.line_total_cents, 0)
            return (
              <div key={group.category} className="flex flex-col">
                <div className="flex items-center justify-between border-y bg-card px-4 py-2">
                  <h3 className="text-sm font-semibold text-primary">{group.category}</h3>
                  <span className="text-sm font-medium tabular-nums text-foreground">{formatCentsExact(subtotal)}</span>
                </div>
                <ul>
                  {group.items.map((item) => (
                    <ItemRow key={item.id} item={item} estimateId={estimateId} editable={editable} />
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
