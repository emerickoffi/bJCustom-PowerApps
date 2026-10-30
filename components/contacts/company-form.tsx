'use client'

import { useActionState, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Building2, ChevronDown, ExternalLink, MapPin, Phone, StickyNote, Tags, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { OVERLAY_FIELD, initialActionState, type ActionState } from '@/lib/action-state'
import { CATEGORY_KEYS, CATEGORY_LABELS, type CategoryKey } from '@/lib/contacts'
import type { CompanyOption } from '@/lib/contacts-data'
import { FormActions, FormSection, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { OverlayBody, OverlayFooter, useFormOverlay } from '@/components/shared/form-overlay'

type CompanyDefaults = {
  company_name: string
  company_email: string | null
  company_phone: string | null
  secondary_company_phone?: string | null
  website?: string | null
  address_line1?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  notes: string | null
  business_categories: CategoryKey[]
  product_categories: string[]
  subcontractor_company_id: string | null
}

export function CompanyForm({
  action,
  cancelHref,
  company,
  companies = [],
  onSaved,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  /** Used by the full-page variant. Inside a FormOverlay, Cancel asks the overlay to close instead. */
  cancelHref?: string
  company?: CompanyDefaults
  /** Existing directory companies, used to warn about duplicates while typing a new company's name. */
  companies?: CompanyOption[]
  /** Overlay variant: called after a successful save instead of redirecting. */
  onSaved?: (result: ActionState) => void
}) {
  const overlay = useFormOverlay()
  const [state, formAction] = useActionState(action, initialActionState)
  const fe = state.fieldErrors ?? {}
  const v: Record<string, string> = state.values ?? {
    company_name: company?.company_name ?? '',
    company_email: company?.company_email ?? '',
    company_phone: company?.company_phone ?? '',
    secondary_company_phone: company?.secondary_company_phone ?? '',
    website: company?.website ?? '',
    address_line1: company?.address_line1 ?? '',
    city: company?.city ?? '',
    state: company?.state ?? '',
    postal_code: company?.postal_code ?? '',
    notes: company?.notes ?? '',
    categories: (company?.business_categories ?? []).join(','),
    product_categories: (company?.product_categories ?? []).join(', '),
  }
  const checked = new Set((v.categories ?? '').split(',').filter(Boolean))
  const linked = Boolean(company?.subcontractor_company_id)
  const isEdit = Boolean(company)
  const formKey = state.values ? JSON.stringify(state.values) : 'initial'

  const [name, setName] = useState(v.company_name)
  const [suppliers, setSuppliers] = useState(checked.has('suppliers') || Boolean(v.product_categories))

  useEffect(() => {
    if (state.savedId) onSaved?.(state)
  }, [state, onSaved])

  const search = name.trim().toLowerCase()
  const liveMatches =
    !isEdit && search.length >= 2
      ? companies
          .filter((c) => {
            const n = c.company_name.toLowerCase()
            return n === search || n.includes(search) || (n.length >= 4 && search.includes(n))
          })
          .sort((a, b) => Number(b.company_name.toLowerCase() === search) - Number(a.company_name.toLowerCase() === search))
          .slice(0, 3)
      : []
  const exactLive = liveMatches.find((c) => c.company_name.trim().toLowerCase() === search)
  const serverDuplicate = state.duplicate && state.duplicate.name.trim().toLowerCase() === search ? state.duplicate : null
  const blocked = Boolean(exactLive || serverDuplicate)

  const hasAddress = Boolean(v.address_line1 || v.city || v.state || v.postal_code)
  const addressError = Boolean(fe.address_line1 || fe.city || fe.state || fe.postal_code)

  const sections = (
    <div className={cn('flex flex-col', overlay ? 'gap-0' : 'gap-5')}>
      {overlay && <input type="hidden" name={OVERLAY_FIELD} value="1" />}

      <FormSection
        flat={Boolean(overlay)}
        icon={Building2}
        title="Company information"
        description={
          linked
            ? 'Name, email, and phone come from the linked subcontractor record. Edit them on the Subcontractor page.'
            : 'Only the company name is required. Everything else can be added later.'
        }
      >
        <div className="flex flex-col gap-2 sm:col-span-2">
          <TextField
            name="company_name"
            label="Company name"
            required
            disabled={linked}
            defaultValue={v.company_name}
            error={fe.company_name}
            autoComplete="organization"
            autoFocus={Boolean(overlay) && !isEdit}
            maxLength={160}
            onChange={(e) => setName(e.target.value)}
          />
          <DuplicateNotice matches={liveMatches} exact={exactLive} server={serverDuplicate} />
        </div>

        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Business categories</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_KEYS.map((k) => (
              <label
                key={k}
                className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm transition-colors hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-sage has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50"
              >
                <input
                  type="checkbox"
                  name="categories"
                  value={k}
                  defaultChecked={checked.has(k)}
                  onChange={k === 'suppliers' ? (e) => setSuppliers(e.target.checked || Boolean(v.product_categories)) : undefined}
                  className="size-4 accent-primary"
                />
                {CATEGORY_LABELS[k]}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {linked
              ? 'Linked subcontractors always appear under Subcontractors.'
              : 'Choose every category that applies. Add trade partners from the Subcontractors page so their records stay linked.'}
          </p>
        </fieldset>

        <div className={cn('sm:col-span-2', !suppliers && !isEdit && 'hidden')}>
          <TextField
            name="product_categories"
            label="Supplier product categories"
            defaultValue={v.product_categories}
            error={fe.product_categories}
            hint="Comma separated, for example Lumber, Windows, Cabinets."
          />
        </div>
        {!isEdit && (
          <p className="text-xs text-muted-foreground sm:col-span-2">New companies are added as Active. You can deactivate them later from the profile.</p>
        )}
      </FormSection>

      <FormSection flat={Boolean(overlay)} icon={Phone} title="Contact information" description="How your team reaches this business.">
        <TextField name="company_email" label="Company email" type="email" disabled={linked} defaultValue={v.company_email} error={fe.company_email} autoComplete="email" />
        <TextField name="company_phone" label="Company phone" type="tel" disabled={linked} defaultValue={v.company_phone} error={fe.company_phone} autoComplete="tel" />
        <TextField name="secondary_company_phone" label="Secondary phone" type="tel" defaultValue={v.secondary_company_phone} error={fe.secondary_company_phone} />
        <TextField name="website" label="Website" type="url" defaultValue={v.website} error={fe.website} hint="For example example.com" maxLength={200} />
      </FormSection>

      <Disclosure
        flat={Boolean(overlay)}
        icon={MapPin}
        title="Address"
        description="Optional. Useful for suppliers and pickup locations."
        defaultOpen={!overlay || hasAddress || addressError}
      >
        <TextField name="address_line1" label="Street address" defaultValue={v.address_line1} error={fe.address_line1} autoComplete="street-address" maxLength={160} className="sm:col-span-2" />
        <TextField name="city" label="City" defaultValue={v.city} error={fe.city} autoComplete="address-level2" maxLength={80} />
        <TextField name="state" label="State / province" defaultValue={v.state} error={fe.state} autoComplete="address-level1" maxLength={40} />
        <TextField name="postal_code" label="Postal code" defaultValue={v.postal_code} error={fe.postal_code} autoComplete="postal-code" maxLength={20} />
      </Disclosure>

      <Disclosure
        flat={Boolean(overlay)}
        icon={StickyNote}
        title="Notes"
        description="Internal only. Notes are never included in exports."
        defaultOpen={!overlay || Boolean(v.notes) || Boolean(fe.notes)}
      >
        <TextAreaField name="notes" label="Notes" defaultValue={v.notes} error={fe.notes} maxLength={2000} className="sm:col-span-2" />
      </Disclosure>

      {!isEdit && (
        <div className={cn('flex items-start gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4', overlay && 'mt-5')}>
          <Users className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Contact persons and projects</span> are added from the company profile after saving: search existing
            contacts or create new ones, assign their role, and mark the primary contact.
          </p>
        </div>
      )}
    </div>
  )

  const submit = (
    <SubmitButton pendingLabel={isEdit ? 'Saving changes…' : 'Saving company…'} disabled={blocked}>
      {isEdit ? 'Save changes' : 'Save company'}
    </SubmitButton>
  )
  const message = !state.savedId && !serverDuplicate ? <FormMessage state={state} /> : null

  if (overlay) {
    return (
      <form key={formKey} action={formAction} onChange={overlay.markDirty} className="flex min-h-0 flex-1 flex-col" noValidate>
        <OverlayBody className="py-0">{sections}</OverlayBody>
        <OverlayFooter message={message}>
          <p className="mr-auto hidden text-xs text-muted-foreground sm:block">Fields marked * are required.</p>
          <Button type="button" variant="outline" size="lg" onClick={overlay.requestClose}>
            Cancel
          </Button>
          {submit}
        </OverlayFooter>
      </form>
    )
  }

  return (
    <form key={formKey} action={formAction} className="flex flex-col gap-5" noValidate>
      {sections}
      <FormActions message={message}>
        <Button variant="outline" size="lg" render={<Link href={cancelHref ?? '/contacts?view=companies'} />} nativeButton={false}>
          Cancel
        </Button>
        {submit}
      </FormActions>
    </form>
  )
}

function DuplicateNotice({
  matches,
  exact,
  server,
}: {
  matches: CompanyOption[]
  exact: CompanyOption | undefined
  server: ActionState['duplicate'] | null
}) {
  if (server) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
        <span className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-medium">{server.name}</strong>{' '}
            {server.kind === 'subcontractor' ? 'is already a subcontractor.' : server.inactive ? 'already exists but is inactive.' : 'is already in your directory.'}
          </span>
        </span>
        <Button size="sm" variant="outline" className="bg-background" render={<Link href={server.href} />} nativeButton={false}>
          <ExternalLink data-icon="inline-start" />
          {server.kind === 'subcontractor' ? 'Open subcontractor' : 'Open company'}
        </Button>
      </div>
    )
  }
  if (matches.length === 0) return null
  return (
    <div aria-live="polite" className="flex flex-col gap-1.5 rounded-lg border border-border/80 bg-muted/40 p-3">
      <p className="text-xs font-medium text-muted-foreground">
        {exact ? 'This company is already in your directory:' : 'Similar companies already exist. Open one instead of adding a duplicate:'}
      </p>
      <ul className="flex flex-col">
        {matches.map((c) => (
          <li key={c.id}>
            <Link
              href={`/contacts/companies/${c.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{c.company_name}</span>
              {c.status !== 'active' && <span className="text-xs text-muted-foreground">Inactive</span>}
              {c.category && <span className="hidden text-xs text-muted-foreground sm:inline">{c.category}</span>}
              <span className="text-xs font-medium text-primary">Open</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Optional section that starts collapsed in the drawer. Inputs stay mounted while hidden so typed values still submit. */
function Disclosure({
  flat,
  icon: Icon,
  title,
  description,
  defaultOpen,
  children,
}: {
  flat: boolean
  icon: typeof Tags
  title: string
  description: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  if (!flat) {
    return (
      <FormSection icon={Icon} title={title} description={description}>
        {children}
      </FormSection>
    )
  }
  return (
    <section className="border-b border-border/60 py-4 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          <span className="text-xs text-muted-foreground">{description}</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      <div id={panelId} hidden={!open} className="mt-4 grid gap-4 sm:grid-cols-2">
        {children}
      </div>
    </section>
  )
}
