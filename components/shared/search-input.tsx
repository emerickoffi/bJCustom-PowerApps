'use client'

import { useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type SearchInputProps = {
  id: string
  label: string
  name?: string
  placeholder?: string
  defaultValue?: string
  /**
   * When true, clearing also removes this field's applied query from the URL
   * (and resets `page`), keeping every other search param such as `status`.
   */
  syncUrl?: boolean
  className?: string
  inputClassName?: string
}

export function SearchInput({
  id,
  label,
  name = 'q',
  placeholder,
  defaultValue = '',
  syncUrl = true,
  className,
  inputClassName,
}: SearchInputProps) {
  const router = useRouter()
  const pathname = usePathname()
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue)

  function clear() {
    setValue('')
    inputRef.current?.focus()
    if (!syncUrl) return
    const params = new URLSearchParams(window.location.search)
    if (!params.has(name) && !params.has('page')) return
    params.delete(name)
    params.delete('page')
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  return (
    <div className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id={id}
        name={name}
        type="search"
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            clear()
          }
        }}
        className={cn(
          'h-10 w-full min-w-0 rounded-lg border border-input bg-card pr-10 pl-9 text-sm text-foreground outline-none transition-colors',
          'placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
          '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-cancel-button]:appearance-none',
          inputClassName,
        )}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          aria-controls={id}
          className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
