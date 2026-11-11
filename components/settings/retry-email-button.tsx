'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { retryFailedEmailAction } from '@/app/actions/email-preferences'

export function RetryEmailButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {message && (
        <span className="text-xs text-muted-foreground" role="status">
          {message}
        </span>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await retryFailedEmailAction(id)
            setMessage(result.error ?? result.success ?? null)
          })
        }
      >
        {pending ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  )
}
