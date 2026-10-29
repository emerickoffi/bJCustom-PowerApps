'use client'

import { useState } from 'react'
import { Combobox } from '@base-ui/react/combobox'
import { CheckIcon, ChevronDownIcon, XIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FieldShell, TextField } from '@/components/shared/form-field'
import {
  OTHER_TRADE,
  STANDARD_TRADES,
  TRADE_GROUPS,
  matchStandardTrade,
  type TradeGroup,
} from '@/lib/subcontractor-trades'

function initialState(values: Record<string, string>) {
  const choice = values.trade_choice ?? ''
  const other = values.trade_other ?? ''
  if (choice === OTHER_TRADE) return { choice, other }
  if (STANDARD_TRADES.includes(choice)) return { choice, other: '' }
  const saved = values.trade?.trim() ?? ''
  if (!saved) return { choice: null, other: '' }
  const standard = matchStandardTrade(saved)
  return standard ? { choice: standard, other: '' } : { choice: OTHER_TRADE, other: saved }
}

export function TradeCombobox({ values, error }: { values: Record<string, string>; error?: string }) {
  const [{ choice: initialChoice, other: initialOther }] = useState(() => initialState(values))
  const [choice, setChoice] = useState<string | null>(initialChoice)
  const [other, setOther] = useState(initialOther)

  const isOther = choice === OTHER_TRADE
  const customMatch = isOther ? matchStandardTrade(other) : null
  const submittedTrade = isOther ? (customMatch ?? other.trim()) : (choice ?? '')
  const comboboxError = isOther ? undefined : error

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <input type="hidden" name="trade" value={submittedTrade} />
      <input type="hidden" name="trade_choice" value={choice ?? ''} />

      <FieldShell
        name="trade_choice_input"
        label="Trade or specialty"
        required
        error={comboboxError}
        hint="Search or browse standard construction trades."
      >
        <Combobox.Root<string>
          items={TRADE_GROUPS}
          value={choice}
          onValueChange={(next) => setChoice(next)}
          required
          autoHighlight
          openOnInputClick
        >
          <div className="relative">
            <Combobox.Input
              id="trade_choice_input"
              placeholder="Select a trade"
              aria-invalid={comboboxError ? true : undefined}
              aria-describedby={comboboxError ? 'trade_choice_input-error' : 'trade_choice_input-hint'}
              className={cn(
                'h-10 w-full min-w-0 rounded-lg border border-input bg-background pr-16 pl-2.5 text-base text-foreground outline-none transition-colors sm:text-sm',
                'placeholder:text-muted-foreground/80',
                'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
                'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
              )}
            />
            <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
              {choice && (
                <Combobox.Clear
                  aria-label="Clear trade"
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <XIcon className="size-4" aria-hidden="true" />
                </Combobox.Clear>
              )}
              <Combobox.Trigger
                aria-label="Show trades"
                className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ChevronDownIcon className="size-4" aria-hidden="true" />
              </Combobox.Trigger>
            </div>
          </div>

          <Combobox.Portal>
            <Combobox.Positioner sideOffset={6} className="z-50 outline-none">
              <Combobox.Popup
                className={cn(
                  'w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg',
                  'origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0',
                )}
              >
                <Combobox.Empty className="px-3 py-4 text-sm text-muted-foreground empty:hidden">
                  {'No matching trade. Choose "Other / Specialty not listed" to enter your own.'}
                </Combobox.Empty>
                <Combobox.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 empty:p-0">
                  {(group: TradeGroup) => (
                    <Combobox.Group key={group.value} items={group.items} className="pb-1 last:pb-0">
                      {group.value !== 'Other' ? (
                        <Combobox.GroupLabel className="px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          {group.value}
                        </Combobox.GroupLabel>
                      ) : (
                        <div className="mx-2 my-1 border-t border-border" role="presentation" />
                      )}
                      <Combobox.Collection>
                        {(item: string) => (
                          <Combobox.Item
                            key={item}
                            value={item}
                            className={cn(
                              'flex min-h-10 cursor-default items-center justify-between gap-2 rounded-md px-2 py-2 text-sm outline-none select-none sm:min-h-9',
                              'data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                              'data-[selected]:font-medium',
                              item === OTHER_TRADE && 'text-muted-foreground data-[highlighted]:text-accent-foreground',
                            )}
                          >
                            <span className="truncate">{item}</span>
                            <Combobox.ItemIndicator className="shrink-0 text-primary">
                              <CheckIcon className="size-4" aria-hidden="true" />
                            </Combobox.ItemIndicator>
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
      </FieldShell>

      {isOther && (
        <TextField
          name="trade_other"
          label="Specialty name"
          required
          value={other}
          onChange={(event) => setOther(event.target.value)}
          error={error}
          hint={
            customMatch
              ? `This matches the standard trade "${customMatch}" and will be saved as that.`
              : 'For example: Solar Installation or Elevator & Lift.'
          }
          maxLength={120}
          autoFocus={!initialOther}
        />
      )}
    </div>
  )
}
