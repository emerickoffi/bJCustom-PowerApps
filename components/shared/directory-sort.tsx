'use client'

import { useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { NativeSelect } from '@/components/shared/form-field'

export function DirectorySort({
  value,
  options,
  hideLabel = false,
}: {
  value: string
  options: { value: string; label: string }[]
  /** Keep the label for screen readers only, for compact toolbars. */
  hideLabel?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="directory-sort" className={hideLabel ? 'sr-only' : 'text-sm text-muted-foreground'}>
        Sort
      </label>
      <NativeSelect
        id="directory-sort"
        value={value}
        aria-busy={pending}
        className="h-10 bg-card sm:w-48"
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString())
          params.set('sort', event.target.value)
          params.delete('page')
          startTransition(() => router.push(`${pathname}?${params.toString()}`))
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  )
}
