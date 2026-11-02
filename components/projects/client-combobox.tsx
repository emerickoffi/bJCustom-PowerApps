'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { Check, ChevronsUpDown, Clock, Plus, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClientOption } from '@/lib/client-options'
import {
  comboboxInputClass,
  comboboxItemClass,
  comboboxListClass,
  comboboxPopupClass,
} from '@/components/contacts/company-combobox'

type Item =
  | { kind: 'later'; id: '' }
  | { kind: 'new'; id: '__new' }
  | { kind: 'client'; id: string; client: ClientOption }

const LATER: Item = { kind: 'later', id: '' }
const CREATE: Item = { kind: 'new', id: '__new' }

function itemLabel(item: Item | null) {
  if (!item) return ''
  if (item.kind === 'client') return item.client.label
  return item.kind === 'later' ? 'Assign later' : 'Create new client'
}

/**
 * Searchable primary-homeowner picker. `value` is a client id or '' for "Assign later".
 * When `name` is set, a hidden input carries the value so it submits with the surrounding form,
 * and an `input` event is dispatched on change so form dirty tracking notices it.
 */
export function ClientCombobox({
  id,
  name,
  clients,
  value,
  onValueChange,
  onCreateNew,
  invalid,
  describedBy,
  autoFocus,
}: {
  id: string
  name?: string
  clients: ClientOption[]
  value: string
  onValueChange: (value: string) => void
  /** Omit to hide “Create new client” (users without permission). */
  onCreateNew?: () => void
  invalid?: boolean
  describedBy?: string
  autoFocus?: boolean
}) {
  const [query, setQuery] = useState('')
  const hiddenRef = useRef<HTMLInputElement>(null)
  const lastValue = useRef(value)

  const items = useMemo<Item[]>(
    () => [LATER, ...clients.map((client): Item => ({ kind: 'client', id: client.value, client })), ...(onCreateNew ? [CREATE] : [])],
    [clients, onCreateNew],
  )
  const selected = items.find((i) => i.id === value && i.kind !== 'new') ?? LATER
  const selectedLabel = itemLabel(selected)
  const search = query.trim().toLowerCase()
  const showingSelection = query === selectedLabel
  const matches = (c: ClientOption) => `${c.label} ${c.detail ?? ''}`.toLowerCase().includes(search)
  const noMatch = Boolean(search) && !showingSelection && !clients.some(matches)

  useEffect(() => {
    if (lastValue.current === value) return
    lastValue.current = value
    hiddenRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
  }, [value])

  return (
    <>
      {name && <input ref={hiddenRef} type="hidden" name={name} value={value} />}
      <Combobox.Root<Item>
        items={items}
        value={selected}
        onValueChange={(next) => {
          const item = next as Item | null
          if (item?.kind === 'new') {
            onCreateNew?.()
            return
          }
          onValueChange(item?.kind === 'client' ? item.id : '')
        }}
        onInputValueChange={setQuery}
        itemToStringLabel={(item) => itemLabel(item as Item)}
        itemToStringValue={(item) => (item as Item).id}
        isItemEqualToValue={(a, b) => (a as Item).id === (b as Item).id}
        filter={(item, q) => {
          const i = item as Item
          const s = q.trim().toLowerCase()
          if (i.kind !== 'client' || !s || q === selectedLabel) return true
          return `${i.client.label} ${i.client.detail ?? ''}`.toLowerCase().includes(s)
        }}
        autoHighlight
      >
        <Combobox.InputGroup className="relative">
          <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Combobox.Input
            id={id}
            placeholder="Search clients by name, email, phone, or city…"
            className={comboboxInputClass}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy}
            autoFocus={autoFocus}
            onKeyDown={(e) => {
              // Enter picks the highlighted option; it must never submit the project form.
              if (e.key === 'Enter') e.preventDefault()
            }}
          />
          <div className="absolute inset-y-0 right-1 flex items-center">
            {selected.kind === 'client' && (
              <button
                type="button"
                aria-label="Clear homeowner (assign later)"
                onClick={() => onValueChange('')}
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
            <Combobox.Trigger
              aria-label="Show clients"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronsUpDown className="size-4" />
            </Combobox.Trigger>
          </div>
        </Combobox.InputGroup>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} className="z-50 outline-none">
            <Combobox.Popup className={comboboxPopupClass}>
              {noMatch && (
                <p className="border-b border-border/60 px-3 py-2.5 text-sm text-muted-foreground" role="status">
                  No clients match &ldquo;{query.trim()}&rdquo;.
                </p>
              )}
              <Combobox.List className={comboboxListClass}>
                {(item: Item) =>
                  item.kind === 'new' ? (
                    <Combobox.Item
                      key={item.id}
                      value={item}
                      className={cn(comboboxItemClass, 'mt-1 border-t border-border/60 font-medium text-primary')}
                    >
                      <Plus className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">Create new client</span>
                    </Combobox.Item>
                  ) : (
                    <Combobox.Item key={item.id || 'later'} value={item} className={comboboxItemClass}>
                      {item.kind === 'later' ? (
                        <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      ) : (
                        <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn('truncate', item.kind === 'later' && 'text-muted-foreground')}>{itemLabel(item)}</span>
                        {item.kind === 'client' && item.client.detail && (
                          <span className="truncate text-xs text-muted-foreground">{item.client.detail}</span>
                        )}
                        {item.kind === 'later' && (
                          <span className="truncate text-xs text-muted-foreground">Save without a homeowner</span>
                        )}
                      </span>
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
    </>
  )
}
