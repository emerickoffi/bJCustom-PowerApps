'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { toast } from 'sonner'
import { updateDashboardVisibilityAction } from '@/app/actions/organization'
import { DashboardLayoutPreview } from '@/components/settings/dashboard-layout-preview'
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
  ALLOWED_AREAS,
  ALWAYS_EXPLANATION,
  AREA_LABELS,
  DASHBOARD_VISIBILITY_ITEMS,
  HEADER_ITEM_IDS,
  LAYOUT_AREAS,
  SHOW_WHEN_LABELS,
  areaOf,
  defaultSettings,
  isDefaultSettings,
  placeItem,
  stepItem,
  type DashboardSettings,
  type ItemVisibility,
  type LayoutArea,
  type ShowWhen,
  type VisibilityItem,
  type VisibilityItemId,
} from '@/lib/dashboard-visibility'
import { cn } from '@/lib/utils'

const ITEM_BY_ID = new Map<VisibilityItemId, VisibilityItem>(DASHBOARD_VISIBILITY_ITEMS.map((i) => [i.id, i]))

const GROUPS: { title: string; description: string; areas: LayoutArea[] }[] = [
  { title: 'Summary cards', description: 'The key figures across the top of the dashboard, left to right.', areas: ['summary'] },
  {
    title: 'Sections',
    description: 'The lists and panels below the key figures, top to bottom within each area.',
    areas: ['above', 'main', 'side', 'below'],
  },
]

