'use client'

import { useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

export const OTHER_TRADE = 'Other / Specialty not listed'

type TradeGroup = { value: string; items: string[] }

const TRADE_GROUPS: TradeGroup[] = [
  {
    value: 'Structural & Exterior',
    items: ['Concrete', 'Masonry', 'Framing', 'Structural Steel', 'Roofing', 'Siding', 'Windows & Doors', 'Waterproofing', 'Insulation', 'Gutters'],
  },
  {
    value: 'Mechanical, Electrical & Plumbing',
    items: ['Electrical', 'Plumbing', 'HVAC', 'Fire Protection / Sprinklers', 'Low Voltage / Data', 'Solar', 'Gas Fitting'],
  },
  {
    value: 'Interior & Finishes',
    items: ['Drywall', 'Painting', 'Flooring', 'Tile', 'Cabinets', 'Countertops', 'Finish Carpentry', 'Millwork', 'Acoustical Ceilings', 'Glass & Mirrors'],
  },
  {
    value: 'Site & Specialty',
    items: ['Excavation', 'Grading', 'Demolition', 'Paving', 'Landscaping', 'Fencing', 'Surveying', 'Elevators', 'Environmental / Abatement', 'Cleaning', OTHER_TRADE],
  },
]

const ALL_TRADES = new Set(TRADE_GROUPS.flatMap((g) => g.items))

function initialState(defaultValue: string) {
  const trimmed = defaultValue.trim()
  if (!trimmed) return { selected: null, other: '' }
  if (ALL_TRADES.has(trimmed) && trimmed !== OTHER_TRADE) return { selected: trimmed, other: '' }
  return { selected: OTHER_TRADE, other: trimmed }
}

export function TradeCombobox({ defaultValue = '', error }: { defaultValue?: string; error?: string }) {
  const initial = initialState(defaultValue)
  const [selected, setSelected] = useState<string | null>(initial.selected)
  const [other, setOther] = useState(initial.other)

  const isOther = selected === OTHER_TRADE
  const submittedValue = isOther ? other.trim() : (selected ?? '')
  const describedBy = error ? 'trade-error' : 'trade-hint'

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor="trade" className="text-sm font-medium text-foreground">
        Trade or specialty
        <span className="text-destructive" aria-hidden="true">
          *
        </span>
        <span className="sr-only">(required)</span>
      </Label>

      <input type="hidden" name="trade" value={submittedValue} />

      <Combobox.Root items={TRADE_GROUPS} value={selected} onValueChange={(value) => setSelected(value as string | null)}>
        <div className="relative">
          <Combobox.Input
            id="trade"
            placeholder="Search or select a trade"
            aria-invalid={error && !isOther ? true : undefined}
            aria-describedby={isOther ? undefined : describedBy}
            aria-required="true"
            className={cn(
              'h-10 w-full min-w-0 rounded-lg border border-input bg-background pl-2.5 pr-16 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/80',
              'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
              'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
            )}
          />
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            {selected && (
              <Combobox.Clear
                aria-label="Clear trade"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <X className="size-4" aria-hidden="true" />
              </Combobox.Clear>
            )}
            <Combobox.Trigger
              aria-label="Show trades"
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronDown className="size-4" aria-hidden="true" />
            </Combobox.Trigger>
          </div>
        </div>

        <Combobox.Portal>
          <Combobox.Positioner sideOffset={4} collisionPadding={8} className="z-50 outline-none">
            <Combobox.Popup className="w-(--anchor-width) max-h-[min(var(--available-height),22rem)] overflow-y-auto overscroll-contain rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg outline-none data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 transition-opacity">
              <Combobox.Empty className="px-3 py-6 text-center text-sm text-muted-foreground empty:hidden">
                {`No matching trade. Choose "${OTHER_TRADE}" to enter your own.`}
              </Combobox.Empty>
              <Combobox.List className="outline-none">
                {(group: TradeGroup) => (
                  <Combobox.Group key={group.value} items={group.items} className="pb-1 last:pb-0">
                    <Combobox.GroupLabel className="sticky top-0 z-10 bg-popover px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.value}
                    </Combobox.GroupLabel>
                    <Combobox.Collection>
                      {(item: string) => (
                        <Combobox.Item
                          key={item}
                          value={item}
                          className="flex min-h-10 cursor-default select-none items-center gap-2 rounded-md px-2 text-sm outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground sm:min-h-9"
                        >
                          <span className="flex size-4 shrink-0 items-center justify-center">
                            <Combobox.ItemIndicator>
                              <Check className="size-4" aria-hidden="true" />
                            </Combobox.ItemIndicator>
                          </span>
                          <span className={cn(item === OTHER_TRADE && 'italic')}>{item}</span>
                        </Combobox.Item>
                      )}
                    </Combobox.Collection>
                  </Combobox.Group>
                )}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>

      {!isOther && (
        <FieldHelp
          id={describedBy}
          error={error}
          hint="Type to search, or use the arrow keys to browse."
        />
      )}

      {isOther && (
        <div className="mt-1 flex flex-col gap-1.5">
          <Label htmlFor="trade_other" className="text-sm font-medium text-foreground">
            Specify trade
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </Label>
          <Input
            id="trade_other"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            required
            maxLength={120}
            placeholder="e.g. Pool construction"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className="h-10 placeholder:text-muted-foreground/80"
          />
          <FieldHelp id={describedBy} error={error} hint="Enter the trade or specialty this company performs." />
        </div>
      )}
    </div>
  )
}

function FieldHelp({ id, error, hint }: { id: string; error?: string; hint: string }) {
  return error ? (
    <p id={id} className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
      <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      {error}
    </p>
  ) : (
    <p id={id} className="text-xs leading-relaxed text-muted-foreground">
      {hint}
    </p>
  )
}
