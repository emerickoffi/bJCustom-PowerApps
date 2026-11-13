'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronDown, Plus } from 'lucide-react'
import { createSelectionCategoryAction } from '@/app/actions/selection-categories'
import { CATEGORY_NAME_MAX, filterOptions, findOption, mergeOptionLists, normalizeOptionName } from '@/lib/selection-option-lists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const FIELD =
  'flex h-10 w-full min-w-0 items-center rounded-control border border-input bg-transparent transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive has-[[aria-invalid=true]]:ring-3 has-[[aria-invalid=true]]:ring-destructive/20 has-disabled:opacity-50 dark:bg-input/30'
const INPUT = 'h-full min-w-0 flex-1 bg-transparent px-2.5 text-base outline-none placeholder:text-muted-foreground/80 disabled:cursor-not-allowed md:text-sm'
const POPUP =
  'max-h-[min(20rem,var(--available-height))] w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)] overflow-y-auto overscroll-contain rounded-control border bg-popover p-1 text-popover-foreground shadow-md outline-none transition-[scale,opacity] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0'
const ITEM =
  'flex min-h-9 cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none data-highlighted:bg-accent data-highlighted:text-accent-foreground'

const isComposing = (e: React.KeyboardEvent) => e.nativeEvent.isComposing || e.keyCode === 229

type FieldA11y = { id: string; invalid?: boolean; describedBy?: string; disabled?: boolean; placeholder?: string }

const CREATE = { create: true } as const
type CategoryItem = string | typeof CREATE

/**
 * Searchable company category picker. Choosing "Add new category" opens an inline name field;
 * the name is saved company-wide (or the existing match is reused) and selected immediately.
 */
