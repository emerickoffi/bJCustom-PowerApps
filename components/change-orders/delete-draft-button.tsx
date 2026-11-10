'use client'

import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

/** Submits its parent form only after the builder confirms; deleting a draft cannot be undone. */
export function DeleteDraftButton() {
  const { pending } = useFormStatus()
  return (
    <Button
      type="submit"
      variant="ghost"
      className="text-destructive"
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm('Delete this draft change order and its cost lines? This cannot be undone.')) e.preventDefault()
      }}
    >
      {pending ? 'Deleting...' : 'Delete draft'}
    </Button>
  )
}
