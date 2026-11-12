'use client'

import { useState } from 'react'
import { ChevronRight, MapPin, Plus, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { LOCATION_MAX } from '@/lib/punch-list'
import { itemCountLabel, type BuilderItem, type BuilderSection } from '@/lib/walkthrough-builder'

const isSubmitKey = (e: React.KeyboardEvent) => e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229

export const sectionNameId = (sectionKey: string) => `section-name-${sectionKey}`
export const itemLabelId = (itemKey: string) => `item-label-${itemKey}`
export const newItemId = (sectionKey: string) => `new-item-${sectionKey}`

export function ChecklistBuilderSection({
  section,
  open,
  editing,
  showErrors,
  numbers,
  onToggle,
  onRename,
  onRemove,
  onUpdateItem,
  onRemoveItem,
  onAddItem,
}: {
  section: BuilderSection
  open: boolean
  editing: boolean
  showErrors: boolean
  numbers: Map<string, string>
  onToggle: () => void
  onRename: (name: string) => void
  onRemove: () => void
  onUpdateItem: (itemKey: string, patch: Partial<BuilderItem>) => void
  onRemoveItem: (itemKey: string) => void
  onAddItem: (label: string) => void
}) {
  const [draft, setDraft] = useState('')
  const panelId = `section-panel-${section.key}`
  const name = section.category.trim() || 'Untitled section'
  const nameInvalid = showErrors && section.items.length > 0 && !section.category.trim()

  function add() {
    const label = draft.trim()
    if (!label) return
    onAddItem(label)
    setDraft('')
  }

  return (
    <li className="min-w-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-4"
        >
          <ChevronRight
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
            aria-hidden="true"
          />
          <span className={cn('min-w-0 truncate font-medium', !section.category.trim() && 'italic text-muted-foreground')}>{name}</span>
          <span className="shrink-0 text-muted-foreground" aria-hidden="true">
            ·
          </span>
          <span className="shrink-0 text-muted-foreground tabular-nums">{itemCountLabel(section.items.length)}</span>
          {nameInvalid && <span className="ml-auto shrink-0 text-xs font-medium text-destructive">Needs a name</span>}
        </button>
      </h3>

      {open && (
        <div id={panelId} role="region" aria-label={name} className="flex flex-col gap-3 px-3 pb-4 sm:px-4 sm:pl-10">
          {editing && (
            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center">
              <Input
                id={sectionNameId(section.key)}
                aria-label="Section name"
                aria-invalid={nameInvalid || undefined}
                placeholder="Section name"
                value={section.category}
                maxLength={80}
                onChange={(e) => onRename(e.target.value)}
                className="h-9 font-medium sm:max-w-sm"
              />
              <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="self-start text-destructive hover:text-destructive sm:self-auto">
                <Trash2 data-icon="inline-start" />
                Remove section
                <span className="sr-only">{` ${name}`}</span>
              </Button>
            </div>
          )}

          {section.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {editing ? 'No items yet. Add the first one below.' : 'No items in this section.'}
            </p>
          ) : (
            <ol className="flex flex-col divide-y divide-border/60">
              {section.items.map((item) =>
                editing ? (
                  <EditableItemRow
                    key={item.key}
                    item={item}
                    number={numbers.get(item.key)}
                    showErrors={showErrors}
                    onChange={(patch) => onUpdateItem(item.key, patch)}
                    onRemove={() => onRemoveItem(item.key)}
                  />
                ) : (
                  <li key={item.key} className="flex min-w-0 items-baseline gap-3 py-2 text-sm">
                    <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{numbers.get(item.key) ?? ''}</span>
                    <span className="min-w-0 flex-1 text-pretty break-words text-foreground">{item.label}</span>
                    {item.location.trim() && (
                      <span className="flex min-w-0 max-w-[40%] shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="size-3 shrink-0" aria-hidden="true" />
                        <span className="sr-only">Location:</span>
                        <span className="truncate">{item.location}</span>
                      </span>
                    )}
                  </li>
                ),
              )}
            </ol>
          )}

          {editing && (
            <div className="flex items-center gap-2">
              <Input
                id={newItemId(section.key)}
                aria-label={`New item in ${name}`}
                placeholder="Add an item"
                value={draft}
                maxLength={160}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (isSubmitKey(e)) {
                    e.preventDefault()
                    add()
                  }
                }}
                className="h-9 min-w-0 flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={add} disabled={!draft.trim()}>
                <Plus data-icon="inline-start" />
                Add item
              </Button>
            </div>
          )}
        </div>
      )}
    </li>
  )
}

function EditableItemRow({
  item,
  number,
  showErrors,
  onChange,
  onRemove,
}: {
  item: BuilderItem
  number?: string
  showErrors: boolean
  onChange: (patch: Partial<BuilderItem>) => void
  onRemove: () => void
}) {
  const [locationOpen, setLocationOpen] = useState(false)
  const labelInvalid = showErrors && !item.label.trim()
  const itemName = item.label.trim() || 'untitled item'
  const showLocation = locationOpen || item.location !== ''

  return (
    <li className="flex min-w-0 flex-col gap-2 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{number ?? ''}</span>
        <Input
          id={itemLabelId(item.key)}
          aria-label={`Checklist item ${number ?? ''}`.trim()}
          aria-invalid={labelInvalid || undefined}
          value={item.label}
          maxLength={160}
          onChange={(e) => onChange({ label: e.target.value })}
          className="h-9 min-w-0 flex-1"
        />
        <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${itemName}`} onClick={onRemove}>
          <X />
        </Button>
      </div>
      <div className="flex min-w-0 items-center gap-2 pl-10">
        {showLocation ? (
          <>
            <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <Input
              aria-label={`Room or location for ${itemName}`}
              placeholder="Room or location"
              value={item.location}
              maxLength={LOCATION_MAX}
              autoFocus={locationOpen && item.location === ''}
              onChange={(e) => onChange({ location: e.target.value })}
              onBlur={() => {
                if (!item.location.trim()) {
                  onChange({ location: '' })
                  setLocationOpen(false)
                }
              }}
              className="h-8 min-w-0 flex-1 text-sm sm:max-w-xs"
            />
          </>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setLocationOpen(true)}
            className="-ml-2 h-7 text-muted-foreground"
          >
            <MapPin data-icon="inline-start" />
            Add room/location
            <span className="sr-only">{` for ${itemName}`}</span>
          </Button>
        )}
      </div>
    </li>
  )
}
