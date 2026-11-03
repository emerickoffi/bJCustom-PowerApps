'use client'

import { useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { NativeSelect } from '@/components/shared/form-field'
import { DIRECTORY_PAGE_SIZE, DIRECTORY_PAGE_SIZES, pageItems, type DirectoryPageSize } from '@/lib/directory'
import { cn } from '@/lib/utils'

const controlBase =
  'inline-flex h-10 min-w-10 items-center justify-center gap-1 rounded-md border px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50'
const idle = 'border-[#D6DDE5] bg-card text-foreground hover:bg-[#F3F4F6]'
const disabledCls = 'border-[#D6DDE5] bg-card text-muted-foreground opacity-50'

/**
 * Footer for Clients/Projects directories. Page links skip Next's scroll-to-top and
 * instead bring the results heading (`resultsId`) into view once the new page renders.
 */
export function DirectoryPager({
  page,
  pageCount,
  pageSize,
  summary,
  hrefFor,
  resultsId,
  label,
}: {
  page: number
  pageCount: number
  pageSize: DirectoryPageSize
  summary: string
  hrefFor: (page: number) => string
  resultsId: string
  label: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const scrollPending = useRef(false)

  useEffect(() => {
    if (!scrollPending.current) return
    scrollPending.current = false
    document.getElementById(resultsId)?.scrollIntoView({ block: 'start' })
  }, [page, pageSize, resultsId])

  const markScroll = () => {
    scrollPending.current = true
  }

  const changeSize = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (Number(value) === DIRECTORY_PAGE_SIZE) params.delete('size')
    else params.set('size', value)
    params.delete('page')
    markScroll()
    const qs = params.toString()
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }))
  }

  const step = (target: number, text: string, icon: 'prev' | 'next', className?: string) => {
    const content = (
      <>
        {icon === 'prev' && <ChevronLeft className="size-4" aria-hidden="true" />}
        {text}
        {icon === 'next' && <ChevronRight className="size-4" aria-hidden="true" />}
      </>
    )
    const enabled = target >= 1 && target <= pageCount
    return enabled ? (
      <Link
        href={hrefFor(target)}
        scroll={false}
        onClick={markScroll}
        rel={icon}
        className={cn(controlBase, idle, className)}
      >
        {content}
      </Link>
    ) : (
      <span aria-disabled="true" className={cn(controlBase, disabledCls, className)}>
        {content}
      </span>
    )
  }

  return (
    <div
      aria-busy={pending}
      className="flex flex-col gap-4 border-t border-[#D6DDE5] pt-4 lg:flex-row lg:items-center lg:justify-between"
    >
      <p className="text-sm text-muted-foreground">{summary}</p>

      {pageCount > 1 && (
        <nav aria-label={label} className="flex items-center justify-between gap-2 sm:justify-center">
          {step(page - 1, 'Previous', 'prev')}
          <span className="text-sm text-muted-foreground sm:hidden">
            {'Page '}
            <span className="tabular font-medium text-foreground">{page}</span>
            {' of '}
            <span className="tabular font-medium text-foreground">{pageCount}</span>
          </span>
          <ol className="hidden items-center gap-1 sm:flex">
            {pageItems(page, pageCount).map((item) =>
              typeof item === 'number' ? (
                <li key={item}>
                  {item === page ? (
                    <span
                      aria-current="page"
                      className={cn(controlBase, 'border-[#174D38] bg-[#174D38] px-2 text-white tabular')}
                    >
                      <span className="sr-only">Page </span>
                      {item}
                    </span>
                  ) : (
                    <Link
                      href={hrefFor(item)}
                      scroll={false}
                      onClick={markScroll}
                      className={cn(controlBase, idle, 'px-2 tabular')}
                    >
                      <span className="sr-only">Page </span>
                      {item}
                    </Link>
                  )}
                </li>
              ) : (
                <li key={item} aria-hidden="true" className="flex h-10 min-w-6 items-center justify-center text-sm text-muted-foreground">
                  {'…'}
                </li>
              ),
            )}
          </ol>
          {step(page + 1, 'Next', 'next')}
        </nav>
      )}

      <div className="flex items-center gap-2">
        <label htmlFor={`${resultsId}-size`} className="text-sm text-muted-foreground">
          Per page
        </label>
        <NativeSelect
          id={`${resultsId}-size`}
          value={String(pageSize)}
          onChange={(event) => changeSize(event.target.value)}
          className="h-10 w-24 bg-card"
        >
          {DIRECTORY_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </NativeSelect>
      </div>
    </div>
  )
}
