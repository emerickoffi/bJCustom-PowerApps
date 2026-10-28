'use client'

import Link from 'next/link'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-lg bg-muted ${className}`} />
}

export function RouteLoading() {
  return (
    <div role="status" aria-live="polite" className="mx-auto flex w-full flex-col gap-8">
      <span className="sr-only">Loading</span>
      <div className="flex flex-col gap-3 border-b border-border/70 pb-4 md:pb-6" aria-hidden="true">
        <Bar className="h-3 w-24" />
        <Bar className="h-8 w-64 max-w-full" />
        <Bar className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="surface flex flex-col gap-3 p-5">
            <Bar className="h-3 w-20" />
            <Bar className="h-7 w-28" />
          </div>
        ))}
      </div>
      <div className="surface flex flex-col gap-3 p-5 md:p-6" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <Bar key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

export function RouteError({ reset, homeHref }: { reset: () => void; homeHref: string }) {
  return (
    <div
      role="alert"
      className="surface mx-auto flex max-w-xl flex-col items-center gap-4 px-6 py-12 text-center"
    >
      <span className="flex size-11 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
        <AlertTriangle className="size-5" aria-hidden="true" />
      </span>
      <div className="flex flex-col gap-1.5">
        <h1 className="font-serif text-xl font-semibold text-foreground">This page couldn&apos;t load</h1>
        <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
          Something went wrong while retrieving this information. Your data has not been changed. Try again, or
          return to the start page.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw data-icon="inline-start" aria-hidden="true" />
          Try again
        </Button>
        <Button variant="outline" render={<Link href={homeHref} />} nativeButton={false}>
          Go to start
        </Button>
      </div>
    </div>
  )
}
