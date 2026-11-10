'use client'

import { useCallback } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useSWRConfig } from 'swr'
import { UserRoundPen } from 'lucide-react'
import { toast } from 'sonner'
import { updateClientAction } from '@/app/actions/clients'
import { ClientForm, type ClientFormValues } from '@/components/clients/client-form'
import { FormOverlay } from '@/components/shared/form-overlay'
import type { ActionState } from '@/lib/action-state'
import { CLIENT_EDIT_PARAM, clientPreviewApiPath } from '@/lib/record-preview'

export type EditableClient = ClientFormValues & { id: string; client_number: number }

/**
 * The existing client form in a drawer over the Clients list, opened by `?editClient=`. Filters, sorting, paging,
 * and the selected preview stay in the URL, so closing or saving returns to the same list.
 */
export function ClientEditOverlay({ client }: { client: EditableClient | null }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { mutate } = useSWRConfig()

  const close = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(CLIENT_EDIT_PARAM)
    const qs = params.toString()
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }, [router, pathname, searchParams])

  const onSaved = useCallback(
    (result: ActionState) => {
      toast.success(result.success ?? 'Changes saved.')
      if (result.savedId) void mutate(clientPreviewApiPath(result.savedId))
      close()
    },
    [mutate, close],
  )

  return (
    <FormOverlay
      open={Boolean(client)}
      onClose={close}
      variant="drawer"
      size="lg"
      icon={UserRoundPen}
      title={client ? `Edit ${client.first_name} ${client.last_name}` : 'Edit client'}
      description={client ? `Client #${client.client_number}` : undefined}
    >
      {client && (
        <ClientForm
          key={client.id}
          action={updateClientAction.bind(null, client.id)}
          defaults={client}
          submitLabel="Save changes"
          pendingLabel="Saving changes…"
          cancelHref="/clients"
          onSaved={onSaved}
        />
      )}
    </FormOverlay>
  )
}
