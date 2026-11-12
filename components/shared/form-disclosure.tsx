import { ChevronRight as ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Native <details> keeps its fields mounted while collapsed, so their values still submit with the form.
 */
export function FormDisclosure({
  title,
  hint,
  defaultOpen = false,
  className,
  children,
}: {
  title: string
  hint?: string
  defaultOpen?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <details open={defaultOpen} className={cn('group min-w-0 sm:col-span-2', className)}>
      <summary className="flex min-h-9 w-fit cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRightIcon className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        {title}
        {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </details>
  )
}
