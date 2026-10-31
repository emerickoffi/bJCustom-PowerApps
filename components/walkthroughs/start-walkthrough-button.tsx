'use client'

import { useState, useTransition } from 'react'
import { AlertCircle, Camera, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { startStaffWalkthroughAction } from '@/app/actions/walkthroughs'

type Props = {
  projectId: string
  walkthroughId: string
  label: string
  takeOver?: boolean
  variant?: 'default' | 'outline'
}

export function StartWalkthroughButton({ projectId, walkthroughId, label, takeOver = false, variant = 'default' }: Props) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="lg"
        variant={variant}
        className="h-11"
        disabled={pending}
        onClick={() => {
          setError(null)
          start(async () => {
            const result = await startStaffWalkthroughAction(projectId, walkthroughId, takeOver)
            if (result?.error) setError(result.error)
          })
        }}
      >
        {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Camera data-icon="inline-start" />}
        {label}
      </Button>
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}
