import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { ResponseBadge } from '@/components/subcontract-quotes/status-badges'
import { formatDeadline, isQuoteSetupError, responseState } from '@/lib/subcontract-quotes'

export const metadata: Metadata = { title: 'Quote requests' }

export type SubQuoteRow = {
  request_id: string
  invitation_id: string
  project_name: string
  title: string
  trade: string | null
  status: string
  response_deadline: string | null
  deadline_timezone: string | null
  invitation_status: string
  revision_requested_at: string | null
  last_submitted_at: string | null
  has_draft: boolean
}

export default async function SubQuotesPage() {
  await requireSubcontractor()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('sub_quote_requests')
  if (isQuoteSetupError(error)) return <p className="text-sm text-muted-foreground">Quote requests are not available yet.</p>
  if (error) return <p role="alert" className="text-sm text-destructive">Quote requests could not be loaded. Please refresh.</p>
  const rows = (data ?? []) as SubQuoteRow[]

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/sub" className="text-sm text-muted-foreground hover:text-foreground">Back to my work</Link>
        <h1 className="font-serif text-xl font-semibold tracking-tight text-foreground md:text-2xl">Quote requests</h1>
        <p className="text-sm text-muted-foreground">Price scopes of work the builder has invited your company to quote.</p>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const state = responseState(r.invitation_status, r.revision_requested_at, r.last_submitted_at)
            return (
              <li key={r.invitation_id}>
                <Link href={`/sub/quotes/${r.request_id}`} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-sage/30">
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="font-medium text-foreground">{r.title}</span>
                    <span className="text-xs text-muted-foreground">{r.project_name}{r.trade ? ` · ${r.trade}` : ''}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.status === 'open' ? `Due ${formatDeadline(r.response_deadline, r.deadline_timezone)}` : r.status === 'closed' ? 'Closed to responses' : 'Cancelled by builder'}
                    </span>
                    <span className="flex flex-wrap gap-2">
                      <ResponseBadge state={state} />
                      {r.has_draft ? <span className="text-xs text-muted-foreground">Draft saved</span> : null}
                    </span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">No quote requests yet.</p>
      )}
    </>
  )
}
