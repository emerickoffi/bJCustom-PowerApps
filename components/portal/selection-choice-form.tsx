'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, ImageIcon } from 'lucide-react'
import { choosePortalSelectionAction } from '@/app/actions/selections'
import { initialActionState } from '@/lib/action-state'
import { formatMoney } from '@/lib/financials'
import type { PortalSelectionDetail } from '@/lib/selections'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

export function SelectionChoiceForm({ selection }: { selection: PortalSelectionDetail }) {
  const router = useRouter()
  const [state, action] = useActionState(choosePortalSelectionAction, initialActionState)
  const [requestKey] = useState(() => crypto.randomUUID())
  const [picked, setPicked] = useState<string | null>(selection.selected_option_id)
  const decide = selection.can_decide && !state.success

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="selection_id" value={selection.id} />
      <input type="hidden" name="expected_version" value={selection.version} />
      <input type="hidden" name="request_key" value={requestKey} />
      <fieldset className="flex flex-col gap-3" disabled={!decide}>
        <legend className="sr-only">Options</legend>
        {selection.options.map((o) => {
          const delta = selection.allowance_cents === null ? null : o.price_cents - selection.allowance_cents
          const checked = picked === o.id
          return (
            <label
              key={o.id}
              className={cn(
                'flex cursor-pointer flex-col gap-4 rounded-xl border bg-card p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring sm:flex-row',
                checked ? 'border-primary ring-1 ring-primary/30' : 'hover:border-primary/40',
                !decide && 'cursor-default',
              )}
            >
              <input type="radio" name="option_id" value={o.id} checked={checked} onChange={() => setPicked(o.id)} className="sr-only" />
              <div className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted sm:size-32 sm:aspect-auto">
                {o.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed storage URL
                  <img src={o.photo_url} alt={o.name} className="size-full object-cover" />
                ) : (
                  <ImageIcon className="size-6 text-muted-foreground" aria-hidden="true" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="font-medium text-foreground">{o.name}</span>
                {(o.supplier || o.model_number || o.availability) && (
                  <span className="text-sm text-muted-foreground">{[o.supplier, o.model_number, o.availability].filter(Boolean).join(' · ')}</span>
                )}
                {o.description && <p className="text-pretty text-sm leading-relaxed text-foreground">{o.description}</p>}
                {o.spec_url && (
                  <a
                    href={o.spec_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
                  >
                    <FileText className="size-4" aria-hidden="true" />
                    {o.spec_name ?? 'Spec sheet'}
                  </a>
                )}
              </div>
              <div className="flex shrink-0 flex-col sm:items-end">
                <span className="text-lg font-semibold tabular-nums text-foreground">{formatMoney(o.price_cents)}</span>
                {delta !== null && (
                  <span className={cn('text-sm tabular-nums', delta > 0 ? 'text-orange-700 dark:text-orange-400' : 'text-muted-foreground')}>
                    {delta === 0 ? 'Matches allowance' : `${formatMoney(delta, { signed: true })} vs allowance`}
                  </span>
                )}
                {checked && <span className="mt-2 text-sm font-medium text-primary">{decide ? 'Selected' : 'Your choice'}</span>}
              </div>
            </label>
          )
        })}
      </fieldset>

      {decide && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="selection-comment">Comments for your builder (optional)</Label>
            <Textarea id="selection-comment" name="comment" rows={3} maxLength={2000} defaultValue={selection.homeowner_comment ?? ''} />
          </div>
          {selection.allowance_cents !== null && picked && (() => {
            const p = selection.options.find((o) => o.id === picked)
            return p && p.price_cents > selection.allowance_cents ? (
              <p className="rounded-lg bg-orange-50 p-3 text-sm text-orange-900 dark:bg-orange-950/30 dark:text-orange-200">
                This option is {formatMoney(p.price_cents - selection.allowance_cents)} over your allowance. Your builder will send a change order for the difference before it&apos;s final.
              </p>
            ) : null
          })()}
          <SubmitButton pendingLabel="Sending…" disabled={!picked} className="self-start">
            Submit my choice
          </SubmitButton>
        </>
      )}
      <FormMessage state={state} />
      {state.conflict && (
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => router.refresh()}>
          Refresh
        </Button>
      )}
    </form>
  )
}
