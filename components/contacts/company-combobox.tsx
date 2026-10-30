'use client'

import { useMemo, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { Building2, Check, ChevronsUpDown, Plus, UserRound, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CompanyOption } from '@/lib/contacts-data'

type Item =
  | { kind: 'independent'; id: '' }
  | { kind: 'new'; id: '__new' }
  | { kind: 'company'; id: string; company: CompanyOption }

const INDEPENDENT: Item = { kind: 'independent', id: '' }
const ADD_NEW: Item = { kind: 'new', id: '__new' }

function itemLabel(item: Item | null) {
  if (!item) return ''
  if (item.kind === 'company') return item.company.company_name
  return item.kind === 'independent' ? 'Independent (no company)' : 'Add New Company'
}

export const comboboxInputClass =
  'h-10 w-full min-w-0 rounded-lg border border-input bg-background pr-16 pl-9 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm'
export const comboboxPopupClass =
  'w-[var(--anchor-width)] max-w-[var(--available-width)] origin-[var(--transform-origin)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg transition-[scale,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0'
export const comboboxListClass = 'max-h-[min(18rem,var(--available-height))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none'
export const comboboxItemClass =
  'flex min-h-10 cursor-default items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground'

/**
 * Searchable company picker. `value` is a company id, '' for "Independent", or null when nothing is chosen yet.
 * Choosing "Add New Company" calls `onAddNew` with the typed text and leaves the selection unchanged.
 */
export function CompanyCombobox({
  id,
  companies,
  value,
  onValueChange,
  onAddNew,
  allowIndependent = true,
  placeholder = 'Search companies…',
  invalid,
  describedBy,
}: {
  id: string
  companies: CompanyOption[]
  value: string | null
  onValueChange: (value: string | null) => void
  onAddNew: (query: string) => void
  allowIndependent?: boolean
  placeholder?: string
  invalid?: boolean
  describedBy?: string
}) {
  const [query, setQuery] = useState('')
  const items = useMemo<Item[]>(
    () => [
      ...(allowIndependent ? [INDEPENDENT] : []),
      ...companies.map((company): Item => ({ kind: 'company', id: company.id, company })),
      ADD_NEW,
    ],
    [companies, allowIndependent],
  )
  const selected: Item | null = value === null ? null : (items.find((i) => i.id === value && i.kind !== 'new') ?? null)
  const selectedLabel = itemLabel(selected)
  const search = query.trim().toLowerCase()
  const showingSelection = Boolean(selected) && query === selectedLabel
  const noMatch = Boolean(search) && !showingSelection && !companies.some((c) => c.company_name.toLowerCase().includes(search))

  return (
    <Combobox.Root<Item | null>
      items={items}
      value={selected}
      onValueChange={(next) => {
        const item = next as Item | null
        if (item?.kind === 'new') {
          onAddNew(showingSelection ? '' : query.trim())
          return
        }
        onValueChange(item ? item.id : null)
      }}
      onInputValueChange={setQuery}
      itemToStringLabel={(item) => itemLabel(item as Item)}
      itemToStringValue={(item) => (item as Item).id}
      isItemEqualToValue={(a, b) => (a as Item).id === (b as Item).id}
      filter={(item, q) => {
        const i = item as Item
        const s = q.trim().toLowerCase()
        if (i.kind === 'new' || !s || (selected && q === selectedLabel)) return true
        return itemLabel(i).toLowerCase().includes(s)
      }}
      autoHighlight
    >
      <Combobox.InputGroup className="relative">
        <Building2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          className={comboboxInputClass}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          {selected && (
            <Combobox.Clear
              aria-label="Clear company"
              className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </Combobox.Clear>
          )}
          <Combobox.Trigger
            aria-label="Show companies"
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
                No companies match &ldquo;{query.trim()}&rdquo;.
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
                    <span className="truncate">{noMatch ? `Add “${query.trim()}” as a new company` : 'Add New Company'}</span>
                  </Combobox.Item>
                ) : (
                  <Combobox.Item key={item.id || 'independent'} value={item} className={comboboxItemClass}>
                    {item.kind === 'independent' ? (
                      <UserRound className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    ) : (
                      <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                    <span className={cn('min-w-0 flex-1 truncate', item.kind === 'independent' && 'text-muted-foreground')}>
                      {itemLabel(item)}
                    </span>
                    {item.kind === 'company' && item.company.category && (
                      <span className="shrink-0 text-xs text-muted-foreground">{item.company.category}</span>
                    )}
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
  )
}
