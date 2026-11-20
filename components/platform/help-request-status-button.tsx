'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { setHelpRequestStatusAction } from '@/app/actions/help-requests'
import { Button } from '@/components/ui/button'

export function HelpRequestStatusButton({ ticketId, status }: { ticketId: string; status: 'open' | 'closed' }) {
  const [pending, startTransition] = useTransition()
  const next = status === 'open' ? 'closed' : 'open'
  return (
    <Button
      variant={status === 'open' ? 'action' : 'outline'}
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await setHelpRequestStatusAction(ticketId, next)
          if (result.error) toast.error(result.error)
          else toast.success(result.success ?? 'Saved.')
        })
      }
    >
      {status === 'open' ? <CheckCircle2 data-icon="inline-start" aria-hidden="true" /> : <RotateCcw data-icon="inline-start" aria-hidden="true" />}
      {pending ? 'Saving...' : status === 'open' ? 'Mark answered' : 'Reopen'}
    </Button>
  )
}
