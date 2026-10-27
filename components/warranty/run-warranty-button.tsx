'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { archiveWarrantyAction, runWarrantyProcessingAction } from '@/app/actions/warranty'

export function RunWarrantyButton() {
  const [pending, start] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await runWarrantyProcessingAction()
          if (r.error) toast.error(r.error)
          else toast.success(r.success)
        })
      }
    >
      {pending ? 'Checking...' : 'Check milestones now'}
    </Button>
  )
}

export function ArchiveWarrantyButton({
  warrantyId,
  projectId,
  reopen,
}: {
  warrantyId: string
  projectId: string
  reopen: boolean
}) {
  const [pending, start] = useTransition()
  return (
    <Button
      variant={reopen ? 'outline' : 'default'}
      disabled={pending}
      onClick={() => {
        if (!reopen && !window.confirm('Archive this project? It can be reopened later.')) return
        start(async () => {
          const r = await archiveWarrantyAction(warrantyId, projectId, reopen)
          if (r.error) toast.error(r.error)
          else toast.success(r.success)
        })
      }}
    >
      {reopen ? 'Reopen warranty' : 'Archive project'}
    </Button>
  )
}
