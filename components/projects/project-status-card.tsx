'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { ClipboardCheck, History, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ProjectStatusBadge } from '@/components/shared/status-badge'
import { StatusChanger } from '@/components/projects/status-changer'
import { allowedNextStatuses, type ProjectStatus } from '@/lib/domain'

export function ProjectStatusCard({
  projectId,
  projectName,
  status,
  lastUpdatedLabel,
  dateLabel,
  dateValue,
}: {
  projectId: string
  projectName: string
  status: ProjectStatus
  lastUpdatedLabel: string
  dateLabel: string
  dateValue: string
}) {
  const [open, setOpen] = useState(false)
  const openerRef = useRef<HTMLButtonElement>(null)
  const next = allowedNextStatuses(status)
  const canComplete = next.includes('completed')
  const canChange = next.some((s) => s !== 'completed')

  return (
    <section aria-labelledby="status-heading" className="surface flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="status-heading" className="type-section-title text-foreground">
          Project status
        </h2>
        <ProjectStatusBadge status={status} />
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-[#F3F4F6] p-3 text-sm">
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">Last updated</dt>
          <dd className="font-medium tabular-nums text-foreground">{lastUpdatedLabel}</dd>
        </div>
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs text-muted-foreground">{dateLabel}</dt>
          <dd className="font-medium tabular-nums text-foreground">{dateValue}</dd>
        </div>
      </dl>
      {next.length === 0 ? (
        <p className="text-sm text-muted-foreground">This project is completed. Its status is locked.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canChange && (
            <Button ref={openerRef} variant="outline" onClick={() => setOpen(true)} aria-haspopup="dialog">
              <RefreshCw data-icon="inline-start" />
              Change status
            </Button>
          )}
          {canComplete && (
            <Button variant="outline" render={<Link href={`/projects/${projectId}/complete`} />} nativeButton={false}>
              <ClipboardCheck data-icon="inline-start" />
              Review completion
            </Button>
          )}
        </div>
      )}
      <a
        href="#history-heading"
        onClick={() => {
          const details = document.getElementById('status-history-details')
          if (details instanceof HTMLDetailsElement) details.open = true
        }}
        className="inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <History className="size-3.5" aria-hidden="true" />
        View status history
      </a>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent finalFocus={openerRef} className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md">
          <SheetHeader className="gap-1 border-b p-4 pr-12">
            <SheetTitle className="type-section-title text-foreground">Change status</SheetTitle>
            <SheetDescription>{projectName}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Current status
              <ProjectStatusBadge status={status} />
            </div>
            <StatusChanger
              projectId={projectId}
              status={status}
              onSuccess={(message) => {
                setOpen(false)
                toast.success(message)
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </section>
  )
}
