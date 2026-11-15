import { NativeSelect } from '@/components/shared/form-field'
import { SearchInput } from '@/components/shared/search-input'
import { AutoApplyForm } from '@/components/shared/auto-apply-form'
import { SUBCONTRACTOR_PREVIEW_PARAM } from '@/lib/subcontractor-preview'
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
      <NativeSelect key={defaultValue} id={id} name={id} defaultValue={defaultValue} className="h-9 w-full bg-card pointer-coarse:h-11">
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
    <AutoApplyForm
      clearHref={filtered ? '/subcontractors' : undefined}
      carryParams={[SUBCONTRACTOR_PREVIEW_PARAM]}
      className="flex min-w-0 flex-wrap items-center gap-2 [&>button]:h-9 pointer-coarse:[&>button]:h-11"
    >
      <SearchInput
        // Auto-apply updates the URL while typing; remounting on each change would drop focus.
        key="search"
        id="q"
        label="Search subcontractors"
        defaultValue={defaultQuery}
        placeholder="Search company, trade, email, or phone"
        syncUrl={false}
        className="w-full sm:w-auto sm:min-w-56 sm:max-w-80 sm:flex-1"
        inputClassName="h-9 pointer-coarse:h-11"
      />
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center">
        {qualification && (
          <LabeledSelect id="qualification" label="Qualification" defaultValue={qualification.active ?? ''} className="sm:w-48">
            <option value="">{`Qualification: All (${qualification.total})`}</option>
            {QUALIFICATION_FILTERS.map((f) => (
              <option key={f} value={f}>
                {`${QUALIFICATION_FILTER_LABELS[f]} (${qualification.counts[f]})`}
              </option>
            ))}
          </LabeledSelect>
        )}
        <LabeledSelect id="status" label="Operational status" defaultValue={defaultStatus} className="sm:w-36">
          <option value="">All statuses</option>
          {statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </LabeledSelect>
        {qualification && (
          <LabeledSelect id="sort" label="Sort by" defaultValue={qualification.sort} className="col-span-2 sm:w-48">
            {QUALIFICATION_SORTS.map((s) => (
              <option key={s} value={s}>
                {`Sort: ${QUALIFICATION_SORT_LABELS[s]}`}
              </option>
            ))}
          </LabeledSelect>
        )}
      </div>
    </AutoApplyForm>
  )
}
