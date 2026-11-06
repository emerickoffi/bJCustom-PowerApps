'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { AlertCircle, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { ActionState } from '@/lib/action-state'
import type { CompanyOption } from '@/lib/contacts-data'
import { createPersonAction } from '@/app/actions/contacts'
import { FormOverlay, OverlayBody, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'
import { PersonForm } from '@/components/contacts/person-form'
import type { AssignableProjectOption } from '@/components/contacts/project-assignments-field'

const OPTIONS_KEY = '/api/contacts/person-form-options'

type PersonFormOptions = { companies: CompanyOption[]; projects: AssignableProjectOption[] }

async function fetchOptions(url: string): Promise<PersonFormOptions> {
  const res = await fetch(url, { cache: 'no-store' })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? 'Could not load companies and projects.')
  return body as PersonFormOptions
}

/**
 * Quick Create "New contact": the standard contact form in a right-side drawer over the current page.
 * The URL and page state are untouched; saving refreshes server data in place instead of redirecting.
 */
export function QuickCreateContactDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const { data, error, isLoading, mutate } = useSWR(open ? OPTIONS_KEY : null, fetchOptions, {
    revalidateOnFocus: false,
  })

  const onSaved = useCallback(
    (result: ActionState) => {
      const id = result.savedId
      const view = id ? { label: 'View contact', onClick: () => router.push(`/contacts/people/${id}`) } : undefined
      if (result.warning) toast.warning(result.warning, { action: view })
      else toast.success(result.success ?? 'Contact added.', { action: view })
      onClose()
      router.refresh()
      void mutate()
    },
    [onClose, router, mutate],
  )

  return (
    <FormOverlay
      open={open}
      onClose={onClose}
      variant="drawer"
      size="lg"
      icon={UserPlus}
      title="New contact"
      description="Add a person to your business directory. Only first and last name are required."
    >
      {open &&
        (data ? (
          <PersonForm
            action={createPersonAction}
            companies={data.companies}
            projects={data.projects}
            onSaved={onSaved}
            submitLabel="Save contact"
          />
        ) : (
          <OptionsPlaceholder
            error={error instanceof Error ? error.message : error ? 'Could not load the form.' : null}
            loading={isLoading}
            onRetry={() => void mutate()}
          />
        ))}
    </FormOverlay>
  )
}

function OptionsPlaceholder({ error, loading, onRetry }: { error: string | null; loading: boolean; onRetry: () => void }) {
  const overlay = useFormOverlay()
  return (
    <>
      <OverlayBody>
        {error ? (
          <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
            <Button type="button" variant="outline" size="sm" className="bg-background" onClick={onRetry} disabled={loading}>
              Try again
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading contact form">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-3 rounded-xl border border-border/70 p-5">
                <div className="h-5 w-40 animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
                <div className="h-10 w-full animate-pulse rounded-md bg-muted" />
              </div>
            ))}
          </div>
        )}
      </OverlayBody>
      <OverlayFooter>
        <Button type="button" variant="outline" size="lg" onClick={overlay?.requestClose}>
          Cancel
        </Button>
        <Button type="button" size="lg" disabled>
          Save contact
        </Button>
      </OverlayFooter>
    </>
  )
}
