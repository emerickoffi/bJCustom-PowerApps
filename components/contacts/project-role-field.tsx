'use client'

import { useId, useState } from 'react'
import { PROJECT_ROLE_OPTIONS } from '@/lib/contacts'

const OTHER = '__other__'
const selectClass = 'h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm'

/** Project role picker: standard business roles plus "Other" for a custom role. Submits a single `project_role` value. */
export function ProjectRoleField({ defaultValue = '', error }: { defaultValue?: string; error?: string }) {
  const id = useId()
  const isStandard = (PROJECT_ROLE_OPTIONS as readonly string[]).includes(defaultValue)
  const [choice, setChoice] = useState(defaultValue ? (isStandard ? defaultValue : OTHER) : '')
  const [custom, setCustom] = useState(isStandard ? '' : defaultValue)

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-role`} className="text-sm font-medium">
        Project role <span className="text-destructive">*</span>
      </label>
      <select
        id={`${id}-role`}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={selectClass}
      >
        <option value="" disabled>
          Choose a role
        </option>
        {PROJECT_ROLE_OPTIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={OTHER}>Other</option>
      </select>
      {choice === OTHER ? (
        <>
          <label htmlFor={`${id}-custom`} className="sr-only">
            Custom project role
          </label>
          <input
            id={`${id}-custom`}
            name="project_role"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            maxLength={120}
            required
            placeholder="Describe the role, e.g. Insurance adjuster"
            className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm"
          />
        </>
      ) : (
        <input type="hidden" name="project_role" value={choice} />
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function StartDateField({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={`${id}-start`} className="text-sm font-medium">
        Start date
      </label>
      <input
        id={`${id}-start`}
        type="date"
        name="started_at"
        defaultValue={defaultValue ?? new Date().toISOString().slice(0, 10)}
        aria-invalid={error ? true : undefined}
        className={selectClass}
      />
      {error ? <p className="text-xs text-destructive">{error}</p> : <p className="text-xs text-muted-foreground">Defaults to today.</p>}
    </div>
  )
}
