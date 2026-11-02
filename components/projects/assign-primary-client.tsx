'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserRoundPlus } from 'lucide-react'
import { assignProjectClientAction } from '@/app/actions/project-client'
import type { ClientOption } from '@/lib/client-options'
import { ClientCombobox } from '@/components/projects/client-combobox'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'

/** Assigns or changes a saved project's primary homeowner from the project details page. */
export function AssignPrimaryClient({
  projectId,
  currentClientId,
  clients,
}: {
  projectId: string
  currentClientId: string | null
  clients: ClientOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState(currentClientId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const changing = Boolean(currentClientId)

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setValue(currentClientId ?? '')
      setError(null)
    }
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await assignProjectClientAction(projectId, value || null, currentClientId)
      if (result.error) {
        setError(result.error)
        router.refresh()
        return
      }
      setOpen(false)
      router.refresh()
    })
  }

  const unchanged = value === (currentClientId ?? '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button type="button" variant={changing ? 'ghost' : 'default'} size="sm" />}>
        <UserRoundPlus className="size-4" aria-hidden="true" />
        {changing ? 'Change primary' : 'Assign client'}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{changing ? 'Change primary homeowner' : 'Assign primary homeowner'}</DialogTitle>
          <DialogDescription>
            {changing
              ? 'Choose a different client, or pick “Assign later” to leave this project unassigned. No client records are deleted.'
              : 'Search existing clients by name, email, phone, or client number.'}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <label htmlFor="assign-primary-client" className="text-sm font-medium">
            Primary client
          </label>
          <ClientCombobox
            id="assign-primary-client"
            clients={clients}
            value={value}
            onValueChange={setValue}
            invalid={Boolean(error)}
            describedBy={error ? 'assign-primary-client-error' : undefined}
          />
          {error && (
            <p id="assign-primary-client-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={pending || unchanged}>
            {pending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
