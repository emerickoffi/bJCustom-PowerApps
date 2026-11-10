import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { SearchInput } from '@/components/shared/search-input'
import { AutoApplyForm } from '@/components/shared/auto-apply-form'
import { LocationFilters, type LocationOption } from '@/components/shared/location-filters'
import { AdditionalFilters, type FilterSelect } from '@/components/shared/additional-filters'

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
  carryParams,
  autoApply = false,
  groupAdditional = false,
}: {
  searchPlaceholder: string
  defaultQuery: string
  defaultStatus: string
  statusOptions: { value: string; label: string }[]
  /** Additional single-value dropdown filters rendered after Status. */
  selects?: FilterSelect[]
  location?: { options: LocationOption[]; defaultState: string; defaultCity: string }
  clearHref?: string
  /** Non-filter URL state (e.g. sort, view) carried through Apply; page is intentionally dropped. */
  preserve?: Record<string, string | null | undefined>
  /** Client-set URL parameters kept through auto-applied filter changes (auto-apply only). */
  carryParams?: readonly string[]
  /** Apply filters on change and debounce search, replacing the Apply button. */
  autoApply?: boolean
  /** Keep only Search and Status in the toolbar; the other selects and location move into one "Filters" popover with chips. */
  groupAdditional?: boolean
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
        className={groupAdditional ? 'sm:w-64 lg:w-80 xl:w-96' : 'flex-1 sm:min-w-64'}
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
      {groupAdditional && <AdditionalFilters selects={selects ?? []} location={location} />}
      {!groupAdditional && selects?.map((select) => (
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
      {!groupAdditional && location && (
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
      <AutoApplyForm clearHref={clearHref} carryParams={carryParams} className={FORM_CLASS}>
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
