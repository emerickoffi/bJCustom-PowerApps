'use client'

import { useId, useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowRight, ChevronDown, CircleAlert, CircleCheck, ListOrdered, Loader2, RefreshCw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatShortDate } from '@/lib/greeting'
import { cn } from '@/lib/utils'
import type { Briefing, BriefingItem } from '@/lib/daily-priorities'
import { briefingClear, briefingMatches, workScopeEmptyMessage } from '@/lib/work-scope'

const INITIAL_ROWS = 3
const FOCUS_RECHECK_MS = 120_000

async function requestBriefing(projectId: string | null): Promise<Briefing> {
  // "auto" re-ranks from live records every time and only asks the model when the ranked facts changed.
  const res = await fetch('/api/priorities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'auto', projectId }),
  })
  const body = (await res.json().catch(() => null)) as { briefing?: Briefing; error?: string } | null
  if (!res.ok || !body?.briefing) throw new Error(body?.error ?? 'Couldn’t check priorities.')
  return body.briefing
}

const subscribeNoop = () => () => {}

function timeOf(iso: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function newer(a: Briefing | undefined | null, b: Briefing): Briefing {
  return a && a.dataCheckedAt > b.dataCheckedAt ? a : b
}

export function DailyPriorities({
  initial,
  viewAllHref,
  listClear = false,
}: {
  initial: Briefing
  viewAllHref?: string
  /** The Action Center list below loaded fully and is empty; when priorities are empty too, show one compact state. */
  listClear?: boolean
}) {
  const router = useRouter()
  const listId = useId()
  // The server renders in UTC; only format the clock time once we're in the user's timezone.
  const hydrated = useSyncExternalStore(subscribeNoop, () => true, () => false)
  const [expanded, setExpanded] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  const wantsSummary = initial.aiAvailable && (initial.state === 'needs_summary' || initial.state === 'stale')
  const { data, error, isValidating, mutate } = useSWR(
    ['priorities', initial.scope, initial.projectId ?? 'all'],
    () => requestBriefing(initial.projectId),
    {
      fallbackData: initial,
      revalidateOnMount: wantsSummary,
      revalidateIfStale: false,
      revalidateOnFocus: true,
      focusThrottleInterval: FOCUS_RECHECK_MS,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
      dedupingInterval: 10_000,
      onSuccess: (fresh) => {
        setRefreshError(null)
        // Keep the category list in step when a focus re-check finds resolved or new work.
        if (fresh.fingerprint !== initial.fingerprint) router.refresh()
      },
    },
  )

  // A response for the previous scope or project is never shown after a switch.
  const briefing = newer(briefingMatches(data, initial) ? data : undefined, initial)
  const busy = refreshing || isValidating
  const writing = isValidating && !refreshing && wantsSummary && !briefing.items.some((i) => i.summarized)
  const failure = refreshError ?? (error ? 'Couldn’t refresh priorities.' : null)

  async function refresh() {
    if (busy) return
    setRefreshing(true)
    setAnnouncement('')
    try {
      const fresh = await requestBriefing(initial.projectId)
      if (!briefingMatches(fresh, initial)) {
        router.refresh()
        return
      }
      await mutate(fresh, { revalidate: false })
      setRefreshError(null)
      setAnnouncement(fresh.items.length ? `Priorities updated. ${fresh.items.length} shown.` : 'Priorities updated.')
      router.refresh()
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : 'Couldn’t refresh priorities.')
      setAnnouncement('Couldn’t refresh priorities. Showing the last update.')
    } finally {
      setRefreshing(false)
    }
  }

  const items = briefing.items
  const visible = expanded ? items : items.slice(0, INITIAL_ROWS)
  const partial = briefing.unchecked.length > 0
  const aiFellBack = briefing.aiAvailable && items.length > 0 && !items.some((i) => i.summarized) && !writing
  const scopeLabel = briefing.scope === 'mine' ? 'My work' : 'All work'

  const allClear =
    listClear && briefingClear({ itemCount: items.length, uncheckedCount: briefing.unchecked.length, failed: !!failure })
  if (allClear) {
    return (
      <section aria-label="Action summary" aria-busy={busy} className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-[#17212B]">
            <CircleCheck className="size-4 shrink-0 text-[#0F766E]" aria-hidden="true" />
            {workScopeEmptyMessage(briefing.scope)}
          </p>
          <p className="text-xs text-[#5B6775]">
            <span className="sr-only">Last checked </span>
            <span aria-hidden="true">Checked </span>
            <time dateTime={briefing.dataCheckedAt}>{hydrated ? timeOf(briefing.dataCheckedAt) : '—'}</time>
            {` · ${scopeLabel}`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={refresh}
          disabled={busy}
          aria-label={refreshing ? 'Refreshing actions' : 'Refresh actions'}
          title="Refresh"
          className="size-8 shrink-0 text-[#526173] hover:text-[#007F95]"
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
        </Button>
        <p className="sr-only" role="status" aria-live="polite">
          {announcement}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby={`${listId}-heading`} aria-busy={busy} className="flex flex-col border-b border-[#E4E9EF] pb-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h3 id={`${listId}-heading`} className="flex items-center gap-1.5 text-sm font-semibold text-[#17212B]">
            <ListOrdered className="size-4 text-[#007F95]" aria-hidden="true" />
            Your priorities
          </h3>
          <p className="text-xs text-[#5B6775]">
            <span className="sr-only">Last checked </span>
            <span aria-hidden="true">Updated </span>
            <time dateTime={briefing.dataCheckedAt}>{hydrated ? timeOf(briefing.dataCheckedAt) : '—'}</time>
            {` · ${scopeLabel}`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={refresh}
          disabled={busy}
          aria-label={refreshing ? 'Refreshing priorities' : 'Refresh priorities'}
          title="Refresh priorities"
          className="size-8 shrink-0 text-[#526173] hover:text-[#007F95]"
        >
          {refreshing ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="size-4" aria-hidden="true" />}
        </Button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <StatusNotes
        writing={writing}
        failure={failure}
        lastChecked={timeOf(briefing.dataCheckedAt)}
        onRetry={refresh}
        retryDisabled={busy}
        partial={partial}
        unchecked={briefing.unchecked}
        notice={briefing.notice}
        aiFellBack={aiFellBack}
      />

      {items.length === 0 ? (
        partial ? null : (
          <p className="mt-2 flex items-center gap-2 text-sm text-[#344054]">
            <CircleCheck className="size-4 text-[#0F766E]" aria-hidden="true" />
            No urgent actions found.
          </p>
        )
      ) : (
        <ol id={listId} className="mt-1 flex flex-col divide-y divide-[#EEF1F4]">
          {visible.map((item, index) => (
            <PriorityRow key={item.id} item={item} rank={index + 1} />
          ))}
        </ol>
      )}

      {(items.length > INITIAL_ROWS || (viewAllHref && briefing.total > items.length)) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
          {items.length > INITIAL_ROWS && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls={listId}
              className="inline-flex min-h-8 items-center gap-1 rounded-sm text-xs font-medium text-[#007F95] hover:text-[#006B7E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007F95]"
            >
              <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden="true" />
              {expanded ? 'Show less' : 'Show all priorities'}
            </button>
          )}
          {viewAllHref && briefing.total > items.length && (
            <Link
              href={viewAllHref}
              className="inline-flex min-h-8 items-center gap-1 rounded-sm text-xs font-medium text-[#007F95] underline-offset-4 hover:text-[#006B7E] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007F95]"
            >
              View all actions
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
      )}
    </section>
  )
}

function StatusNotes(props: {
  writing: boolean
  failure: string | null
  lastChecked: string
  onRetry: () => void
  retryDisabled: boolean
  partial: boolean
  unchecked: string[]
  notice: string | null
  aiFellBack: boolean
}) {
  const notes: React.ReactNode[] = []
  if (props.failure) {
    notes.push(
      <p key="stale" className="flex flex-wrap items-center gap-x-2 text-[#B54708]">
        <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />
        {`${props.failure} Showing priorities from ${props.lastChecked}.`}
        <button
          type="button"
          onClick={props.onRetry}
          disabled={props.retryDisabled}
          className="rounded-sm font-medium text-[#007F95] underline underline-offset-2 hover:text-[#006B7E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007F95] disabled:opacity-60"
        >
          Retry
        </button>
      </p>,
    )
  }
  if (props.partial) {
    notes.push(
      <p key="partial" className="flex items-center gap-1.5" title={`Not checked: ${props.unchecked.join(', ')}`}>
        <CircleAlert className="size-3.5 shrink-0 text-[#B54708]" aria-hidden="true" />
        Some sources could not be checked.
        <span className="sr-only">{`Not checked: ${props.unchecked.join(', ')}.`}</span>
      </p>,
    )
  }
  if (props.writing) notes.push(<p key="writing">Writing short summaries…</p>)
  else if (props.notice) notes.push(<p key="notice">{props.notice}</p>)
  else if (props.aiFellBack) notes.push(<p key="fallback">Showing standard priority text.</p>)
  if (!notes.length) return null
  return <div className="mt-1.5 flex flex-col gap-1 text-xs text-[#5B6775]">{notes}</div>
}

function ownerLabel(item: BriefingItem): { text: string; yours: boolean } {
  if (item.owner.kind === 'you') return { text: 'Assigned to you', yours: true }
  if (item.owner.kind === 'approver') return { text: 'Team · Manager approval', yours: false }
  return { text: `Team · ${item.owner.label}`, yours: false }
}

function rankReason(item: BriefingItem, rank: number): string {
  const owner = item.owner.kind === 'you' ? 'assigned to you' : item.owner.kind === 'approver' ? 'waiting on a manager approval' : `owned by ${item.owner.label === 'Unassigned' ? 'no one yet' : item.owner.label}`
  const due = item.dueDate ? `, due ${formatShortDate(item.dueDate)}` : ''
  return `Ranked #${rank} because it is ${item.categoryLabel.toLowerCase()}${due}, and ${owner}. Source: ${item.source}.`
}

function PriorityRow({ item, rank }: { item: BriefingItem; rank: number }) {
  const urgent = item.category === 'overdue' || item.category === 'due_today' || item.category === 'blocking'
  const owner = ownerLabel(item)

  return (
    <li className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:gap-4">
      <div className="flex min-w-0 flex-1 gap-2.5">
        <span aria-hidden="true" className="mt-px w-4 shrink-0 text-right text-xs font-semibold tabular-nums text-[#8592A3]">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-pretty text-sm font-medium leading-snug text-[#17212B]">{item.heading}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-[#526173]">
            {urgent && (
              <span className="inline-flex items-center gap-1 font-medium text-[#B54708]">
                <span className="size-1.5 rounded-full bg-[#F97316]" aria-hidden="true" />
                {item.categoryLabel}
              </span>
            )}
            {item.projectName && <Sep show={urgent} />}
            {item.projectName && <span className="font-medium text-[#17212B]/80">{item.projectName}</span>}
            <Sep show={urgent || !!item.projectName} />
            <span className={cn(owner.yours && 'font-medium text-[#007F95]')}>{owner.text}</span>
            {item.dueDate && (
              <>
                <Sep show />
                <time dateTime={item.dueDate} className={cn('tabular-nums', item.category === 'overdue' && 'font-medium text-[#B54708]')}>
                  {`Due ${formatShortDate(item.dueDate)}`}
                </time>
              </>
            )}
          </p>
          <p className="mt-1 line-clamp-2 text-pretty text-xs leading-relaxed text-[#344054]">{item.why}</p>
          <details className="group/why mt-0.5 text-xs text-[#526173]">
            <summary className="inline-flex min-h-6 cursor-pointer list-none items-center gap-1 rounded-sm font-medium text-[#526173] hover:text-[#007F95] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007F95] [&::-webkit-details-marker]:hidden">
              <ChevronDown className="size-3 transition-transform group-open/why:rotate-180" aria-hidden="true" />
              Why this matters
            </summary>
            <p className="mt-0.5 text-pretty leading-relaxed">{rankReason(item, rank)}</p>
          </details>
        </div>
      </div>
      <Link
        href={item.href}
        className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'h-8 shrink-0 self-start bg-white pl-[26px] sm:pl-3')}
        title={item.actionLabel}
      >
        {item.verb}
        <ArrowRight className="size-3.5" aria-hidden="true" />
        <span className="sr-only">{`: ${item.heading}`}</span>
      </Link>
    </li>
  )
}

function Sep({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span aria-hidden="true" className="text-[#A3ADB9]">
      ·
    </span>
  )
}
