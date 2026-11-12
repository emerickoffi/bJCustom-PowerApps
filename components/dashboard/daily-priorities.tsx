'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { ArrowRight, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { formatShortDate } from '@/lib/greeting'
import { cn } from '@/lib/utils'
import type { Briefing, BriefingItem, PriorityCategory } from '@/lib/daily-priorities'

const TONE: Record<PriorityCategory, string> = {
  overdue: 'border-[#FECACA] bg-[#FEF2F2] text-[#B42318]',
  blocking: 'border-[#FDBA74] bg-[#FFF1E6] text-[#B54708]',
  due_today: 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]',
  upcoming: 'border-[#BFDBFE] bg-[#EFF6FF] text-[#1D4ED8]',
  waiting: 'border-[#D6DDE5] bg-[#F5F7FA] text-[#475467]',
}

async function requestBriefing(mode: 'auto' | 'manual', projectId: string | null): Promise<Briefing> {
  const res = await fetch('/api/priorities', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, projectId }),
  })
  const body = (await res.json().catch(() => null)) as { briefing?: Briefing; error?: string } | null
  if (!res.ok || !body?.briefing) throw new Error(body?.error ?? 'Couldn’t load priorities.')
  return body.briefing
}

function timeOf(iso: string) {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

function newer(a: Briefing | undefined | null, b: Briefing): Briefing {
  return a && a.dataCheckedAt > b.dataCheckedAt ? a : b
}

export function DailyPriorities({ initial }: { initial: Briefing }) {
  const router = useRouter()
  const [manual, setManual] = useState<Briefing | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wantsSummary = initial.aiAvailable && (initial.state === 'needs_summary' || initial.state === 'stale')
  const { data: auto, isLoading: writing } = useSWR(
    wantsSummary ? ['priorities', initial.fingerprint, initial.projectId ?? 'all'] : null,
    () => requestBriefing('auto', initial.projectId),
    { revalidateOnFocus: false, revalidateOnReconnect: false, shouldRetryOnError: false, dedupingInterval: 60_000 },
  )

  const briefing = newer(manual, newer(auto, initial))

  async function refresh() {
    if (refreshing) return
    setRefreshing(true)
    setError(null)
    try {
      setManual(await requestBriefing('manual', initial.projectId))
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t refresh priorities.')
    } finally {
      setRefreshing(false)
    }
  }

  const busy = refreshing || writing
  const scopeLabel = briefing.scope === 'mine' ? 'your work' : 'all work you can see'

  return (
    <section aria-labelledby="daily-priorities-heading" aria-busy={busy} className="rounded-lg border border-[#D6DDE5] bg-[#F8FAFC]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h3 id="daily-priorities-heading" className="text-sm font-semibold text-[#17212B]">
            Today&apos;s priorities
          </h3>
          <p className="text-xs text-[#5B6775]">
            Ranked from {scopeLabel} · checked {timeOf(briefing.dataCheckedAt)}
            {briefing.generatedAt ? ` · summary written ${timeOf(briefing.generatedAt)}` : ''}
          </p>
        </div>
        {briefing.aiAvailable && briefing.items.length > 0 && (
          <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={busy} className="h-8 bg-white">
            {refreshing ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
            Refresh summary
          </Button>
        )}
      </div>

      <div aria-live="polite" className="px-4 text-xs text-[#5B6775]">
        {writing && !refreshing && <p className="pb-2">Writing a short summary…</p>}
        {error && <p className="pb-2 text-[#B42318]">{error}</p>}
        {!error && briefing.notice && <p className="pb-2">{briefing.notice}</p>}
        {!briefing.aiAvailable && briefing.items.length > 0 && (
          <p className="pb-2">AI summaries are off, so items show their original details.</p>
        )}
      </div>

      {briefing.items.length === 0 ? (
        <div className="flex items-center gap-2 px-4 pb-4 pt-1 text-sm text-[#344054]">
          <CheckCircle2 className="size-4 text-[#0F766E]" aria-hidden />
          Nothing is overdue, blocked, or due this week for {scopeLabel}.
        </div>
      ) : (
        <ol className="flex flex-col divide-y divide-[#E4E9EF] px-4 pb-2">
          {briefing.items.map((item, index) => (
            <PriorityRow key={item.id} item={item} index={index} />
          ))}
        </ol>
      )}

      {briefing.total > briefing.items.length && (
        <p className="border-t border-[#E4E9EF] px-4 py-2 text-xs text-[#5B6775]">
          Top {briefing.items.length} of {briefing.total}. The full list is below.
        </p>
      )}
    </section>
  )
}

function PriorityRow({ item, index }: { item: BriefingItem; index: number }) {
  const meta = [
    item.projectName,
    item.owner.kind === 'you' ? 'Assigned to you' : item.owner.label,
    item.dueDate ? `Due ${formatShortDate(item.dueDate)}` : null,
  ].filter(Boolean)

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:gap-3">
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold tabular-nums text-[#17212B] ring-1 ring-[#D6DDE5]"
      >
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('rounded-badge border px-1.5 py-0.5 text-[11px] font-medium leading-4', TONE[item.category])}>
            {item.categoryLabel}
          </span>
          <p className="min-w-0 text-sm font-medium text-[#17212B] text-pretty">{item.heading}</p>
        </div>
        <p className="mt-1 text-sm text-[#344054] text-pretty">{item.why}</p>
        {meta.length > 0 && <p className="mt-1 text-xs text-[#5B6775]">{meta.join(' · ')}</p>}
      </div>
      <Link
        href={item.href}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-8 shrink-0 self-start text-[#0F766E] hover:text-[#0B5F59]')}
      >
        {item.actionLabel}
        <ArrowRight className="size-3.5" aria-hidden />
        <span className="sr-only">: {item.heading}</span>
      </Link>
    </li>
  )
}
