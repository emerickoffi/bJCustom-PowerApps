'use client'

import { useId, useMemo, useRef, useState } from 'react'
import { Check, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldShell } from '@/components/shared/form-field'
import {
  MAX_PRODUCT_CATEGORIES,
  MAX_PRODUCT_CATEGORY_LENGTH,
  SUPPLIER_PRODUCT_CATEGORIES,
  parseProductCategories,
} from '@/lib/contacts'

type Option = { kind: 'existing'; name: string } | { kind: 'create'; name: string }

/** Commas separate values in the submitted field, so they cannot appear inside a name. */
function normalize(raw: string) {
  return raw.replace(/,/g, ' ').trim().replace(/\s+/g, ' ').slice(0, MAX_PRODUCT_CATEGORY_LENGTH)
}

/**
 * Searchable multi-select for supplier product categories. Submits the same comma separated
 * `product_categories` value the server action already parses, so storage and APIs are unchanged.
 */
export function ProductCategoryPicker({
  name,
  label,
  defaultValue,
  error,
  onValueChange,
}: {
  name: string
  label: string
  defaultValue: string
  error?: string
  onValueChange?: () => void
}) {
  const inputId = useId()
  const listId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [selected, setSelected] = useState<string[]>(() => parseProductCategories(defaultValue))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const selectedKeys = useMemo(() => new Set(selected.map((s) => s.toLowerCase())), [selected])
  const atLimit = selected.length >= MAX_PRODUCT_CATEGORIES

  const options = useMemo<Option[]>(() => {
    const presetKeys = new Set(SUPPLIER_PRODUCT_CATEGORIES.map((p) => p.toLowerCase()))
    const all = [...SUPPLIER_PRODUCT_CATEGORIES, ...selected.filter((s) => !presetKeys.has(s.toLowerCase()))]
    const q = normalize(query).toLowerCase()
    const matches: Option[] = all.filter((n) => n.toLowerCase().includes(q)).map((n) => ({ kind: 'existing', name: n }))
    const typed = normalize(query)
    if (typed && !all.some((n) => n.toLowerCase() === typed.toLowerCase())) matches.push({ kind: 'create', name: typed })
    return matches
  }, [query, selected])

  const activeIndex = Math.min(active, Math.max(options.length - 1, 0))

  function update(next: string[]) {
    setSelected(next)
    onValueChange?.()
  }

  function toggle(name: string) {
    const key = name.toLowerCase()
    if (selectedKeys.has(key)) {
      update(selected.filter((s) => s.toLowerCase() !== key))
      return
    }
    if (atLimit) return
    update([...selected, name])
  }

  function choose(option: Option) {
    toggle(option.name)
    if (option.kind === 'create' || query) setQuery('')
    setActive(0)
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) setOpen(true)
      else setActive((i) => (options.length ? (Math.min(i, options.length - 1) + 1) % options.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      setActive((i) => (options.length ? (Math.min(i, options.length - 1) - 1 + options.length) % options.length : 0))
    } else if (e.key === 'Enter' || e.key === ',') {
      if (e.key === 'Enter' && !open && !query) return
      e.preventDefault()
      const option = options[activeIndex]
      if (open && option) choose(option)
      else if (query) choose({ kind: 'create', name: normalize(query) })
    } else if (e.key === 'Escape') {
      if (open) {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    } else if (e.key === 'Backspace' && !query && selected.length) {
      update(selected.slice(0, -1))
    }
  }

  const hint = atLimit
    ? `Up to ${MAX_PRODUCT_CATEGORIES} categories. Remove one to add another.`
    : 'Pick from the list or type to add your own.'
  const describedBy = error ? `${inputId}-error` : `${inputId}-hint`

  return (
    <FieldShell name={name} id={inputId} label={label} error={error} hint={hint}>
      <input type="hidden" name={name} value={selected.join(', ')} />
      <div
        className="relative"
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false)
        }}
      >
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            'flex min-h-10 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input bg-background px-2 py-1.5 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
            error && 'border-destructive focus-within:ring-destructive/20',
          )}
        >
          {selected.map((s) => (
            <span key={s.toLowerCase()} className="inline-flex max-w-full items-center gap-1 rounded-md bg-sage py-0.5 pr-0.5 pl-2 text-xs font-medium text-foreground ring-1 ring-inset ring-primary/15">
              <span className="truncate">{s}</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  toggle(s)
                  inputRef.current?.focus()
                }}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:size-5"
                aria-label={`Remove ${s}`}
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            autoComplete="off"
            value={query}
            maxLength={MAX_PRODUCT_CATEGORY_LENGTH}
            placeholder={selected.length ? 'Add more…' : 'Search or select product categories...'}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            className="h-7 min-w-32 flex-1 bg-transparent px-1 text-base outline-none placeholder:text-muted-foreground/80 md:text-sm"
          />
        </div>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            className="absolute inset-x-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {options.length === 0 ? (
              <li className="px-2.5 py-2 text-sm text-muted-foreground">No matching categories</li>
            ) : (
              options.map((option, i) => {
                const isSelected = option.kind === 'existing' && selectedKeys.has(option.name.toLowerCase())
                const disabled = !isSelected && atLimit
                return (
                  <li
                    key={`${option.kind}-${option.name}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={disabled || undefined}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => !disabled && choose(option)}
                    className={cn(
                      'flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
                      i === activeIndex && 'bg-muted',
                      disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {option.kind === 'create' ? (
                      <>
                        <Plus className="size-4 shrink-0 text-primary" aria-hidden="true" />
                        <span className="min-w-0 truncate">
                          Add <span className="font-medium">&ldquo;{option.name}&rdquo;</span>
                        </span>
                      </>
                    ) : (
                      <>
                        <span
                          className={cn(
                            'flex size-4 shrink-0 items-center justify-center rounded border',
                            isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                          )}
                          aria-hidden="true"
                        >
                          {isSelected && <Check className="size-3" />}
                        </span>
                        <span className="min-w-0 truncate">{option.name}</span>
                      </>
                    )}
                  </li>
                )
              })
            )}
          </ul>
        )}
      </div>
    </FieldShell>
  )
}
