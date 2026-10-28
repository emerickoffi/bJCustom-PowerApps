'use client'

import { useState } from 'react'
import { Plus as PlusIcon, Users as UsersIcon, X as XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { COMMUNICATION_LABELS, CONTACT_RELATIONSHIP_LABELS } from '@/lib/domain'
import { SelectField, TextField } from '@/components/shared/form-field'
import { ADDITIONAL_CONTACT_PREFIX, MAX_ADDITIONAL_CONTACTS } from '@/lib/additional-contacts'

const RELATIONSHIP_OPTIONS = Object.entries(CONTACT_RELATIONSHIP_LABELS)
  .filter(([value]) => value !== 'primary_owner')
  .map(([value, label]) => ({ value, label }))

const COMMUNICATION_OPTIONS = Object.entries(COMMUNICATION_LABELS).map(([value, label]) => ({ value, label }))

function idsFromValues(values: Record<string, string> | undefined): number[] {
  if (!values) return []
  const ids = new Set<number>()
  for (const key of Object.keys(values)) {
    const match = /^ac_(\d+)_/.exec(key)
    if (match) ids.add(Number(match[1]))
  }
  return [...ids].sort((a, b) => a - b)
}

export function AdditionalContactsSection({
  values,
  fieldErrors,
}: {
  values?: Record<string, string>
  fieldErrors: Record<string, string>
}) {
  const [ids, setIds] = useState<number[]>(() => idsFromValues(values))
  const [nextId, setNextId] = useState(() => Math.max(0, ...idsFromValues(values)) + 1)

  const add = () => {
    if (ids.length >= MAX_ADDITIONAL_CONTACTS) return
    setIds((prev) => [...prev, nextId])
    setNextId((n) => n + 1)
  }
  const remove = (id: number) => setIds((prev) => prev.filter((x) => x !== id))

  const v = (id: number, field: string) => values?.[`${ADDITIONAL_CONTACT_PREFIX}${id}_${field}`]
  const err = (id: number, field: string) => fieldErrors[`${ADDITIONAL_CONTACT_PREFIX}${id}_${field}`]

  return (
    <section className="rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-6" aria-labelledby="additional-contact-heading">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
            <UsersIcon className="size-4" aria-hidden="true" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
            <h2 id="additional-contact-heading" className="flex items-center gap-2 text-sm font-semibold text-foreground">
              Additional contact
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Optional</span>
            </h2>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              Optionally add a spouse, co-owner, or another authorized contact.
            </p>
          </div>
        </div>
        {ids.length === 0 && (
          <Button type="button" variant="outline" onClick={add} className="w-full shrink-0 sm:w-auto">
            <PlusIcon aria-hidden="true" />
            Add additional contact
          </Button>
        )}
      </header>

      {ids.length > 0 && (
        <div className="mt-5 flex flex-col gap-4 border-t border-border/60 pt-5">
          {ids.map((id, index) => (
            <fieldset key={id} className="flex flex-col gap-4 rounded-lg border border-border/70 bg-background/60 p-4">
              <div className="flex items-center justify-between gap-3">
                <legend className="text-sm font-medium text-foreground">
                  {ids.length > 1 ? `Contact ${index + 1}` : 'Contact details'}
                </legend>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(id)} className="text-muted-foreground">
                  <XIcon aria-hidden="true" />
                  Remove
                  <span className="sr-only">{` contact ${index + 1}`}</span>
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField name={`ac_${id}_first_name`} label="First name" required defaultValue={v(id, 'first_name') ?? ''} error={err(id, 'first_name')} autoComplete="off" />
                <TextField name={`ac_${id}_last_name`} label="Last name" required defaultValue={v(id, 'last_name') ?? ''} error={err(id, 'last_name')} autoComplete="off" />
                <TextField name={`ac_${id}_middle_name`} label="Middle name" defaultValue={v(id, 'middle_name') ?? ''} error={err(id, 'middle_name')} autoComplete="off" />
                <SelectField
                  name={`ac_${id}_relationship`}
                  label="Relationship"
                  defaultValue={v(id, 'relationship') ?? 'spouse'}
                  options={RELATIONSHIP_OPTIONS}
                />
                <TextField name={`ac_${id}_email`} label="Email" type="email" defaultValue={v(id, 'email') ?? ''} error={err(id, 'email')} />
                <SelectField
                  name={`ac_${id}_preferred_communication`}
                  label="Preferred contact"
                  defaultValue={v(id, 'preferred_communication') ?? 'email'}
                  options={COMMUNICATION_OPTIONS}
                />
                <TextField name={`ac_${id}_phone`} label="Phone" type="tel" defaultValue={v(id, 'phone') ?? ''} error={err(id, 'phone')} />
                <TextField name={`ac_${id}_alternate_phone`} label="Alternate phone" type="tel" defaultValue={v(id, 'alternate_phone') ?? ''} error={err(id, 'alternate_phone')} />
              </div>
            </fieldset>
          ))}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Contacts do not get homeowner portal access. You can invite them later from the client page.
            </p>
            {ids.length < MAX_ADDITIONAL_CONTACTS && (
              <Button type="button" variant="outline" size="sm" onClick={add} className="shrink-0">
                <PlusIcon aria-hidden="true" />
                Add another contact
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
