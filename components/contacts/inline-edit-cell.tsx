'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { updatePersonFieldAction } from '@/app/actions/contacts'
import type { InlinePersonField } from '@/lib/contacts'

/**
 * A directory cell that turns into an input on click. Enter or blur saves, Escape cancels. The server rejects the
 * save if the row changed since it was loaded, and the directory reloads so the user sees the newer data.
 */
export function InlineEditCell({
  personId,
  field,
  label,
  value,
  updatedAt,
  display,
  type = 'text',
  onSaved,
  className,
}: {
  personId: string
  field: InlinePersonField
  label: string
  value: string | null
  updatedAt: string
  display?: React.ReactNode
  type?: 'text' | 'email' | 'tel'
  onSaved: (value: string | null, updatedAt: string) => void
  className?: string
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const settled = useRef(false)

  function begin() {
    setDraft(value ?? '')
    setError(null)
    settled.current = false
    setEditing(true)
  }

  function cancel() {
    settled.current = true
    setEditing(false)
    setError(null)
  }

  function save() {
    if (settled.current || pending) return
    if (draft.trim() === (value ?? '').trim()) return cancel()
    settled.current = true
    startTransition(async () => {
      const result = await updatePersonFieldAction(personId, field, draft, updatedAt)
      if (result.ok) {
        onSaved(result.value, result.updated_at)
        setEditing(false)
        setError(null)
        toast.success(`${label} saved.`)
        return
      }
      settled.current = false
      setError(result.error)
      if (result.stale) {
        toast.error(result.error)
        setEditing(false)
        router.refresh()
      }
    })
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={begin}
        className={cn(
          'group/cell flex w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 text-left text-sm text-foreground/90 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className,
        )}
        aria-label={`Edit ${label}${value ? `: ${value}` : ''}`}
      >
        <span className="min-w-0 truncate">{display ?? (value || <span className="text-muted-foreground/70">Add</span>)}</span>
        <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/cell:opacity-100 group-focus-visible/cell:opacity-100" aria-hidden="true" />
      </button>
    )
  }

  const errorId = `${personId}-${field}-error`
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="relative">
        <input
          autoFocus
          type={type}
          value={draft}
          disabled={pending}
          aria-label={label}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (e.nativeEvent.isComposing || e.keyCode === 229) return
              e.preventDefault()
              save()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          className="h-8 w-full min-w-0 rounded-md border border-input bg-background px-2 pr-7 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive"
        />
        {pending && <Loader2 className="absolute right-2 top-2 size-4 animate-spin text-muted-foreground" aria-hidden="true" />}
      </div>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
