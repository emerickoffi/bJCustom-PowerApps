'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarDays, CloudSun, HardHat, ListChecks, Plus, Trash2, Truck } from 'lucide-react'
import { saveDailyLogAction } from '@/app/actions/daily-logs'
import { initialActionState } from '@/lib/action-state'
import { DAILY_LOG_CREW_LIMIT } from '@/lib/daily-logs'
import { FormActions, FormSection, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type CrewRow = {
  key: number
  trade: string
  crew_size: string
  hours_worked: string
  notes: string
  subcontractor_company_id: string
  /** Snapshot name for a saved company that is no longer in the active list. */
  company_name?: string
}
type CompanyOption = { id: string; company_name: string; trade: string; assigned?: boolean }

export type DailyLogFormDefaults = {
  id?: string
  version?: number
  log_date: string
  temperature_f: string
  crews: Omit<CrewRow, 'key'>[]
  activityIds: string[]
} & Record<
  | 'weather_conditions'
  | 'weather_impact'
  | 'site_conditions'
  | 'work_performed'
  | 'progress_notes'
  | 'work_planned_next'
  | 'materials_delivered'
  | 'equipment_used'
  | 'delivery_notes'
  | 'delay_description'
  | 'delay_reason'
  | 'delay_impact'
  | 'corrective_actions'
  | 'safety_observations',
  string
>

type ActivityOption = { id: string; name: string; phase: string | null }

const blankCrew = { trade: '', crew_size: '', hours_worked: '', notes: '', subcontractor_company_id: '' }

export function DailyLogForm({
  projectId,
  defaults,
  activities,
  companies = [],
  maxDate,
  cancelHref,
}: {
  projectId: string
  defaults: DailyLogFormDefaults
  activities: ActivityOption[]
  companies?: CompanyOption[]
  maxDate: string
  cancelHref: string
}) {
  const showCompany = companies.length > 0 || defaults.crews.some((c) => c.subcontractor_company_id)
  const [state, action] = useActionState(saveDailyLogAction, initialActionState)
  const [crews, setCrews] = useState<CrewRow[]>(() => (defaults.crews.length ? defaults.crews : [blankCrew]).map((c, i) => ({ ...c, key: i })))
  const [nextKey, setNextKey] = useState(crews.length)
  const [selected, setSelected] = useState(() => new Set(defaults.activityIds))
  const v = state.values
  const fe = state.fieldErrors ?? {}
  const val = (k: keyof DailyLogFormDefaults) => v?.[k] ?? (defaults[k] as string)

  const updateCrew = (key: number, field: keyof Omit<CrewRow, 'key'>, value: string) =>
    setCrews((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  const addCrew = () => {
    setCrews((rows) => [...rows, { ...blankCrew, key: nextKey }])
    setNextKey((k) => k + 1)
  }
  const toggleActivity = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="project_id" value={projectId} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.version && <input type="hidden" name="version" value={defaults.version} />}

      <FormSection title="Date and weather" icon={CloudSun} description="Record the weather you observed on site. It is saved as entered and never looked up automatically.">
        <TextField name="log_date" label="Log date" type="date" required max={maxDate} defaultValue={val('log_date')} error={fe.log_date} />
        <TextField
          name="temperature_f"
          label="Temperature (°F)"
          inputMode="numeric"
          defaultValue={val('temperature_f')}
          error={fe.temperature_f}
          hint="Optional. Whole degrees."
        />
        <TextField name="weather_conditions" label="Conditions" defaultValue={val('weather_conditions')} error={fe.weather_conditions} hint="e.g. Clear, light wind" maxLength={200} />
        <TextField name="weather_impact" label="Weather impact" defaultValue={val('weather_impact')} error={fe.weather_impact} hint="Leave blank if none" maxLength={2000} />
        <TextAreaField name="site_conditions" label="Site conditions" defaultValue={val('site_conditions')} error={fe.site_conditions} className="sm:col-span-2" maxLength={2000} rows={2} />
      </FormSection>

      <FormSection title="Crews on site" icon={HardHat} description="Trades and crew counts observed today. This is a site record, not a timesheet or payroll entry.">
        <div className="flex flex-col gap-3 sm:col-span-2">
          {crews.map((row, i) => (
            <fieldset
              key={row.key}
              className={
                showCompany
                  ? 'grid gap-3 rounded-lg border border-border/70 bg-background p-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem_6rem_minmax(0,2fr)_auto] sm:items-end'
                  : 'grid gap-3 rounded-lg border border-border/70 bg-background p-3 sm:grid-cols-[minmax(0,2fr)_6rem_6rem_minmax(0,2fr)_auto] sm:items-end'
              }
            >
              <legend className="sr-only">Crew entry {i + 1}</legend>
              {showCompany ? (
                <CompanySelect
                  value={row.subcontractor_company_id}
                  companies={companies}
                  savedName={row.company_name}
                  onChange={(id) => {
                    const company = companies.find((c) => c.id === id)
                    setCrews((rows) =>
                      rows.map((r) => (r.key === row.key ? { ...r, subcontractor_company_id: id, trade: r.trade.trim() || !company ? r.trade : company.trade } : r)),
                    )
                  }}
                />
              ) : (
                <input type="hidden" name="crew_company" value="" />
              )}
              <CrewInput label="Trade or crew" name="crew_trade" value={row.trade} onChange={(x) => updateCrew(row.key, 'trade', x)} maxLength={120} placeholder="Framing" />
              <CrewInput label="Crew size" name="crew_size" value={row.crew_size} onChange={(x) => updateCrew(row.key, 'crew_size', x)} inputMode="numeric" />
              <CrewInput label="Hours" name="crew_hours" value={row.hours_worked} onChange={(x) => updateCrew(row.key, 'hours_worked', x)} inputMode="decimal" />
              <CrewInput label="Notes" name="crew_notes" value={row.notes} onChange={(x) => updateCrew(row.key, 'notes', x)} maxLength={1000} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="justify-self-end"
                onClick={() => setCrews((rows) => rows.filter((r) => r.key !== row.key))}
                aria-label={`Remove crew entry ${i + 1}`}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </fieldset>
          ))}
          {fe.crews && (
            <p role="alert" className="text-sm text-destructive">
              {fe.crews}
            </p>
          )}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={addCrew} disabled={crews.length >= DAILY_LOG_CREW_LIMIT}>
              <Plus aria-hidden="true" />
              Add crew
            </Button>
          </div>
        </div>
      </FormSection>

      <FormSection title="Work" icon={ListChecks} description="What happened today and what is planned next. Linking activities does not change the schedule.">
        <TextAreaField name="work_performed" label="Work performed" defaultValue={val('work_performed')} error={fe.work_performed} className="sm:col-span-2" maxLength={8000} rows={4} />
        <TextAreaField name="progress_notes" label="Progress notes" defaultValue={val('progress_notes')} error={fe.progress_notes} maxLength={4000} />
        <TextAreaField name="work_planned_next" label="Planned next work" defaultValue={val('work_planned_next')} error={fe.work_planned_next} maxLength={4000} />
        <fieldset className="flex flex-col gap-2 sm:col-span-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Related schedule activities</legend>
          {activities.length === 0 ? (
            <p className="text-sm text-muted-foreground">This project has no schedule activities yet.</p>
          ) : (
            <div className="grid max-h-64 gap-1 overflow-y-auto rounded-lg border border-border/70 p-2 sm:grid-cols-2">
              {activities.map((a) => (
                <label key={a.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-muted">
                  <input
                    type="checkbox"
                    name="activity_ids"
                    value={a.id}
                    checked={selected.has(a.id)}
                    onChange={() => toggleActivity(a.id)}
                    className="size-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-foreground">{a.name}</span>
                    {a.phase && <span className="block truncate text-xs text-muted-foreground">{a.phase}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
          {fe.activity_ids && (
            <p role="alert" className="text-sm text-destructive">
              {fe.activity_ids}
            </p>
          )}
        </fieldset>
      </FormSection>

      <FormSection title="Materials and equipment" icon={Truck}>
        <TextAreaField name="materials_delivered" label="Materials delivered" defaultValue={val('materials_delivered')} error={fe.materials_delivered} maxLength={4000} />
        <TextAreaField name="equipment_used" label="Equipment on site" defaultValue={val('equipment_used')} error={fe.equipment_used} maxLength={4000} />
        <TextAreaField name="delivery_notes" label="Delivery notes" defaultValue={val('delivery_notes')} error={fe.delivery_notes} className="sm:col-span-2" maxLength={2000} rows={2} />
      </FormSection>

      <FormSection title="Delays and safety" icon={AlertTriangle} description="A log is flagged as delayed when a delay description is entered.">
        <TextAreaField name="delay_description" label="Delay description" defaultValue={val('delay_description')} error={fe.delay_description} className="sm:col-span-2" maxLength={4000} rows={2} />
        <TextField name="delay_reason" label="Delay reason" defaultValue={val('delay_reason')} error={fe.delay_reason} maxLength={1000} hint="e.g. Weather, inspection, material" />
        <TextField name="delay_impact" label="Delay impact" defaultValue={val('delay_impact')} error={fe.delay_impact} maxLength={1000} hint="e.g. Half day lost on framing" />
        <TextAreaField name="corrective_actions" label="Corrective actions" defaultValue={val('corrective_actions')} error={fe.corrective_actions} maxLength={4000} />
        <TextAreaField name="safety_observations" label="Safety observations" defaultValue={val('safety_observations')} error={fe.safety_observations} maxLength={4000} />
      </FormSection>

      <FormActions message={<FormMessage state={state} />} note="Saved logs stay as drafts until you finalize them.">
        <Link href={cancelHref} className={buttonVariants({ variant: 'ghost', size: 'lg' })}>
          Cancel
        </Link>
        <SubmitButton pendingLabel="Saving draft...">
          <CalendarDays aria-hidden="true" />
          Save draft
        </SubmitButton>
      </FormActions>
    </form>
  )
}

function CompanySelect({
  value,
  companies,
  savedName,
  onChange,
}: {
  value: string
  companies: CompanyOption[]
  savedName?: string
  onChange: (id: string) => void
}) {
  const missing = value && !companies.some((c) => c.id === value)
  const assigned = companies.filter((c) => c.assigned)
  const others = companies.filter((c) => !c.assigned)
  const renderOption = (c: CompanyOption) => (
    <option key={c.id} value={c.id}>
      {c.trade ? `${c.company_name} · ${c.trade}` : c.company_name}
    </option>
  )
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
      Subcontractor
      <select
        name="crew_company"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">Own crew / not listed</option>
        {missing && <option value={value}>{`${savedName ?? 'Saved subcontractor'} (inactive)`}</option>}
        {assigned.length > 0 ? (
          <>
            <optgroup label="Assigned to this project">{assigned.map(renderOption)}</optgroup>
            {others.length > 0 && <optgroup label="Other active subcontractors">{others.map(renderOption)}</optgroup>}
          </>
        ) : (
          companies.map(renderOption)
        )}
      </select>
    </label>
  )
}

function CrewInput({
  label,
  name,
  value,
  onChange,
  ...props
}: { label: string; name: string; value: string; onChange: (v: string) => void } & Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value' | 'name'>) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input name={name} value={value} onChange={(e) => onChange(e.target.value)} className="h-11" {...props} />
    </label>
  )
}