export function CategoryPicker({
  id,
  name,
  value,
  onValueChange,
  options,
  canCreate,
  invalid,
  describedBy,
  disabled,
  placeholder = 'Choose a category',
}: FieldA11y & {
  name?: string
  value: string
  onValueChange: (value: string) => void
  options: string[]
  canCreate: boolean
}) {
  const [added, setAdded] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const draftRef = useRef<HTMLInputElement>(null)

  // Keep a legacy or deactivated value visible on records that already use it.
  const all = useMemo(() => mergeOptionLists(options, added, value ? [value] : []), [options, added, value])
  const showingSelected = value !== '' && findOption(all, query) === value
  const visible = showingSelected ? all : filterOptions(all, query)
  const items: CategoryItem[] = canCreate ? [...visible, CREATE] : visible
  const typed = normalizeOptionName(query)
  const offerTyped = typed.length >= 2 && !findOption(all, typed)

  function openCreator() {
    setDraft(offerTyped ? typed.slice(0, CATEGORY_NAME_MAX) : '')
    setError(null)
    requestAnimationFrame(() => draftRef.current?.focus())
  }

  function closeCreator() {
    setDraft(null)
    setError(null)
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  function saveDraft() {
    if (draft === null || pending) return
    startTransition(async () => {
      const result = await createSelectionCategoryAction(draft)
      if (!result.ok) {
        setError(result.error)
        draftRef.current?.focus()
        return
      }
      setAdded((list) => [...list, result.name])
      onValueChange(result.name)
      setQuery(result.name)
      closeCreator()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      {name && <input type="hidden" name={name} value={value} />}
      <Combobox.Root<CategoryItem>
        items={items}
        filteredItems={items}
        value={value || null}
        onValueChange={(next) => {
          if (next && typeof next !== 'string') return openCreator()
          onValueChange(next ?? '')
        }}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => (typeof item === 'string' ? item : '')}
        isItemEqualToValue={(a, b) => a === b}
        disabled={disabled || pending}
      >
        <Combobox.InputGroup className={FIELD}>
          <Combobox.Input id={id} placeholder={placeholder} aria-invalid={invalid || undefined} aria-describedby={describedBy} className={INPUT} />
          <Combobox.Trigger aria-label="Show categories" className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground">
            <ChevronDown className="size-4" aria-hidden="true" />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
            <Combobox.Popup className={POPUP}>
              <Combobox.Empty>
                <p className="px-2 py-3 text-sm text-muted-foreground">No matching categories.</p>
              </Combobox.Empty>
              <Combobox.List>
                {(item: CategoryItem) =>
                  typeof item === 'string' ? (
                    <Combobox.Item key={item} value={item} className={ITEM}>
                      <Combobox.ItemIndicator className="flex size-4 items-center">
                        <Check className="size-4" aria-hidden="true" />
                      </Combobox.ItemIndicator>
                      <span className={cn('truncate', value !== item && 'pl-6')}>{item}</span>
                    </Combobox.Item>
                  ) : (
                    <Combobox.Item key="__create" value={item} className={cn(ITEM, 'mt-1 border-t pt-2 font-medium text-primary')}>
                      <Plus className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{offerTyped ? `Add “${typed}” as a new category` : 'Add new category'}</span>
                    </Combobox.Item>
                  )
                }
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {draft !== null && (
        <div role="group" aria-label="Add a new category" className="flex flex-col gap-2 rounded-control border border-primary/30 bg-sage/40 p-2.5">
          <label htmlFor={`${id}-new`} className="text-xs font-medium text-foreground">
            New category name
          </label>
          <div className="flex gap-2">
            <Input
              ref={draftRef}
              id={`${id}-new`}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isComposing(e)) {
                  e.preventDefault()
                  saveDraft()
                } else if (e.key === 'Escape') {
                  e.preventDefault()
                  e.stopPropagation()
                  closeCreator()
                }
              }}
              maxLength={CATEGORY_NAME_MAX}
              autoComplete="off"
              placeholder="Smart home"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${id}-new-error` : undefined}
              disabled={pending}
              className="h-9 bg-background"
            />
            <Button type="button" size="sm" className="h-9" onClick={saveDraft} disabled={pending || normalizeOptionName(draft).length < 2} aria-busy={pending}>
              {pending ? 'Adding…' : 'Add'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-9" onClick={closeCreator} disabled={pending}>
              Cancel
            </Button>
          </div>
          {error && (
            <p id={`${id}-new-error`} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** Room / location field: suggests default and previously used rooms but accepts any custom text. */
export function LocationPicker({
  id,
  name,
  value,
  onValueChange,
  options,
  invalid,
  describedBy,
  disabled,
  placeholder = 'Kitchen',
  maxLength = 160,
}: FieldA11y & {
  name?: string
  value: string
  onValueChange: (value: string) => void
  options: string[]
  maxLength?: number
}) {
  const exact = findOption(options, value)
  const items = exact ? options : filterOptions(options, value)

  return (
    <Autocomplete.Root items={options} filteredItems={items} value={value} onValueChange={(v) => onValueChange(v)} disabled={disabled}>
      <Autocomplete.InputGroup className={FIELD}>
        <Autocomplete.Input
          id={id}
          name={name}
          placeholder={placeholder}
          maxLength={maxLength}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={INPUT}
          onBlur={(e) => {
            const tidy = normalizeOptionName(e.target.value)
            if (tidy !== e.target.value) onValueChange(tidy)
          }}
        />
        <Autocomplete.Trigger aria-label="Show rooms and locations" className="flex h-full w-9 shrink-0 items-center justify-center text-muted-foreground">
          <ChevronDown className="size-4" aria-hidden="true" />
        </Autocomplete.Trigger>
      </Autocomplete.InputGroup>
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} className="z-50 outline-none">
          <Autocomplete.Popup className={cn(POPUP, 'data-empty:hidden')}>
            <Autocomplete.List>
              {(item: string) => (
                <Autocomplete.Item key={item} value={item} className={ITEM}>
                  <span className="truncate">{item}</span>
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}
