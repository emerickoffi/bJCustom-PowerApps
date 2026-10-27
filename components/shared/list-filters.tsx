import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/shared/form-field'
import { SearchInput } from '@/components/shared/search-input'

export function ListFilters({
  searchPlaceholder,
  defaultQuery,
  defaultStatus,
  statusOptions,
}: {
  searchPlaceholder: string
  defaultQuery: string
  defaultStatus: string
  statusOptions: { value: string; label: string }[]
}) {
  return (
    <form role="search" className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <SearchInput
        key={defaultQuery}
        id="q"
        label="Search"
        defaultValue={defaultQuery}
        placeholder={searchPlaceholder}
        className="flex-1"
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
      <Button type="submit" variant="outline" size="lg" className="h-10">
        Apply
      </Button>
    </form>
  )
}
