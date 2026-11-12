'use client'

import { useEffect, useRef, useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { AlertCircle, AlertTriangle, Check, ChevronDown, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { INVALID_STATE_MESSAGE, US_STATE_OPTIONS, matchesUsState, normalizeUsState, type UsStateOption } from '@/lib/us-states'
import { cn } from '@/lib/utils'

/** Dispatch on the hidden input (found by `name`) to set the value programmatically, e.g. when copying an address. */
export const STATE_SELECT_SET_EVENT = 'stateselect:set'

export function setStateSelectValue(input: Element | null, value: string) {
  input?.dispatchEvent(new CustomEvent<string>(STATE_SELECT_SET_EVENT, { detail: value }))
}

function resolve(raw: string | null | undefined) {
  const text = (raw ?? '').trim()
  const code = normalizeUsState(text)
  return {
    selected: code ? (US_STATE_OPTIONS.find((o) => o.value === code) ?? null) : null,
    unrecognized: !code && text ? text : null,
  }
}

type StateSelectProps = {
  name: string
  id?: string
  label?: string
  required?: boolean
  defaultValue?: string | null
  error?: string
  hint?: string
  className?: string
}

/**
 * Searchable U.S. state picker. Submits the two-letter code through a hidden input so existing save logic is unchanged.
 * An unrecognized saved value is kept and submitted as-is (the server rejects it) until a valid state is chosen.
 */
export function StateSelect({ name, id, label = 'State', required, defaultValue, error, hint, className }: StateSelectProps) {
  const fieldId = id ?? name
  const initial = resolve(defaultValue)
  const [selected, setSelected] = useState<UsStateOption | null>(initial.selected)
  const [unrecognized, setUnrecognized] = useState<string | null>(initial.unrecognized)
  const hiddenRef = useRef<HTMLInputElement>(null)
  const changed = useRef(false)

  const submitted = selected?.value ?? unrecognized ?? ''

  useEffect(() => {
    const input = hiddenRef.current
    if (!input) return
    const onSet = (event: Event) => {
      const next = resolve((event as CustomEvent<string>).detail)
      changed.current = true
      setSelected(next.selected)
      setUnrecognized(next.unrecognized)
    }
    input.addEventListener(STATE_SELECT_SET_EVENT, onSet)
    return () => input.removeEventListener(STATE_SELECT_SET_EVENT, onSet)
  }, [])

  // Hidden inputs never fire input events, so announce changes for the form's unsaved-changes tracking.
  useEffect(() => {
    if (!changed.current) return
    changed.current = false
    hiddenRef.current?.dispatchEvent(new Event('input', { bubbles: true }))
    hiddenRef.current?.dispatchEvent(new Event('change', { bubbles: true }))
  }, [submitted])

  const message = error ?? (unrecognized ? `Saved value "${unrecognized}" is not a recognized U.S. state. ${INVALID_STATE_MESSAGE} before saving.` : null)
  const helpId = message ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined

  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={fieldId} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <>
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </Label>

      <input ref={hiddenRef} type="hidden" name={name} value={submitted} data-state-select="" />

      <Combobox.Root<UsStateOption>
        items={US_STATE_OPTIONS}
        value={selected}
        onValueChange={(next) => {
          changed.current = true
          setSelected(next)
          setUnrecognized(null)
        }}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        isItemEqualToValue={(a, b) => a.value === b.value}
        filter={(item, query) => matchesUsState(item, query)}
        autoHighlight
      >
        <div className="relative">
          <Combobox.Input
            id={fieldId}
            placeholder={unrecognized ? unrecognized : 'Select state'}
            aria-invalid={message ? true : undefined}
            aria-describedby={helpId}
            aria-required={required ? true : undefined}
            autoComplete="off"
            className={cn(
              'h-10 w-full min-w-0 truncate rounded-lg border border-input bg-background pl-2.5 pr-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/80',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
              unrecognized && 'placeholder:text-foreground',
            )}
          />
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            {!required && (selected || unrecognized) && (
              <Combobox.Clear
                aria-label={`Clear ${label.toLowerCase()}`}
                onClick={() => {
                  changed.current = true
                  setUnrecognized(null)
                }}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </Combobox.Clear>
            )}
            <Combobox.Trigger
              aria-label="Show states"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </Combobox.Trigger>
          </div>
        </div>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} collisionPadding={8} className="z-[100] outline-none">
            <Combobox.Popup className="w-(--anchor-width) min-w-56 max-h-[min(var(--available-height),20rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none transition-opacity data-[ending-style]:opacity-0 data-[starting-style]:opacity-0">
              <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground empty:hidden">No matching state.</Combobox.Empty>
              <Combobox.List className="outline-none">
                {(item: UsStateOption) => (
                  <Combobox.Item
                    key={item.value}
                    value={item}
                    className="flex min-h-10 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground sm:min-h-9"
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      <Combobox.ItemIndicator>
                        <Check className="size-4" aria-hidden="true" />
                      </Combobox.ItemIndicator>
                    </span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Combobox.Item>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {message ? (
        <p
          id={`${fieldId}-error`}
          className={cn('flex items-start gap-1.5 text-xs leading-relaxed', error ? 'text-destructive' : 'text-amber-700 dark:text-amber-400')}
        >
          {error ? (
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          )}
          {message}
        </p>
      ) : hint ? (
        <p id={`${fieldId}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}
