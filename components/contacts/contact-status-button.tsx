'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ConfirmActionButton } from '@/components/shared/confirm-action-button'
import { setCompanyStatusAction, setPersonStatusAction } from '@/app/actions/contacts'

/** Deactivation asks for confirmation; activation is immediate. History is never removed either way. */
export function ContactStatusButton({
  kind,
  id,
  name,
  status,
}: {
  kind: 'person' | 'company'
  id: string
  name: string
  status: 'active' | 'inactive'
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const run = (next: 'active' | 'inactive') => (kind === 'person' ? setPersonStatusAction(id, next) : setCompanyStatusAction(id, next))

  if (status === 'active') {
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
        warning="Existing relationships, project associations, and history are kept. You can activate again at any time."
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
  return status === 'active' ? (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#C2E4D0] bg-[#E2F3E9] px-2 py-0.5 text-xs font-medium text-[#187542]">
      <span className="size-1.5 rounded-full bg-[#187542]" aria-hidden="true" />
      Active
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#D8E0E8] bg-[#E9EDF2] px-2 py-0.5 text-xs font-medium text-[#526174]">
      <span className="size-1.5 rounded-full bg-[#526174]/60" aria-hidden="true" />
      Inactive
    </span>
  )
}
