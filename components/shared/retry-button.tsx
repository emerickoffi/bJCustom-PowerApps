'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Re-runs the server reads for the current route without a full page reload; scroll and form state are kept. */
export function RetryButton({ label = 'Try again', className }: { label?: string; className?: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-busy={pending}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-sm font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
        className,
      )}
    >
      <RotateCw className={cn('size-3.5', pending && 'animate-spin')} aria-hidden="true" />
      {pending ? 'Retrying…' : label}
    </button>
  )
}
