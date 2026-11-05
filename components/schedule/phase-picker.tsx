'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronsUpDown, Layers, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { createPhaseAction } from '@/app/actions/schedule'
import type { SchedulePhase } from '@/lib/schedule'
import {
  comboboxInputClass,
  comboboxItemClass,
  comboboxListClass,
  comboboxPopupClass,
} from '@/components/contacts/company-combobox'

type Item = { kind: 'phase'; id: string; name: string } | { kind: 'new'; id: '__new' }
const CREATE: Item = { kind: 'new', id: '__new' }

/**
 * Searchable project phase selector. Submits `phase_id` through a hidden input.
 * Managers can create a phase inline without leaving (or resetting) the surrounding form.
 */
export function PhasePicker({
  id,
  projectId,
  phases,
  defaultValue,
  error,
  disabled,
}: {
  id: string
  projectId: string
  phases: SchedulePhase[]
  defaultValue: string
  error?: string
  disabled?: boolean
}) {
  const [value, setValue] = useState(defaultValue)
  const [created, setCreated] = useState<SchedulePhase[]>([])
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const draftRef = useRef<HTMLInputElement>(null)
  const errorId = `${id}-error`

  const allPhases = useMemo(() => {
    const seen = new Set(phases.map((p) => p.id))
    return [...phases, ...created.filter((p) => !seen.has(p.id))]
  }, [phases, created])

  const items = useMemo<Item[]>(
    () => [...allPhases.map((p): Item => ({ kind: 'phase', id: p.id, name: p.name })), CREATE],
    [allPhases],
  )
  const selected = items.find((i) => i.kind === 'phase' && i.id === value) ?? null
  const selectedLabel = selected?.kind === 'phase' ? selected.name : ''

  function startCreate() {
    setDraft(query.trim() !== selectedLabel ? query.trim() : '')
    setCreateError(null)
    setCreating(true)
    requestAnimationFrame(() => draftRef.current?.focus())
  }

  function submitCreate() {
    const name = draft.trim()
    if (!name) {
      setCreateError('Enter a phase name')
      return
    }
    startTransition(async () => {
      const result = await createPhaseAction(projectId, name)
      if (result.phase) {
        const phase = result.phase
        setCreated((prev) => (prev.some((p) => p.id === phase.id) ? prev : [...prev, { ...phase, sort_order: Number.MAX_SAFE_INTEGER }]))
        setValue(phase.id)
        setCreating(false)
        // An existing phase with the same name is selected instead of creating a duplicate.
        setCreateError(null)
        return
      }
      setCreateError(result.error ?? 'Could not create the phase.')
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="phase_id" value={value} />
      <Combobox.Root<Item>
        items={items}
        value={selected}
        disabled={disabled}
        onValueChange={(next) => {
          const item = next as Item | null
          if (item?.kind === 'new') {
            startCreate()
            return
          }
          if (item) setValue(item.id)
        }}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => ((item as Item).kind === 'phase' ? (item as { name: string }).name : 'Create new phase')}
        itemToStringValue={(item) => (item as Item).id}
        isItemEqualToValue={(a, b) => (a as Item).id === (b as Item).id}
        filter={(item, q) => {
          const i = item as Item
          const s = q.trim().toLowerCase()
          if (i.kind === 'new' || !s || q === selectedLabel) return true
          return i.name.toLowerCase().includes(s)
        }}
        autoHighlight
      >
        <Combobox.InputGroup className="relative">
          <Layers className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Combobox.Input
            id={id}
            placeholder={allPhases.length ? 'Search phases…' : 'No phases yet — create one'}
            className={cn(comboboxInputClass, 'pr-10')}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            onKeyDown={(e) => {
              // Enter picks the highlighted option; it must never submit the activity form.
              if (e.key === 'Enter') e.preventDefault()
            }}
          />
          <div className="absolute inset-y-0 right-1 flex items-center">
            <Combobox.Trigger
              aria-label="Show phases"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronsUpDown className="size-4" />
            </Combobox.Trigger>
          </div>
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
            <Combobox.Popup className={comboboxPopupClass}>
              <Combobox.List className={comboboxListClass}>
                {(item: Item) =>
                  item.kind === 'new' ? (
                    <Combobox.Item
                      key={item.id}
                      value={item}
                      className={cn(comboboxItemClass, allPhases.length > 0 && 'mt-1 border-t border-border/60', 'font-medium text-primary')}
                    >
                      <Plus className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">
                        {query.trim() && query !== selectedLabel ? `Create phase “${query.trim()}”` : 'Create new phase'}
                      </span>
                    </Combobox.Item>
                  ) : (
                    <Combobox.Item key={item.id} value={item} className={comboboxItemClass}>
                      <span className="min-w-0 flex-1 truncate">{item.name}</span>
                      <Combobox.ItemIndicator>
                        <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                      </Combobox.ItemIndicator>
                    </Combobox.Item>
                  )
                }
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {creating && (
        <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-muted/40 p-2.5">
          <label htmlFor={`${id}-new`} className="text-xs font-medium text-muted-foreground">
            New phase name
          </label>
          <div className="flex gap-2">
            <Input
              ref={draftRef}
              id={`${id}-new`}
              value={draft}
              maxLength={80}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // Create the phase; never submit the surrounding activity form.
                  e.preventDefault()
                  if (e.nativeEvent.isComposing || e.keyCode === 229) return
                  submitCreate()
                }
                if (e.key === 'Escape') {
                  e.stopPropagation()
                  setCreating(false)
                }
              }}
              aria-invalid={createError ? true : undefined}
              aria-describedby={createError ? `${id}-new-error` : undefined}
              placeholder="e.g. Exterior finishes"
              className="h-9"
            />
            <Button type="button" size="sm" className="h-9" onClick={submitCreate} disabled={pending}>
              {pending ? 'Creating…' : 'Create'}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-9" onClick={() => setCreating(false)} disabled={pending}>
              Cancel
            </Button>
          </div>
          {createError && (
            <p id={`${id}-new-error`} role="alert" className="text-xs text-destructive">
              {createError}
            </p>
          )}
        </div>
      )}

      {error && (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
