import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function DirectoryPagination({
  page,
  pageCount,
  hrefFor,
  label,
}: {
  page: number
  pageCount: number
  hrefFor: (page: number) => string
  label: string
}) {
  if (pageCount <= 1) return null
  const hasPrev = page > 1
  const hasNext = page < pageCount

  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3 border-t border-[#E2E8E2] pt-4">
      {hasPrev ? (
        <Button variant="outline" size="lg" className="h-10" render={<Link href={hrefFor(page - 1)} rel="prev" />} nativeButton={false}>
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="h-10" disabled>
          <ChevronLeft data-icon="inline-start" />
          Previous
        </Button>
      )}
      <span className="text-sm text-muted-foreground" aria-current="page">
        {'Page '}
        <span className="tabular font-medium text-foreground">{page}</span>
        {' of '}
        <span className="tabular font-medium text-foreground">{pageCount}</span>
      </span>
      {hasNext ? (
        <Button variant="outline" size="lg" className="h-10" render={<Link href={hrefFor(page + 1)} rel="next" />} nativeButton={false}>
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      ) : (
        <Button variant="outline" size="lg" className="h-10" disabled>
          Next
          <ChevronRight data-icon="inline-end" />
        </Button>
      )}
    </nav>
  )
}
