'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Layers } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { saveProjectAsTemplateAction } from '@/app/actions/project-templates'

export function SaveAsTemplateButton({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const res = await saveProjectAsTemplateAction(projectId)
          if (!res.ok) {
            toast.error(res.error)
            return
          }
          toast.success('Saved as a draft template', {
            description: 'Review it in Settings, then publish to offer it on new projects.',
            action: { label: 'Open templates', onClick: () => router.push('/settings/templates') },
          })
        })
      }
    >
      <Layers aria-hidden="true" />
      {pending ? 'Saving…' : 'Save as template'}
    </Button>
  )
}
