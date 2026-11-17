'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { openBillingPortalAction } from '@/app/actions/billing'
import { Button } from '@/components/ui/button'

export function ManageBillingButton() {
  const [pending, startTransition] = useTransition()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await openBillingPortalAction()
          if (result?.error) toast.error(result.error)
        })
      }
    >
      {pending ? 'Opening…' : 'Card, invoices & cancellation'}
    </Button>
  )
}