export function DashboardVisibilityForm({
  initial,
  customized,
  loadError,
}: {
  initial: DashboardSettings
  customized: boolean
  loadError: string | null
}) {
  const router = useRouter()
  const [saved, setSaved] = useState(initial)
  const [draft, setDraft] = useState(initial)
  const [isCustom, setIsCustom] = useState(customized)
  const [confirmingRestore, setConfirmingRestore] = useState(false)
  const [announcement, setAnnouncement] = useState('')
  const [pending, startTransition] = useTransition()

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)

  const updateVisibility = (id: VisibilityItemId, patch: Partial<ItemVisibility>) =>
    setDraft((d) => ({ ...d, visibility: { ...d.visibility, [id]: { ...d.visibility[id], ...patch } } }))

  const updateLayout = (id: VisibilityItemId, next: DashboardSettings['layout']) => {
    setDraft((d) => ({ ...d, layout: next }))
    const area = areaOf(next, id)
    setAnnouncement(
      `${ITEM_BY_ID.get(id)?.label}: ${AREA_LABELS[area]}, position ${next[area].indexOf(id) + 1} of ${next[area].length}.`,
    )
  }

  const submit = (value: DashboardSettings | null) =>
    startTransition(async () => {
      const result = await updateDashboardVisibilityAction(value)
      if (result.error) {
        toast.error(result.error)
        return
      }
      const next = value ?? defaultSettings()
      setSaved(next)
      setDraft(next)
      setIsCustom(value !== null && !isDefaultSettings(value))
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

      <DashboardLayoutPreview settings={draft} />

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section aria-labelledby="group-header" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="group-header" className="type-section-title text-foreground">
            Greeting row
          </h2>
          <p className="text-sm text-muted-foreground">Compact details shown beside the dashboard greeting.</p>
        </div>
        <ul className="divide-y rounded-xl border bg-card">
          {HEADER_ITEM_IDS.map((id) => {
            const item = ITEM_BY_ID.get(id)
            if (!item) return null
            return (
              <HeaderRow
                key={id}
                item={item}
                value={draft.visibility[id]}
                disabled={pending}
                onChange={(patch) => updateVisibility(id, patch)}
              />
            )
          })}
        </ul>
      </section>

      {GROUPS.map((group, groupIndex) => (
        <section key={group.title} aria-labelledby={`group-${groupIndex}`} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={`group-${groupIndex}`} className="type-section-title text-foreground">
              {group.title}
            </h2>
            <p className="text-sm text-muted-foreground">{group.description}</p>
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {group.areas.flatMap((area) =>
              draft.layout[area].map((id) => {
                const item = ITEM_BY_ID.get(id)
                if (!item) return []
                return (
                  <VisibilityRow
                    key={id}
                    item={item}
                    value={draft.visibility[id]}
                    area={area}
                    position={draft.layout[area].indexOf(id) + 1}
                    areaCount={(target) => draft.layout[target].length + (target === area ? 0 : 1)}
                    disabled={pending}
                    onChange={(patch) => updateVisibility(id, patch)}
                    onPlace={(target, position) => updateLayout(id, placeItem(draft.layout, id, target, position))}
                    onStep={(direction) => updateLayout(id, stepItem(draft.layout, id, direction))}
                  />
                )
              }),
            )}
          </ul>
        </section>
      ))}

      <div className="flex flex-col-reverse gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={pending || (!isCustom && isDefaultSettings(draft))}
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
              Every summary card and section will be turned back on, shown at all times, and returned to its original
              position, for everyone in your company. Any unsaved changes on this page are discarded.
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

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50'

function HeaderRow({
  item,
  value,
  disabled,
  onChange,
}: {
  item: VisibilityItem
  value: ItemVisibility
  disabled: boolean
  onChange: (patch: Partial<ItemVisibility>) => void
}) {
  const switchId = `visibility-${item.id}`
  const selectId = `visibility-${item.id}-when`
  const explanation = value.showWhen === 'records' ? item.records : ALWAYS_EXPLANATION
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
            {value.enabled
              ? `${explanation} Each person picks their own weather location.`
              : 'Hidden from the dashboard for everyone in your company.'}
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
          className={selectClass}
        >
          {(['always', 'records'] as const).map((o) => (
            <option key={o} value={o}>
              {SHOW_WHEN_LABELS[o]}
            </option>
          ))}
        </select>
      </div>
    </li>
  )
}

function VisibilityRow({
  item,
  value,
  area,
  position,
  areaCount,
  disabled,
  onChange,
  onPlace,
  onStep,
}: {
  item: VisibilityItem
  value: ItemVisibility
  area: LayoutArea
  position: number
  /** Number of positions available in an area once this item is in it. */
  areaCount: (area: LayoutArea) => number
  disabled: boolean
  onChange: (patch: Partial<ItemVisibility>) => void
  onPlace: (area: LayoutArea, position: number) => void
  onStep: (direction: -1 | 1) => void
}) {
  const id = item.id as VisibilityItemId
  const options: ShowWhen[] = item.attention ? ['always', 'records', 'attention'] : ['always', 'records']
  const explanation =
    value.showWhen === 'records' ? item.records : value.showWhen === 'attention' ? item.attention : ALWAYS_EXPLANATION
  const allowed = LAYOUT_AREAS.filter((a) => ALLOWED_AREAS[id].includes(a))
  const count = areaCount(area)
  const switchId = `visibility-${id}`
  const selectId = `visibility-${id}-when`
  const areaId = `visibility-${id}-area`
  const positionId = `visibility-${id}-position`

  return (
    <li className="flex flex-col gap-4 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
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
              {value.enabled
                ? explanation
                : 'Hidden from the dashboard. It keeps its position, and the module and its records are unaffected.'}
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
            className={selectClass}
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
      </div>

      <fieldset className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3 sm:flex-row sm:items-end sm:gap-4 sm:pl-14">
        <legend className="sr-only">{`Position of ${item.label}`}</legend>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={areaId} className="text-xs font-medium text-muted-foreground">
            Area
          </label>
          {allowed.length > 1 ? (
            <select
              id={areaId}
              value={area}
              disabled={disabled}
              onChange={(e) => {
                const target = e.target.value as LayoutArea
                onPlace(target, areaCount(target))
              }}
              className={selectClass}
            >
              {allowed.map((a) => (
                <option key={a} value={a}>
                  {AREA_LABELS[a]}
                </option>
              ))}
            </select>
          ) : (
            <p id={areaId} className="flex h-9 items-center text-sm text-foreground">
              {AREA_LABELS[area]}
              <span className="ml-2 text-xs text-muted-foreground">(only area that fits)</span>
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1 sm:w-36">
          <label htmlFor={positionId} className="text-xs font-medium text-muted-foreground">
            Position
          </label>
          <select
            id={positionId}
            value={position}
            disabled={disabled || count < 2}
            onChange={(e) => onPlace(area, Number(e.target.value))}
            className={selectClass}
          >
            {Array.from({ length: count }, (_, i) => (
              <option key={i + 1} value={i + 1}>{`${i + 1} of ${count}`}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || position <= 1}
            onClick={() => onStep(-1)}
            aria-label={`Move ${item.label} ${area === 'summary' ? 'left' : 'up'}`}
          >
            <ArrowUp className={cn('size-4', area === 'summary' && '-rotate-90')} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={disabled || position >= count}
            onClick={() => onStep(1)}
            aria-label={`Move ${item.label} ${area === 'summary' ? 'right' : 'down'}`}
          >
            <ArrowDown className={cn('size-4', area === 'summary' && '-rotate-90')} aria-hidden="true" />
          </Button>
        </div>
      </fieldset>
    </li>
  )
}
