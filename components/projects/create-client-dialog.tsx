'use client'

import { useActionState, useEffect, useRef } from 'react'
import { AlertTriangle as AlertTriangleIcon, UserRoundPlus as UserRoundPlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ClientFormFields } from '@/components/clients/client-form'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { createClientInlineAction, type InlineClientState } from '@/app/actions/clients'
import type { ClientMailingAddress } from '@/components/projects/project-form'
import { cn } from '@/lib/utils'

export type CreatedClient = { id: string; label: string; address: ClientMailingAddress }

const REASON_LABELS: Record<string, string> = {
  name: 'same name',
  email: 'same email',
  phone: 'same phone',
}

export function CreateClientDialog({
  open,
  onOpenChange,
  onCreated,
  onSelectExisting,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (client: CreatedClient) => void
  onSelectExisting: (clientId: string, label: string) => void
  finalFocus: React.RefObject<HTMLElement | null>
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        finalFocus={finalFocus}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl',
          'max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none',
        )}
      >
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <UserRoundPlusIcon className="size-4 text-primary" aria-hidden="true" />
            Create new client
          </DialogTitle>
          <DialogDescription>
            The client is saved to your directory and selected on this project. Your project details stay as entered.
          </DialogDescription>
        </DialogHeader>
        {/* Remounting on open resets the form so a canceled draft never leaks into the next one. */}
        {open && <InlineClientForm onCreated={onCreated} onSelectExisting={onSelectExisting} onCancel={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function InlineClientForm({
  onCreated,
  onSelectExisting,
  onCancel,
}: {
  onCreated: (client: CreatedClient) => void
  onSelectExisting: (clientId: string, label: string) => void
  onCancel: () => void
}) {
  const [state, formAction] = useActionState<InlineClientState, FormData>(createClientInlineAction, {})
  const handled = useRef<string | null>(null)

  useEffect(() => {
    if (state.client && handled.current !== state.client.id) {
      handled.current = state.client.id
      onCreated(state.client)
    }
  }, [state.client, onCreated])

  const values = state.values ?? {}
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'
  const fe = state.fieldErrors ?? {}

  return (
    <form
      key={formKey}
      action={formAction}
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => e.stopPropagation()}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex flex-col gap-6">
          {state.matches && state.matches.length > 0 && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="flex items-center gap-2 text-sm font-medium">
                <AlertTriangleIcon className="size-4 shrink-0" aria-hidden="true" />
                Possible existing client
              </p>
              <p className="mt-1 text-sm">Select an existing client instead, or confirm this is a different person.</p>
              <ul className="mt-3 flex flex-col gap-2">
                {state.matches.map((m) => (
                  <li key={m.id} className="flex flex-col gap-2 rounded-md bg-background/80 px-3 py-2 text-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 text-sm">
                      <span className="font-medium">{m.label}</span>
                      <span className="text-muted-foreground">
                        {' · '}
                        {m.reasons.map((r) => REASON_LABELS[r] ?? r).join(', ')}
                        {!m.selectable && ' · archived'}
                      </span>
                    </span>
                    {m.selectable ? (
                      <Button type="button" size="sm" variant="outline" onClick={() => onSelectExisting(m.id, m.label)}>
                        Select this client
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Restore from the client directory to use</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!state.matches?.length && <FormMessage state={state} />}
          <div className="flex flex-col gap-5">
            <ClientFormFields defaults={values} fieldErrors={fe} flat idPrefix="new_client_" />
          </div>
        </div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-border bg-muted/40 px-5 py-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {state.matches && state.matches.length > 0 ? (
          <SubmitButton pendingLabel="Creating client…" name="confirm_new" value="true">
            Create as new client & select
          </SubmitButton>
        ) : (
          <SubmitButton pendingLabel="Creating client…">Create client & select</SubmitButton>
        )}
      </div>
    </form>
  )
}
