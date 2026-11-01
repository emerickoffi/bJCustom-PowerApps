'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updateDashboardVisibilityAction } from '@/app/actions/organization'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ALWAYS_EXPLANATION,
  DASHBOARD_VISIBILITY_ITEMS,
  SHOW_WHEN_LABELS,
  defaultVisibility,
  isDefaultVisibility,
  type DashboardVisibility,
  type ShowWhen,
  type VisibilityItem,
  type VisibilityItemId,
} from '@/lib/dashboard-visibility'
import { cn } from '@/lib/utils'

const GROUPS: { kind: VisibilityItem['kind']; title: string; description: string }[] = [
  { kind: 'card', title: 'Summary cards', description: 'The key figures across the top of the dashboard.' },
  { kind: 'section', title: 'Sections', description: 'The lists and panels below the key figures.' },
]

export function DashboardVisibilityForm({
  initial,
  customized,
  loadError,
}: {
  initial: DashboardVisibility
  customized: boolean
  loadError: string | null
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [isCustom, setIsCustom] = useState(customized)
  const [confirmingRestore, setConfirmingRestore] = useState(false)
  const [pending, startTransition] = useTransition()

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const update = (id: VisibilityItemId, patch: Partial<DashboardVisibility[VisibilityItemId]>) =>
    setDraft((d) => ({ ...d, [id]: { ...d[id], ...patch } }))

  const submit = (value: DashboardVisibility | null) =>
    startTransition(async () => {
      const result = await updateDashboardVisibilityAction(value)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const next = value ?? defaultVisibility()
      setSaved(next)
      setDraft(next)
      setIsCustom(value !== null && !isDefaultVisibility(value))
      setConfirmingRestore(false)
      toast.success(result.success)
      router.refresh()
    })

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault()
        submit(draft)
      }}
    >
      {loadError && (
        <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {`${loadError} The built-in defaults are shown below. Saving will replace whatever is stored.`}
        </p>
      )}

      {GROUPS.map((group) => (
        <section key={group.kind} aria-labelledby={`group-${group.kind}`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={`group-${group.kind}`} className="font-serif text-lg font-semibold text-foreground">
              {group.title}
            </h2>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {DASHBOARD_VISIBILITY_ITEMS.filter((i) => i.kind === group.kind).map((item) => (
              <VisibilityRow
                key={item.id}
                item={item}
                value={draft[item.id]}
                disabled={pending}
                onChange={(patch) => update(item.id, patch)}
              />
            ))}
          </ul>
        </section>
      ))}

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={pending || (!isCustom && isDefaultVisibility(draft))}
          onClick={() => setConfirmingRestore(true)}
        >
          Restore defaults
        </Button>
        <div className="flex flex-col-reverse gap-3 sm:flex-row">
          <Button type="button" variant="outline" disabled={pending || !dirty} onClick={() => setDraft(saved)}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending || !dirty}>
            {pending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      <Dialog open={confirmingRestore} onOpenChange={setConfirmingRestore}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore dashboard defaults?</DialogTitle>
            <DialogDescription>
              Every summary card and section will be turned back on and shown at all times, for everyone in your
              company. Any unsaved changes on this page are discarded.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmingRestore(false)} disabled={pending}>
              Keep my settings
            </Button>
            <Button onClick={() => submit(null)} disabled={pending}>
              Restore defaults
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

function VisibilityRow({
  item,
  value,
  disabled,
  onChange,
}: {
  item: VisibilityItem
  value: DashboardVisibility[VisibilityItemId]
  disabled: boolean
  onChange: (patch: Partial<DashboardVisibility[VisibilityItemId]>) => void
}) {
  const options: ShowWhen[] = item.attention ? ['always', 'records', 'attention'] : ['always', 'records']
  const explanation =
    value.showWhen === 'records' ? item.records : value.showWhen === 'attention' ? item.attention : ALWAYS_EXPLANATION
  const switchId = `visibility-${item.id}`
  const selectId = `visibility-${item.id}-when`

  return (
    <li className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <button
          id={switchId}
          type="button"
          role="switch"
          aria-checked={value.enabled}
          disabled={disabled}
          onClick={() => onChange({ enabled: !value.enabled })}
          className={cn(
            'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            value.enabled ? 'bg-primary' : 'bg-muted-foreground/30',
          )}
        >
          <span className="sr-only">{`Show ${item.label} on the dashboard`}</span>
          <span
            aria-hidden="true"
            className={cn(
              'inline-block size-5 rounded-full bg-background shadow transition-transform',
              value.enabled ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={switchId} className="font-medium text-foreground">
            {item.label}
          </label>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {value.enabled ? explanation : 'Hidden from the dashboard. The module and its records are unaffected.'}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-1 sm:w-64">
        <label htmlFor={selectId} className="text-xs font-medium text-muted-foreground">
          Show when
        </label>
        <select
          id={selectId}
          value={value.showWhen}
          disabled={disabled || !value.enabled}
          onChange={(e) => onChange({ showWhen: e.target.value as ShowWhen })}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {SHOW_WHEN_LABELS[o]}
            </option>
          ))}
        </select>
        {!item.attention && (
          <p className="text-xs text-muted-foreground">No reliable attention rule exists for this item.</p>
        )}
      </div>
    </li>
  )
}
