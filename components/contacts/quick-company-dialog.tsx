'use client'

import { useId, useState, useTransition } from 'react'
import { AlertCircle, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/shared/form-field'
import { CATEGORY_KEYS, CATEGORY_LABELS } from '@/lib/contacts'
import { quickCreateCompanyAction } from '@/app/actions/contacts'
import type { CompanyOption } from '@/lib/contacts-data'

/**
 * Minimal "Add New Company" form used from the contact form. It is not a nested form in the DOM (it renders in a
 * portal), and it stops its own submit so the contact form is never submitted or cleared.
 */
export function QuickCompanyDialog({
  open,
  onOpenChange,
  initialName,
  companies,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialName: string
  companies: CompanyOption[]
  onSelect: (company: CompanyOption, created: boolean) => void
}) {
  const nameId = useId()
  const categoryId = useId()
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

  function submit(e: React.FormEvent) {
    e.preventDefault()
    e.stopPropagation()
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
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <DialogHeader>
            <DialogTitle>Add new company</DialogTitle>
            <DialogDescription>
              Just the name is needed now. Add the address, phone, and other details later from the company profile.
            </DialogDescription>
          </DialogHeader>

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
              maxLength={160}
              autoFocus
              autoComplete="off"
              aria-invalid={error && !match ? true : undefined}
              aria-describedby={`${nameId}-status`}
            />
            <div id={`${nameId}-status`} aria-live="polite">
              {match ? (
                <div className="mt-1 flex flex-col gap-2 rounded-lg border border-amber-300/70 bg-amber-50 p-3 text-sm text-amber-950 sm:flex-row sm:items-center sm:justify-between dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100">
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
                <div className="mt-1 flex flex-col gap-1 text-sm">
                  <p className="text-xs text-muted-foreground">Similar companies already exist:</p>
                  <ul className="flex flex-col gap-1">
                    {similar.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(c, false)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={categoryId}>Business category</Label>
            <NativeSelect id={categoryId} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">No category yet</option>
              {CATEGORY_KEYS.map((k) => (
                <option key={k} value={k}>
                  {CATEGORY_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || Boolean(exact)}>
              {pending ? 'Saving company…' : 'Save company'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
