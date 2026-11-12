'use client'

import { useActionState } from 'react'
import { saveEmailPreferencesAction } from '@/app/actions/email-preferences'
import { initialActionState } from '@/lib/action-state'
import { OPTIONAL_EMAIL_CATEGORIES, categoryEnabled } from '@/lib/email/categories'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'

export function EmailPreferencesForm({
  saved,
  deliveryActive,
}: {
  saved: Record<string, boolean>
  deliveryActive: boolean
}) {
  const [state, formAction] = useActionState(saveEmailPreferencesAction, initialActionState)
  return (
    <form
      id="email-preferences"
      action={formAction}
      className="flex max-w-xl flex-col gap-5 rounded-xl border bg-card p-6"
      aria-labelledby="email-preferences-heading"
    >
      <div className="flex flex-col gap-1">
        <h2 id="email-preferences-heading" className="text-base font-semibold text-foreground">
          Email notifications
        </h2>
        <p className="text-sm text-muted-foreground text-pretty">
          Choose which updates also arrive by email. Everything still appears in your Trefort notifications.
        </p>
        {!deliveryActive && (
          <p className="text-sm text-muted-foreground">Email delivery is not turned on for this workspace yet.</p>
        )}
      </div>

      <fieldset className="flex flex-col divide-y rounded-lg border">
        <legend className="sr-only">Optional email categories</legend>
        {OPTIONAL_EMAIL_CATEGORIES.map((c) => (
          <label key={c.key} className="flex cursor-pointer items-start gap-3 p-4 hover:bg-muted/40">
            <input
              type="checkbox"
              name={c.key}
              defaultChecked={categoryEnabled(c.key, saved)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{c.label}</span>
              <span className="text-sm text-muted-foreground">{c.description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <p className="text-sm text-muted-foreground text-pretty">
        Invoices, signature requests, and account emails such as invitations are always sent.
      </p>

      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton>Save email preferences</SubmitButton>
      </div>
    </form>
  )
}
