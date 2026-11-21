'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { setProjectWarrantyTemplateAction } from '@/app/actions/warranty-templates'

/** Before completion: which of the company's warranties this home will get. */
export function ProjectWarrantyPicker({
  projectId,
  options,
  value,
}: {
  projectId: string
  options: { id: string; name: string; is_default: boolean }[]
  value: string | null
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [selected, setSelected] = useState(value ?? '')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="project-warranty" className="text-sm font-medium text-foreground">
        Warranty for this home
      </label>
      <select
        id="project-warranty"
        value={selected}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.value
          const previous = selected
          setSelected(next)
          setMessage(null)
          start(async () => {
            const r = await setProjectWarrantyTemplateAction(projectId, next || null)
            if (!r.ok) setSelected(previous)
            setMessage({ ok: r.ok, text: r.ok ? r.message : r.error })
            if (r.ok) router.refresh()
          })
        }}
        className="h-10 max-w-md rounded-control border border-input bg-background px-2.5 text-sm"
      >
        <option value="">Company default{options.find((o) => o.is_default) ? ` (${options.find((o) => o.is_default)!.name})` : ''}</option>
        {options
          .filter((o) => !o.is_default)
          .map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
      </select>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
          {message.text}
        </p>
      )}
    </div>
  )
}
