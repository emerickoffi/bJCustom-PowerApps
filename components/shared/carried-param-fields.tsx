'use client'

import { useSearchParams } from 'next/navigation'

/** Hidden fields that keep client-set URL parameters through a plain GET form submission. */
export function CarriedParamFields({ names }: { names: readonly string[] }) {
  const searchParams = useSearchParams()
  return names.map((name) => {
    const value = searchParams.get(name)
    return value ? <input key={name} type="hidden" name={name} value={value} /> : null
  })
}
