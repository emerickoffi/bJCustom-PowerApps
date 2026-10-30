'use client'

import { useId, useState, useTransition } from 'react'
import { AlertCircle, Building2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/shared/form-field'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/lib/contacts'
import { quickCreateCompanyAction } from '@/app/actions/contacts'
import type { CompanyOption } from '@/lib/contacts-data'

/**
 * Inline "Add New Company" section rendered inside the contact form, so no nested dialog is stacked over a modal
 * or drawer and the person's typed details are never touched. It is a group, not a nested <form>: Enter and the
 * Save button call the quick-create action directly and never submit the surrounding contact form.
 */
export function QuickCompanyPanel({
  initialName,
  companies,
  onSelect,
  onCancel,
}: {
  initialName: string
  companies: CompanyOption[]
  onSelect: (company: CompanyOption, created: boolean) => void
  onCancel: () => void
}) {
  const nameId = useId()
  const categoryId = useId()
  const titleId = useId()
  const [name, setName] = useState(initialName)
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [serverMatch, setServerMatch] = useState<CompanyOption | null>(null)
  const [pending, startTransition] = useTransition()

  const search = name.trim().toLowerCase()
  const exact = search ? companies.find((c) => c.company_name.trim().toLowerCase() === search) : undefined
  const similar =
    search.length >= 2 && !exact
      ? companies.filter((c) => c.company_name.toLowerCase().includes(search) || search.includes(c.company_name.toLowerCase())).slice(0, 3)
      : []
  const match = exact ?? serverMatch

  function save() {
    if (pending) return
    if (!name.trim()) {
      setError('Company name is required')
      return
    }
    if (exact) return
    setError(null)
    startTransition(async () => {
      const result = await quickCreateCompanyAction({ company_name: name, category })
      if (result.ok) {
        onSelect(result.company, true)
        return
      }
      setError(result.error)
      setServerMatch(result.existing ?? null)
    })
  }

  return (
    <div role="group" aria-labelledby={titleId} className="flex flex-col gap-4 rounded-xl border border-primary/25 bg-sage/40 p-4 sm:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <p id={titleId} className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Building2 className="size-4 text-primary" aria-hidden="true" />
            New company
          </p>
          <p className="text-xs text-muted-foreground">Only the name is needed now. Add the address and phone later from the company profile.</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onCancel} disabled={pending}>
          <X aria-hidden="true" />
          <span className="sr-only">Cancel new company</span>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>
            Company name<span className="text-destructive" aria-hidden="true">*</span>
            <span className="sr-only">(required)</span>
          </Label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
              setServerMatch(null)
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              e.preventDefault()
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              save()
            }}
            maxLength={160}
            autoFocus
            autoComplete="off"
            className="bg-background"
            aria-invalid={error && !match ? true : undefined}
            aria-describedby={`${nameId}-status`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={categoryId}>Business category</Label>
          <NativeSelect id={categoryId} value={category} onChange={(e) => setCategory(e.target.value)} className="bg-background">
            <option value="">No category yet</option>
            {CATEGORY_KEYS.map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div id={`${nameId}-status`} aria-live="polite">
        {match ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
            <span>
              <strong className="font-medium">{match.company_name}</strong> is already in your directory.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => onSelect(match, false)}>
              Use existing
            </Button>
          </div>
        ) : error ? (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            {error}
          </p>
        ) : similar.length > 0 ? (
          <div className="flex flex-col gap-1 text-sm">
            <p className="text-xs text-muted-foreground">Similar companies already exist:</p>
            <ul className="flex flex-col gap-1">
              {similar.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(c, false)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-background focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                  >
                    <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{c.company_name}</span>
                    <span className="text-xs font-medium text-primary">Use this</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="bg-background" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button type="button" onClick={save} disabled={pending || Boolean(exact)}>
          {pending ? 'Saving company…' : 'Save company'}
        </Button>
      </div>
    </div>
  )
}
