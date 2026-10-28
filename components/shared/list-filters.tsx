import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { SearchInput } from '@/components/shared/search-input'
import { LocationFilters, type LocationOption } from '@/components/shared/location-filters'

export function ListFilters({
  searchPlaceholder,
  defaultQuery,
  defaultStatus,
  statusOptions,
  location,
  clearHref,
}: {
  searchPlaceholder: string
  defaultQuery: string
  defaultStatus: string
  statusOptions: { value: string; label: string }[]
  location?: { options: LocationOption[]; defaultState: string; defaultCity: string }
  clearHref?: string
}) {
  return (
    <form role="search" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <SearchInput
        key={defaultQuery}
        id="q"
        label="Search"
        defaultValue={defaultQuery}
        placeholder={searchPlaceholder}
        className="flex-1 sm:min-w-64"
      />
      <label htmlFor="status" className="sr-only">
        Status
      </label>
      <NativeSelect id="status" name="status" defaultValue={defaultStatus} className="bg-card sm:w-56">
        <option value="">All statuses</option>
        {statusOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      {location && (
        <LocationFilters
          key={`${location.defaultState}|${location.defaultCity}`}
          locations={location.options}
          defaultState={location.defaultState}
          defaultCity={location.defaultCity}
        />
      )}
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
