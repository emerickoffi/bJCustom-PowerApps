import Link from 'next/link'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { SearchInput } from '@/components/shared/search-input'
import {
  QUALIFICATION_FILTERS,
  QUALIFICATION_FILTER_LABELS,
  QUALIFICATION_SORTS,
  QUALIFICATION_SORT_LABELS,
  type QualificationFilter,
  type QualificationSort,
} from '@/lib/subcontractor-qualification'

type Option = { value: string; label: string }

function LabeledSelect({
  id,
  label,
  defaultValue,
  children,
  className,
}: {
  id: string
  label: string
  defaultValue: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <NativeSelect id={id} name={id} defaultValue={defaultValue} className="bg-card">
        {children}
      </NativeSelect>
    </div>
  )
}

/** One GET form so search, status, qualification and sort apply together and survive reloads. */
export function DirectoryToolbar({
  defaultQuery,
  defaultStatus,
  statusOptions,
  qualification,
}: {
  defaultQuery: string
  defaultStatus: string
  statusOptions: Option[]
  /** Null when vetting storage is unavailable, so the qualification controls are hidden rather than inert. */
  qualification: {
    active: QualificationFilter | null
    sort: QualificationSort
    counts: Record<QualificationFilter, number>
    total: number
  } | null
}) {
  const filtered = Boolean(defaultQuery || defaultStatus || qualification?.active || (qualification && qualification.sort !== 'name'))
  return (
    <form
      role="search"
      aria-label="Filter subcontractors"
      className="flex flex-col gap-2 rounded-xl border border-border/70 bg-card p-2 shadow-xs md:flex-row md:flex-wrap md:items-center"
    >
      <SearchInput
        key={defaultQuery}
        id="q"
        label="Search subcontractors"
        defaultValue={defaultQuery}
        placeholder="Search company, trade, email, or phone"
        className="md:min-w-64 md:flex-1"
      />
      <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
        {qualification && (
          <LabeledSelect id="qualification" label="Qualification" defaultValue={qualification.active ?? ''} className="md:w-52">
            <option value="">{`Qualification: All (${qualification.total})`}</option>
            {QUALIFICATION_FILTERS.map((f) => (
              <option key={f} value={f}>
                {`${QUALIFICATION_FILTER_LABELS[f]} (${qualification.counts[f]})`}
              </option>
            ))}
          </LabeledSelect>
        )}
        <LabeledSelect id="status" label="Operational status" defaultValue={defaultStatus} className="md:w-40">
          <option value="">All statuses</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </LabeledSelect>
        {qualification && (
          <LabeledSelect id="sort" label="Sort by" defaultValue={qualification.sort} className="col-span-2 md:w-52">
            {QUALIFICATION_SORTS.map((s) => (
              <option key={s} value={s}>
                {`Sort: ${QUALIFICATION_SORT_LABELS[s]}`}
              </option>
            ))}
          </LabeledSelect>
        )}
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="lg" className="h-10 flex-1 md:flex-none">
          Apply
        </Button>
        {filtered && (
          <Button
            variant="ghost"
            size="lg"
            className="h-10 flex-1 md:flex-none"
            render={<Link href="/subcontractors" />}
            nativeButton={false}
          >
            <RotateCcw data-icon="inline-start" />
            Reset
          </Button>
        )}
      </div>
    </form>
  )
}
