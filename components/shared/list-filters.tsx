import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { SearchInput } from '@/components/shared/search-input'
import { AutoApplyForm } from '@/components/shared/auto-apply-form'
import { LocationFilters, type LocationOption } from '@/components/shared/location-filters'

const FORM_CLASS = 'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center'

export function ListFilters({
  searchPlaceholder,
  defaultQuery,
  defaultStatus,
  statusOptions,
  selects,
  location,
  clearHref,
  preserve,
  autoApply = false,
}: {
  searchPlaceholder: string
  defaultQuery: string
  defaultStatus: string
  statusOptions: { value: string; label: string }[]
  /** Additional single-value dropdown filters rendered after Status. */
  selects?: {
    name: string
    label: string
    allLabel: string
    defaultValue: string
    options: { value: string; label: string }[]
  }[]
  location?: { options: LocationOption[]; defaultState: string; defaultCity: string }
  clearHref?: string
  /** Non-filter URL state (e.g. sort, view) carried through Apply; page is intentionally dropped. */
  preserve?: Record<string, string | null | undefined>
  /** Apply filters on change and debounce search, replacing the Apply button. */
  autoApply?: boolean
}) {
  const fields = (
    <>
      {Object.entries(preserve ?? {}).map(([name, value]) =>
        value ? <input key={name} type="hidden" name={name} value={value} /> : null,
      )}
      <SearchInput
        // Auto-apply updates the URL while typing; remounting on each change would drop focus.
        key={autoApply ? 'search' : defaultQuery}
        id="q"
        label="Search"
        defaultValue={defaultQuery}
        placeholder={searchPlaceholder}
        syncUrl={!autoApply}
        className="flex-1 sm:min-w-64"
      />
      <label htmlFor="status" className="sr-only">
        Status
      </label>
      <NativeSelect key={defaultStatus} id="status" name="status" defaultValue={defaultStatus} className="bg-card sm:w-56">
        <option value="">All statuses</option>
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      {selects?.map((select) => (
        <div key={select.name} className="contents">
          <label htmlFor={select.name} className="sr-only">
            {select.label}
          </label>
          <NativeSelect
            key={select.defaultValue}
            id={select.name}
            name={select.name}
            defaultValue={select.defaultValue}
            className="bg-card sm:w-48"
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
        <LocationFilters
          key={`${location.defaultState}|${location.defaultCity}`}
          locations={location.options}
          defaultState={location.defaultState}
          defaultCity={location.defaultCity}
        />
      )}
    </>
  )

  if (autoApply) {
    return (
      <AutoApplyForm clearHref={clearHref} className={FORM_CLASS}>
        {fields}
      </AutoApplyForm>
    )
  }

  return (
    <form role="search" className={FORM_CLASS}>
      {fields}
      <div className="flex gap-2">
        <Button type="submit" variant="outline" size="lg" className="h-10 flex-1 sm:flex-none">
          Apply
        </Button>
        {clearHref && (
          <Button
            variant="ghost"
            size="lg"
            className="h-10 flex-1 sm:flex-none"
            render={<Link href={clearHref} />}
            nativeButton={false}
          >
            Clear filters
          </Button>
        )}
      </div>
    </form>
  )
}
