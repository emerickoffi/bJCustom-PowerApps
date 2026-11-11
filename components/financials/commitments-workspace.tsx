'use client'

import { useCallback, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardList, Plus } from 'lucide-react'
import { approveCommitmentAction } from '@/app/actions/vendor-bills'
import { formatMoney } from '@/lib/financials'
import type { CommitmentRecord } from '@/lib/vendor-bills-data'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { EmptyState } from '@/components/shared/page-header'
import { Sheet, SheetContent } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { CommitmentForm } from './vendor-cost-forms'

const STATUS: Record<string, { label: string; tone: SemanticTone }> = {
  draft: { label: 'Draft', tone: 'pending' },
  approved: { label: 'Approved', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  voided: { label: 'Voided', tone: 'neutral' },
}

export function CommitmentsWorkspace({
  projectId,
  projectName,
  commitments,
  vendors,
}: {
  projectId: string
  projectName: string
  commitments: CommitmentRecord[]
  vendors: string[]
}) {
  const router = useRouter()
  const [editing, setEditing] = useState<CommitmentRecord | 'new' | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const close = useCallback(() => setEditing(null), [])
  const saved = useCallback(() => {
    setEditing(null)
    router.refresh()
  }, [router])

  function approve(id: string) {
    if (pendingId) return
    setPendingId(id)
    startTransition(async () => {
      const result = await approveCommitmentAction(projectId, id)
      if (result.ok) toast.success('Commitment approved')
      else toast.error(result.error)
      setPendingId(null)
      router.refresh()
    })
  }

  return (
    <section aria-labelledby="commitments-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="commitments-heading" className="type-section-title text-foreground">
            Commitments
          </h2>
          <p className="text-sm text-muted-foreground">Awarded quotes appear here automatically. Approved commitments count as committed cost.</p>
        </div>
        <Button variant="outline" className="md:h-10" onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" />
          Add commitment
        </Button>
      </div>

      {commitments.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No commitments yet" description="Award a quote, or add a purchase order or supplier agreement made outside the quote process." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {commitments.map((c) => {
            const status = STATUS[c.status] ?? { label: c.status, tone: 'neutral' as const }
            const editable = c.status === 'draft' && c.source === 'manual'
            return (
              <li key={c.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate font-medium text-foreground">{c.vendorName}</span>
                  <span className="truncate text-sm text-muted-foreground">
                    {[c.description, c.category, c.source === 'quote' ? 'From awarded quote' : 'Manual'].join(' · ')}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end sm:gap-4">
                  <SemanticBadge tone={status.tone}>{status.label}</SemanticBadge>
                  <dl className="flex gap-4 text-right text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Committed</dt>
                      <dd className="font-semibold tabular-nums text-foreground">{formatMoney(c.amountCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Billed</dt>
                      <dd className="tabular-nums text-foreground">{formatMoney(c.billedCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Remaining</dt>
                      <dd className="tabular-nums text-foreground">{formatMoney(c.remainingCents)}</dd>
                    </div>
                  </dl>
                  {editable && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(c)} aria-label={`Edit commitment for ${c.vendorName}`}>
                        Edit
                      </Button>
                      <Button size="sm" onClick={() => approve(c.id)} disabled={pendingId !== null}>
                        {pendingId === c.id ? 'Approving...' : 'Approve'}
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Sheet open={editing !== null} onOpenChange={(open) => (open ? null : close())}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-xl">
          {editing !== null && (
            <CommitmentForm
              key={editing === 'new' ? 'new' : editing.id}
              projectId={projectId}
              projectName={projectName}
              commitment={editing === 'new' ? null : editing}
              vendors={vendors}
              onCancel={close}
              onSaved={saved}
            />
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}
