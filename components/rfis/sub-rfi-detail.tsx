'use client'

import useSWR from 'swr'
import { Loader2 } from 'lucide-react'
import type { RfiDetail } from '@/lib/rfis'
import { fetchRfiJson } from '@/components/rfis/ask-question-drawer'
import { RfiDetailView } from '@/components/rfis/rfi-detail'
import { Button } from '@/components/ui/button'

/** A subcontractor's view of one question: read it, open its files, and answer it when it is theirs to answer. */
export function SubRfiDetail({ rfiId }: { rfiId: string }) {
  const { data, error, isLoading, mutate } = useSWR<RfiDetail>(`/api/sub/rfis/${rfiId}`, fetchRfiJson, {
    revalidateOnFocus: true,
  })

  if (isLoading && !data) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading the question...
      </p>
    )
  }
  if (error || !data) {
    return (
      <div role="alert" className="flex flex-col items-start gap-2">
        <p className="text-sm text-destructive">{error instanceof Error ? error.message : 'This question is not available.'}</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 md:p-5">
      <RfiDetailView detail={data} onChanged={() => mutate()} />
    </div>
  )
}
