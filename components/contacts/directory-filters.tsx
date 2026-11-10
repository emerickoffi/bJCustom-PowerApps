'use client'

import { useState } from 'react'
import { Popover } from '@base-ui/react/popover'
import { SlidersHorizontal, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import type { DirectoryView, StatusFilter } from '@/lib/contacts'

export type AdvancedFilters = { companyId: string; specialty: string; product: string }

export const EMPTY_ADVANCED: AdvancedFilters = { companyId: '', specialty: '', product: '' }

export function countAdvanced(f: AdvancedFilters) {
  return [f.companyId, f.specialty, f.product].filter(Boolean).length
}

export type DirectoryFilterValues = AdvancedFilters & { status: StatusFilter; projectId: string }

/** The directory opens on Active records only; clearing filters returns here rather than to "All statuses". */
export const DEFAULT_FILTERS: DirectoryFilterValues = { ...EMPTY_ADVANCED, status: 'active', projectId: '' }

/** Fields currently narrowing the list. The default Active status counts, since it hides inactive records. */
export function countFilters(f: DirectoryFilterValues) {
  return (f.status === 'all' ? 0 : 1) + (f.projectId ? 1 : 0) + countAdvanced(f)
}

export function isDefaultFilters(f: DirectoryFilterValues) {
  return f.status === DEFAULT_FILTERS.status && !f.projectId && countAdvanced(f) === 0
}

type Option = readonly [string, string]

const STATUS_OPTIONS: readonly Option[] = [
  ['active', 'Active'],
  ['inactive', 'Inactive'],
  ['all', 'All statuses'],
]

export function DirectoryFilters({
  view,
  value,
  onApply,
  projectOptions,
  companyOptions,
  specialtyOptions,
  productOptions,
}: {
  view: DirectoryView
  value: DirectoryFilterValues
  onApply: (next: DirectoryFilterValues) => void
  projectOptions: readonly Option[]
  companyOptions: readonly Option[]
  specialtyOptions: readonly string[]
  productOptions: readonly string[]
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value)
  const active = countFilters(value)
  const isPeople = view === 'people'

  function handleOpenChange(next: boolean) {
    if (next) setDraft(value)
    setOpen(next)
  }

  function apply(next: DirectoryFilterValues) {
    onApply(next)
    setOpen(false)
  }

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      <Popover.Trigger render={<Button variant="outline" size="lg" className="bg-card" aria-label={active ? `Filters, ${active} active` : 'Filters'} />}>
        <SlidersHorizontal data-icon="inline-start" />
        <span>Filters</span>
        {active > 0 && (
          <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-badge bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
            {active}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner className="isolate z-50 outline-none" align="end" sideOffset={6} collisionPadding={12}>
          <Popover.Popup className="flex w-[min(20rem,calc(100vw-1.5rem))] origin-(--transform-origin) flex-col rounded-xl bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3">
              <Popover.Title className="text-sm font-semibold text-foreground">Filters</Popover.Title>
              <Popover.Close render={<Button variant="ghost" size="icon-sm" aria-label="Close filters" />}>
                <X />
              </Popover.Close>
            </div>
            <div className="flex max-h-[min(26rem,calc(100dvh-12rem))] flex-col gap-3.5 overflow-y-auto px-4 py-4">
              <FilterField
                id="filter-status"
                label="Status"
                value={draft.status}
                options={STATUS_OPTIONS}
                onChange={(status) => setDraft((d) => ({ ...d, status: status as StatusFilter }))}
              />
              <FilterField
                id="filter-project"
                label="Project"
                value={draft.projectId}
                allLabel="All projects"
                options={projectOptions}
                onChange={(projectId) => setDraft((d) => ({ ...d, projectId }))}
              />
              <FilterField
                id="filter-company"
                label={isPeople ? 'Works at company' : 'Specific company'}
                value={draft.companyId}
                allLabel="Any company"
                options={companyOptions}
                onChange={(companyId) => setDraft((d) => ({ ...d, companyId }))}
              />
              {isPeople && (
                <FilterField
                  id="filter-specialty"
                  label="Profession / trade"
                  value={draft.specialty}
                  allLabel="Any profession"
                  options={specialtyOptions.map((s) => [s, s] as const)}
                  onChange={(specialty) => setDraft((d) => ({ ...d, specialty }))}
                />
              )}
              <FilterField
                id="filter-product"
                label="Product category"
                value={draft.product}
                allLabel="Any product category"
                options={productOptions.map((s) => [s, s] as const)}
                onChange={(product) => setDraft((d) => ({ ...d, product }))}
              />
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-border/70 bg-muted/40 px-4 py-3">
              <Button variant="ghost" size="sm" disabled={isDefaultFilters(draft) && isDefaultFilters(value)} onClick={() => apply(DEFAULT_FILTERS)}>
                Clear filters
              </Button>
              <Button size="sm" onClick={() => apply(draft)}>
                Apply
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

function FilterField({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  /** Label for the "no filter" choice. Omit when the options already cover every state. */
  allLabel?: string
  options: readonly Option[]
  onChange: (value: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-card">
        {allLabel && <option value="">{allLabel}</option>}
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
