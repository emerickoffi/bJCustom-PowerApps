'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { Popover } from '@base-ui/react/popover'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { LocationSelects, type LocationOption } from '@/components/shared/location-filters'

export type FilterSelect = {
  name: string
  label: string
  allLabel: string
  defaultValue: string
  options: { value: string; label: string }[]
}

type Values = Record<string, string>

const FIELD_CLASS = 'flex flex-col gap-1.5'
const LABEL_CLASS = 'text-xs font-medium text-muted-foreground'

/**
 * Secondary filters behind one "Filters" button, with a chip per applied value.
 * The popover is portaled out of the form, so the values reach it through hidden inputs that are always present,
 * open or closed. Select changes bubble to the form like any other field; chips submit it directly.
 */
export function AdditionalFilters({
  selects,
  location,
  chipsSlotId,
}: {
  selects: FilterSelect[]
  location?: { options: LocationOption[]; defaultState: string; defaultCity: string }
  /** Render the chips into this element (outside the form) instead of on their own row inside it. */
  chipsSlotId?: string
}) {
  const [chipsSlot, setChipsSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setChipsSlot(chipsSlotId ? document.getElementById(chipsSlotId) : null)
  }, [chipsSlotId])
  const defaults: Values = {}
  for (const select of selects) defaults[select.name] = select.defaultValue
  if (location) {
    defaults.state = location.defaultState
    defaults.city = location.defaultCity
  }

  const [applied, setApplied] = useState(defaults)
  const [values, setValues] = useState(defaults)
  // Follow the URL one field at a time, so a choice still on its way there is not overwritten by an earlier response.
  const changed = Object.keys(defaults).filter((name) => defaults[name] !== applied[name])
  if (changed.length) {
    setApplied(defaults)
    setValues((current) => ({ ...current, ...Object.fromEntries(changed.map((name) => [name, defaults[name]])) }))
  }

  const formAnchor = useRef<HTMLInputElement>(null)
  const names = Object.keys(defaults)
  const chips = [
    ...selects.map((select) => ({
      name: select.name,
      label: select.label,
      value: select.options.find((option) => option.value === values[select.name])?.label ?? values[select.name],
    })),
    ...(location
      ? [
          { name: 'state', label: 'State', value: values.state },
          { name: 'city', label: 'City', value: values.city },
        ]
      : []),
  ].filter((chip) => values[chip.name])
  const active = chips.length

  function clear(cleared: string[]) {
    const form = formAnchor.current?.form
    // Committed first, so the submission reads the cleared values.
    flushSync(() => setValues((current) => ({ ...current, ...Object.fromEntries(cleared.map((name) => [name, ''])) })))
    form?.requestSubmit()
    form?.querySelector<HTMLElement>('[data-filters-trigger]')?.focus()
  }

  return (
    <>
      {names.map((name, index) => (
        <input key={name} ref={index === 0 ? formAnchor : undefined} type="hidden" name={name} value={values[name]} />
      ))}
      <Popover.Root>
        <Popover.Trigger
          render={
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="bg-card"
              data-filters-trigger=""
              aria-label={active ? `Filters, ${active} active` : 'Filters'}
            />
          }
        >
          <SlidersHorizontal data-icon="inline-start" />
          <span>Filters</span>
          {active > 0 && (
            <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-badge bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {active}
            </span>
          )}
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner className="isolate z-50 outline-none" align="start" sideOffset={6} collisionPadding={12}>
            <Popover.Popup className="flex w-[min(20rem,calc(100vw-1.5rem))] origin-(--transform-origin) flex-col rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
              <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
                <Popover.Title className="text-sm font-semibold text-foreground">Filters</Popover.Title>
                <Popover.Close render={<Button type="button" variant="ghost" size="icon-sm" aria-label="Close filters" />}>
                  <X />
                </Popover.Close>
              </div>
              <div className="flex max-h-[min(26rem,calc(100dvh-12rem))] flex-col gap-3.5 overflow-y-auto px-4 py-4">
                {selects.map((select) => (
                  <div key={select.name} className={FIELD_CLASS}>
                    <label htmlFor={select.name} className={LABEL_CLASS}>
                      {select.label}
                    </label>
                    <NativeSelect
                      id={select.name}
                      value={values[select.name]}
                      onChange={(e) => setValues((current) => ({ ...current, [select.name]: e.target.value }))}
                      className="w-full bg-card"
                    >
                      <option value="">{select.allLabel}</option>
                      {select.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                ))}
                {location && (
                  <LocationSelects
                    locations={location.options}
                    value={{ state: values.state, city: values.city }}
                    onChange={(next) => setValues((current) => ({ ...current, ...next }))}
                    named={false}
                    fieldClassName={FIELD_CLASS}
                    labelClassName={LABEL_CLASS}
                    stateClassName="w-full bg-card"
                    cityClassName="w-full bg-card"
                  />
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      {active > 0 && renderChips()}
    </>
  )

  function renderChips() {
    // Until the slot is found after mount, render nothing rather than flashing the chips inline first.
    if (chipsSlotId && !chipsSlot) return null
    const chipsRow = (
        <div className={chipsSlot ? 'flex flex-wrap items-center gap-2' : 'order-last flex basis-full flex-wrap items-center gap-2'}>
          <ul aria-label="Applied filters" className="flex flex-wrap items-center gap-2">
            {chips.map((chip) => (
              <li
                key={chip.name}
                className="inline-flex h-8 max-w-full items-center gap-1 rounded-badge border border-[#D6DDE5] bg-card pr-1 pl-2.5 text-xs text-foreground"
              >
                <span className="truncate">
                  <span className="text-muted-foreground">{`${chip.label}: `}</span>
                  <span className="font-medium">{chip.value}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="shrink-0 text-muted-foreground"
                  aria-label={`Remove ${chip.label} filter: ${chip.value}`}
                  onClick={() => clear([chip.name])}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="ghost" size="sm" className="h-8 text-link hover:text-link-hover" onClick={() => clear(names)}>
            Clear additional filters
          </Button>
        </div>
    )
    return chipsSlot ? createPortal(chipsRow, chipsSlot) : chipsRow
  }
}
