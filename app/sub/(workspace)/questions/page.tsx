import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronRight, MessageCircleQuestion } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { requireSubcontractor } from '@/lib/subcontractor-session'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { isRfiOverdue, isRfiStatus } from '@/lib/rfis'
import { todayIso } from '@/lib/schedule'
import { RfiStatusBadge } from '@/components/rfis/rfi-status-badge'

export const metadata: Metadata = { title: 'Questions' }

export type SubRfiRow = {
  id: string
  project_id: string
  project_name: string
  rfi_number: number
  status: string
  subject: string
  due_date: string | null
  sent_at: string | null
  updated_at: string
}

/** Questions (RFIs) a builder has asked this subcontractor to answer. Open ones come first. */
export default async function SubQuestionsPage() {
  await requireSubcontractor()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('my_assigned_rfis')
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Questions could not be loaded. Please refresh.
      </p>
    )
  }
  const rows = ((data ?? []) as SubRfiRow[]).filter((r) => isRfiStatus(r.status))
  const today = todayIso()

  return (
    <>
      <PageHeader icon={MessageCircleQuestion} title="Questions" count={{ value: rows.length, noun: 'question' }} backHref="/sub" backLabel="Home" />
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
          No builder has sent you a question yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => {
            const status = r.status as Parameters<typeof RfiStatusBadge>[0]['status']
            return (
              <li key={r.id}>
                <Link
                  href={`/sub/questions/${r.id}`}
                  className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 hover:bg-sage/30"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium text-foreground">{`RFI ${r.rfi_number}: ${r.subject}`}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {[r.project_name, r.due_date ? `Due ${formatDate(r.due_date)}` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <RfiStatusBadge status={status} overdue={isRfiOverdue(status, r.due_date, today)} />
                    <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
