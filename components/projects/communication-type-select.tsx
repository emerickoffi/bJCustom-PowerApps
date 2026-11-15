'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'

export function CommunicationTypeSelect({
  value,
  options,
}: {
  value: string
  /** Each option carries the fully built Overview link, so the other filters stay intact. */
  options: { value: string; label: string; href: string }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <>
      <label htmlFor="communications-type" className="sr-only">
        Filter by type
      </label>
      <select
        id="communications-type"
        value={value}
        aria-busy={pending || undefined}
        onChange={(e) => {
          const next = options.find((o) => o.value === e.target.value)
          if (next) startTransition(() => router.replace(next.href, { scroll: false }))
        }}
        className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </>
  )
}
