'use client'

import { useCallback, useEffect, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import useSWR from 'swr'
import { ArrowDown, MessageCircleQuestion, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAskQuestion } from '@/components/app/quick-actions'
import { DirectoryPagination } from '@/components/shared/directory-pagination'
import { ListFilters } from '@/components/shared/list-filters'
import { EmptyState, PageHeader, Surface } from '@/components/shared/page-header'
import { PanelError, PanelLoading, RecordPanel, isPlainClick } from '@/components/shared/record-panel'
import { fetchRfiJson, rfiDetailKey } from '@/components/rfis/ask-question-drawer'
import { RfiDetailView } from '@/components/rfis/rfi-detail'
import { RfiStatusBadge } from '@/components/rfis/rfi-status-badge'
import { RfiPriorityBadge } from '@/components/rfis/rfi-priority-badge'
import {
  RFI_PARAM,
  RFI_PRIORITIES,
  RFI_PRIORITY_LABELS,
  RFI_STATUSES,
  RFI_STATUS_LABELS,
  isRfiOverdue,
  responderLabel,
  rfiPriority,
  rfiRef,
  rfisPath,
  type RfiDetail,
  type RfiListRow,
  type RfiScope,
  type RfiSort,
} from '@/lib/rfis'

const WIDE_QUERY = '(min-width: 1280px)'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function subscribeWide(onChange: () => void) {
  const media = window.matchMedia(WIDE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** Null until the viewport is known (server render and hydration), where CSS alone decides whether the column shows. */
function useIsWide(): boolean | null {
  return useSyncExternalStore<boolean | null>(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => null,
  )
}

/** Replaces the current history entry, so opening questions never adds Back steps and a refresh restores the selection. */
function writeParam(name: string, value: string | null) {
  const url = new URL(window.location.href)
  if (value) url.searchParams.set(name, value)
  else url.searchParams.delete(name)
  window.history.replaceState(null, '', url)
}

function findTrigger(rfiId: string) {
  return document.querySelector<HTMLElement>(`[data-rfi-trigger="${rfiId}"]`)
}

export type RfiWorkspaceProps = {
  projectId: string
  projectName: string
  rows: RfiListRow[]
  total: number
  page: number
  pageCount: number
  filters: { q: string; status: string; priority: string; scope: RfiScope; sort: RfiSort }
  /** False when the list itself could not be read; an empty list is then not proof that there are no questions. */
  loaded: boolean
  canAsk: boolean
  today: string
}

/**
 * The project's questions with details on demand. With nothing selected the list has the full width. A selection
 * opens one details view: a column beside the list on wide screens, a drawer below that. The selection lives in
 * the URL, so notification links and refreshes open the same question.
 */
export function RfiWorkspace({ projectId, projectName, rows, total, page, pageCount, filters, loaded, canAsk, today }: RfiWorkspaceProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const ask = useAskQuestion()
  const isWide = useIsWide()
  const urlId = searchParams.get(RFI_PARAM)
  const selectedId = urlId && UUID.test(urlId) ? urlId : null

  const { data, error, isLoading, mutate } = useSWR<RfiDetail>(selectedId ? rfiDetailKey(selectedId) : null, fetchRfiJson, {
    shouldRetryOnError: false,
  })
  // A question from another project never opens inside this one.
  const detail = data && data.rfi.id === selectedId && data.rfi.project_id === projectId ? data : null
  const foreign = Boolean(data && data.rfi.id === selectedId && data.rfi.project_id !== projectId)

  const select = useCallback((rfiId: string | null) => writeParam(RFI_PARAM, rfiId), [])
  const closeInline = useCallback(() => {
    const trigger = selectedId ? findTrigger(selectedId) : null
    select(null)
    trigger?.focus({ preventScroll: true })
  }, [select, selectedId])

  const reload = useCallback(() => {
    void mutate()
    router.refresh()
  }, [mutate, router])

  // Quick Create's full-page fallback link lands here with ?new=1.
  const wantsNew = searchParams.get('new') === '1'
  useEffect(() => {
    if (!wantsNew) return
    writeParam('new', null)
    if (canAsk) ask?.({ projectId, projectName })
  }, [wantsNew, canAsk, ask, projectId, projectName])

  const listRow = selectedId ? (rows.find((r) => r.id === selectedId) ?? null) : null
  const head = detail?.rfi ?? listRow
  const title = head ? `${rfiRef(head.rfi_number)}: ${head.subject}` : 'Question'
  const filtered = Boolean(filters.q || filters.status || filters.priority || filters.scope === 'mine')

  const sortHref = (target: RfiSort) => {
    const params = new URLSearchParams(searchParams.toString())
    if (target === 'priority') params.set('sort', 'priority')
    else params.delete('sort')
    params.delete('page')
    const query = params.toString()
    return query ? `${rfisPath(projectId)}?${query}` : rfisPath(projectId)
  }

  const pageHref = (target: number) => {
    const params = new URLSearchParams(searchParams.toString())
    if (target > 1) params.set('page', String(target))
    else params.delete('page')
    const query = params.toString()
    return query ? `${rfisPath(projectId)}?${query}` : rfisPath(projectId)
  }

  const openRow = (e: React.MouseEvent, rfiId: string) => {
    if (!isPlainClick(e)) return
    e.preventDefault()
    select(rfiId)
  }

  const body = !selectedId ? null : detail ? (
    <RfiDetailView
      key={detail.rfi.id}
      detail={detail}
      onChanged={reload}
      onEditDraft={ask ? () => ask({ projectId, projectName, draftId: detail.rfi.id }) : undefined}
    />
  ) : isLoading ? (
    <PanelLoading label="Loading the question" />
  ) : (
    <PanelError
      message={
        foreign
          ? 'This question belongs to another project.'
          : error instanceof Error
            ? `${error.message} It may have been reassigned, or you may not have access to it.`
            : 'This question is not available.'
      }
      onRetry={foreign ? undefined : () => void mutate()}
    />
  )

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Questions (RFIs)"
        icon={MessageCircleQuestion}
        count={loaded && !filtered ? { value: total, noun: 'question' } : undefined}
        actions={
          canAsk && ask ? (
            <Button size="lg" onClick={() => ask({ projectId, projectName })}>
              <Plus data-icon="inline-start" />
              Ask a question
            </Button>
          ) : undefined
        }
      />

      <div className="flex min-w-0 items-start gap-5">
        <div className="@container flex min-w-0 flex-1 flex-col gap-4">
          <ListFilters
            searchPlaceholder="Search subject or RFI number"
            defaultQuery={filters.q}
            defaultStatus={filters.status}
            statusOptions={RFI_STATUSES.map((s) => ({ value: s, label: RFI_STATUS_LABELS[s] }))}
            selects={[
              {
                name: 'priority',
                label: 'Priority',
                allLabel: 'All priorities',
                defaultValue: filters.priority,
                options: RFI_PRIORITIES.map((p) => ({ value: p, label: RFI_PRIORITY_LABELS[p] })),
              },
              {
                name: 'scope',
                label: 'Assignment',
                allLabel: 'All I can access',
                defaultValue: filters.scope === 'mine' ? 'mine' : '',
                options: [{ value: 'mine', label: 'Assigned to me' }],
              },
            ]}
            clearHref={filtered ? rfisPath(projectId) : undefined}
            preserve={{ sort: filters.sort === 'priority' ? 'priority' : null }}
            carryParams={[RFI_PARAM]}
            autoApply
          />

          {!loaded ? (
            <Surface role="alert">
              <p className="text-sm text-destructive">Questions could not be loaded. This is a loading problem, not an empty list.</p>
              <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => router.refresh()}>
                Try again
              </Button>
            </Surface>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={MessageCircleQuestion}
              title={filtered ? 'No questions match these filters' : 'No questions yet'}
              description={
                filtered
                  ? 'Try a different search, status, priority, or assignment.'
                  : 'Ask the person who knows, get one official answer, then review and close it.'
              }
              action={
                !filtered && canAsk && ask ? (
                  <Button size="lg" onClick={() => ask({ projectId, projectName })}>
                    <Plus data-icon="inline-start" />
                    Ask a question
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <p className="sr-only" aria-live="polite">
                {`${total} question${total === 1 ? '' : 's'}`}
              </p>
              <SortControl sort={filters.sort} hrefFor={sortHref} />
              <QuestionTable rows={rows} projectId={projectId} selectedId={selectedId} today={today} onOpen={openRow} sort={filters.sort} hrefFor={sortHref} />
              <QuestionCards rows={rows} projectId={projectId} selectedId={selectedId} today={today} onOpen={openRow} />
              <DirectoryPagination page={page} pageCount={pageCount} hrefFor={pageHref} label="Questions pages" />
            </>
          )}
        </div>

        {selectedId && isWide !== false && (
          <section
            aria-label="Question details"
            onKeyDown={(event) => {
              if (event.key !== 'Escape' || event.defaultPrevented) return
              event.stopPropagation()
              closeInline()
            }}
            className={cn(
              'sticky top-[calc(var(--app-header-h,4rem)+4rem)] max-h-[calc(100dvh-var(--app-header-h,4rem)-9.5rem)] w-[28rem] shrink-0 flex-col overflow-hidden rounded-xl border border-[#D6DDE5] bg-card shadow-xs animate-in fade-in-0 slide-in-from-right-2 duration-200 motion-reduce:animate-none',
              isWide === null ? 'hidden xl:flex' : 'flex',
            )}
          >
            <header className="flex shrink-0 items-start gap-2 border-b border-[#D6DDE5] px-4 py-3.5">
              <h2 className="min-w-0 flex-1 text-pretty break-words type-section-title text-foreground">{title}</h2>
              <Button type="button" variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0" aria-label="Close question details" onClick={closeInline}>
                <X aria-hidden="true" />
              </Button>
            </header>
            <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-4 py-4">{body}</div>
          </section>
        )}
      </div>

      {isWide === false && (
        <RecordPanel open={Boolean(selectedId)} onClose={() => select(null)} icon={MessageCircleQuestion} title={title} description={projectName} size="lg">
          {body}
        </RecordPanel>
      )}
    </div>
  )
}

type ListProps = {
  rows: RfiListRow[]
  projectId: string
  selectedId: string | null
  today: string
  onOpen: (e: React.MouseEvent, rfiId: string) => void
}

const LINK_CLASS =
  'rounded-sm font-medium text-link hover:text-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link'

function DueDate({ row, today }: { row: RfiListRow; today: string }) {
  if (!row.due_date) return <span className="text-muted-foreground">—</span>
  const overdue = isRfiOverdue(row.status, row.due_date, today)
  return (
    <span className={overdue ? 'font-medium text-destructive' : undefined}>
      {formatDate(row.due_date)}
      {overdue && <span className="sr-only"> (overdue)</span>}
    </span>
  )
}

/** Only High and Urgent get a colored badge, so routine rows stay quiet; the label is always shown. */
function PriorityCell({ value }: { value: unknown }) {
  const priority = rfiPriority(value)
  if (priority === 'high' || priority === 'urgent') return <RfiPriorityBadge priority={priority} />
  return <span className="text-muted-foreground">{RFI_PRIORITY_LABELS[priority]}</span>
}

type SortProps = { sort: RfiSort; hrefFor: (target: RfiSort) => string }

/** Small-screen sort switch; the table header carries the same control on wide layouts. */
function SortControl({ sort, hrefFor }: SortProps) {
  return (
    <nav aria-label="Sort questions" className="flex items-center gap-2 text-sm @3xl:hidden">
      <span className="text-muted-foreground">Sort by</span>
      {(['number', 'priority'] as const).map((key) => (
        <Link
          key={key}
          href={hrefFor(key)}
          aria-current={sort === key ? 'true' : undefined}
          className={cn(
            'flex min-h-11 items-center rounded-md px-2.5 sm:min-h-8',
            sort === key ? 'bg-link-soft font-medium text-foreground' : 'text-link hover:text-link-hover hover:underline',
          )}
        >
          {key === 'number' ? 'Newest' : 'Priority'}
        </Link>
      ))}
    </nav>
  )
}

function QuestionTable({ rows, projectId, selectedId, today, onOpen, sort, hrefFor }: ListProps & SortProps) {
  return (
    <div className="hidden overflow-x-auto overscroll-x-contain rounded-lg border border-[#D6DDE5] @3xl:block">
      <table className="w-full table-fixed text-sm">
        <caption className="sr-only">Questions (RFIs)</caption>
        <colgroup>
          <col className="w-[7rem]" />
          <col />
          <col className="w-[22%]" />
          <col className="w-[8.5rem]" />
          <col className="w-[6.5rem]" />
          <col className="w-[9.5rem]" />
        </colgroup>
        <thead>
          <tr className="border-b border-[#D6DDE5] bg-table-head text-left text-xs text-[#526173]">
            <th scope="col" className="px-4 py-2.5 font-medium" aria-sort={sort === 'number' ? 'descending' : undefined}>
              <Link href={hrefFor('number')} className={cn('rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-link', sort === 'number' && 'text-foreground')}>
                RFI number
              </Link>
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">Subject</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Assigned responder</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Due date</th>
            <th scope="col" className="px-3 py-2.5 font-medium" aria-sort={sort === 'priority' ? 'descending' : undefined}>
              <Link
                href={hrefFor(sort === 'priority' ? 'number' : 'priority')}
                className={cn('inline-flex items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-2 focus-visible:outline-link', sort === 'priority' && 'text-foreground')}
              >
                Priority
                {sort === 'priority' && <ArrowDown className="size-3" aria-hidden="true" />}
                <span className="sr-only">{sort === 'priority' ? ', sorted most urgent first. Select to sort by RFI number.' : ', select to sort most urgent first.'}</span>
              </Link>
            </th>
            <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId
            return (
              <tr
                key={row.id}
                aria-selected={selected || undefined}
                className={cn(
                  'border-b border-[#D6DDE5] transition-colors last:border-0 hover:bg-link-soft/40 has-[:focus-visible]:bg-link-soft/40',
                  selected ? 'bg-link-soft/60' : 'bg-white',
                )}
              >
                <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">{rfiRef(row.rfi_number)}</td>
                <td className="px-3 py-2.5">
                  <Link
                    href={rfisPath(projectId, row.id)}
                    data-rfi-trigger={row.id}
                    aria-current={selected ? 'true' : undefined}
                    onClick={(e) => onOpen(e, row.id)}
                    className={cn(LINK_CLASS, 'line-clamp-2 break-words')}
                  >
                    {row.subject}
                  </Link>
                </td>
                <td className="px-3 py-2.5">
                  <span className="line-clamp-2 break-words" title={responderLabel(row)}>
                    {responderLabel(row)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
                  <DueDate row={row} today={today} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <PriorityCell value={row.priority} />
                </td>
                <td className="px-3 py-2.5">
                  <RfiStatusBadge status={row.status} overdue={isRfiOverdue(row.status, row.due_date, today)} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function QuestionCards({ rows, projectId, selectedId, today, onOpen }: ListProps) {
  return (
    <ul className="flex flex-col divide-y divide-[#D6DDE5] rounded-lg border border-[#D6DDE5] @3xl:hidden">
      {rows.map((row) => {
        const selected = row.id === selectedId
        return (
          <li key={row.id} className={cn('flex flex-col gap-2 p-3.5', selected ? 'bg-link-soft/60' : 'bg-white')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs tabular-nums text-muted-foreground">{rfiRef(row.rfi_number)}</span>
                <Link
                  href={rfisPath(projectId, row.id)}
                  data-rfi-trigger={row.id}
                  aria-current={selected ? 'true' : undefined}
                  onClick={(e) => onOpen(e, row.id)}
                  className={cn(LINK_CLASS, 'flex min-h-11 items-center break-words sm:min-h-0')}
                >
                  {row.subject}
                </Link>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <RfiStatusBadge status={row.status} overdue={isRfiOverdue(row.status, row.due_date, today)} />
                {(rfiPriority(row.priority) === 'high' || rfiPriority(row.priority) === 'urgent') && (
                  <RfiPriorityBadge priority={rfiPriority(row.priority)} />
                )}
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted-foreground">Assigned responder</dt>
                <dd className="break-words text-foreground">{responderLabel(row)}</dd>
              </div>
              <div className="flex min-w-0 flex-col">
                <dt className="text-xs text-muted-foreground">Due date</dt>
                <dd className="tabular-nums">
                  <DueDate row={row} today={today} />
                </dd>
              </div>
            </dl>
          </li>
        )
      })}
    </ul>
  )
}
