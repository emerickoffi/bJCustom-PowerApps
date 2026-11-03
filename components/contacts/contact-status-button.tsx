'use client'

import { useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmActionButton } from '@/components/shared/confirm-action-button'
import { ActiveStatusBadge, SemanticBadge } from '@/components/shared/semantic-badge'
import { setCompanyStatusAction, setPersonStatusAction } from '@/app/actions/contacts'

/** Deactivation asks for confirmation; activation is immediate. History is never removed either way. */
export function ContactStatusButton({
  kind,
  id,
  name,
  status,
  activeProjectCount = 0,
}: {
  kind: 'person' | 'company'
  id: string
  name: string
  status: 'active' | 'inactive'
  activeProjectCount?: number
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const endProjects = useRef(false)
  const run = (next: 'active' | 'inactive') =>
    kind === 'person' ? setPersonStatusAction(id, next, { endProjects: endProjects.current }) : setCompanyStatusAction(id, next)

  if (status === 'active') {
    const askAboutProjects = kind === 'person' && activeProjectCount > 0
    const warning = askAboutProjects ? (
      <span className="flex flex-col gap-2">
        <span>
          {`${name} is on ${activeProjectCount} active ${activeProjectCount === 1 ? 'project' : 'projects'}. Decide whether those responsibilities continue.`}
        </span>
        <label className="flex items-start gap-2 font-medium">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-primary"
            onChange={(e) => {
              endProjects.current = e.target.checked
            }}
          />
          End their active project associations (kept in project history)
        </label>
      </span>
    ) : (
      'Existing relationships, project associations, and history are kept. You can activate again at any time.'
    )
    return (
      <ConfirmActionButton
        variant="outline"
        size="lg"
        label="Deactivate"
        title={`Deactivate ${name}?`}
        description={
          kind === 'person'
            ? 'They will stay in the directory as inactive and cannot be added to new companies or projects.'
            : 'It will stay in the directory as inactive and cannot receive new contact relationships.'
        }
        warning={warning}
        confirmLabel="Deactivate"
        pendingLabel="Deactivating..."
        action={async () => {
          const result = await run('inactive')
          if (!result.error) router.refresh()
          return result
        }}
      />
    )
  }

  return (
    <Button
      variant="outline"
      size="lg"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await run('active')
          if (result.error) toast.error(result.error)
          else {
            toast.success(result.success ?? 'Activated.')
            router.refresh()
          }
        })
      }
    >
      {pending ? 'Activating...' : 'Activate'}
    </Button>
  )
}

export function ContactStatusBadge({ status }: { status: 'active' | 'inactive' }) {
  return status === 'active' ? <ActiveStatusBadge /> : <SemanticBadge tone="neutral">Inactive</SemanticBadge>
}
