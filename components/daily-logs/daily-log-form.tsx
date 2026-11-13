'use client'

import { forwardRef, useCallback, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import { AlertTriangle, CalendarDays, Camera, ChevronDown, CloudSun, HardHat, Link2, ListChecks, Plus, Trash2, Truck, type LucideIcon } from 'lucide-react'
import { saveDailyLogAction } from '@/app/actions/daily-logs'
import { DAILY_LOG_ACTIVITY_LIMIT, DAILY_LOG_CREW_LIMIT, dailyLogPath } from '@/lib/daily-logs'
import type { ScheduleActivityOption } from '@/lib/daily-logs-data'
import { ScheduleActivityPicker } from '@/components/daily-logs/schedule-activity-picker'
import { SaveBanners, SaveStatus, useResilientSave, type ResilientSave } from '@/components/shared/resilient-save'
import { FormActions, FormSection, TextAreaField, TextField } from '@/components/shared/form-field'
import { FormMessage, SubmitButton } from '@/components/shared/form-message'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFloatingCameraSaveFirst } from '@/components/camera/floating-camera'

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

type ActivityOption = ScheduleActivityOption

const COMPACT_TEXTAREA = 'min-h-16'
const DELAY_FIELDS = ['delay_description', 'delay_reason', 'delay_impact', 'corrective_actions', 'safety_observations'] as const
const MATERIAL_FIELDS = ['materials_delivered', 'equipment_used', 'delivery_notes'] as const

const blankCrew = { trade: '', crew_size: '', hours_worked: '', notes: '', subcontractor_company_id: '' }

type FormProps = {
  projectId: string
  defaults: DailyLogFormDefaults
  activities: ActivityOption[]
  companies?: CompanyOption[]
  maxDate: string
  cancelHref: string
}

const SCALAR_FIELDS = [
  'log_date',
  'temperature_f',
  'weather_conditions',
  'weather_impact',
  'site_conditions',
  'work_performed',
  'progress_notes',
  'work_planned_next',
  'materials_delivered',
  'equipment_used',
  'delivery_notes',
  'delay_description',
  'delay_reason',
  'delay_impact',
  'corrective_actions',
  'safety_observations',
] as const

/** Rebuilds form defaults from entries kept on this device, including repeated crew rows and activities. */
function defaultsFromEntries(base: DailyLogFormDefaults, entries: [string, string][]): DailyLogFormDefaults {
  const all = (k: string) => entries.filter(([key]) => key === k).map(([, v]) => v)
  const first = (k: string) => entries.find(([key]) => key === k)?.[1]
  const trades = all('crew_trade')
  const sizes = all('crew_size')
  const hours = all('crew_hours')
  const notes = all('crew_notes')
  const companyIds = all('crew_company')
  const next = { ...base, activityIds: all('activity_ids') } as DailyLogFormDefaults
  for (const f of SCALAR_FIELDS) next[f] = first(f) ?? ''
  next.crews = trades.map((trade, i) => {
    const companyId = companyIds[i] ?? ''
    const saved = base.crews.find((c) => c.subcontractor_company_id === companyId && companyId)
    return { trade, crew_size: sizes[i] ?? '', hours_worked: hours[i] ?? '', notes: notes[i] ?? '', subcontractor_company_id: companyId, company_name: saved?.company_name }
  })
  return next
}

export function DailyLogForm(props: FormProps) {
  const save = useResilientSave({
    kind: 'daily_log',
    formType: 'daily_log',
    projectId: props.projectId,
    recordId: props.defaults.id ?? null,
    baseRevision: props.defaults.version ? String(props.defaults.version) : null,
    action: saveDailyLogAction,
  })
  const defaults = save.restored ? defaultsFromEntries(props.defaults, save.restored.entries) : props.defaults
  return (
    <div className="flex flex-col gap-4">
      <SaveBanners save={save} latestHref={props.defaults.id ? dailyLogPath(props.projectId, props.defaults.id) : undefined} />
      <DailyLogFormBody key={save.restoreKey} {...props} defaults={defaults} save={save} />
    </div>
  )
}

function DailyLogFormBody({ projectId, defaults, activities, companies = [], maxDate, cancelHref, save }: FormProps & { save: ResilientSave }) {
  const showCompany = companies.length > 0 || defaults.crews.some((c) => c.subcontractor_company_id)
  const { state, formAction: action, pending, formRef } = save
  const photosSubmitRef = useRef<HTMLButtonElement>(null)
  const photosInlineRef = useRef<HTMLDivElement>(null)
  // Submits through the existing "Save and add photos" button so the same validation and
  // `intent=photos` redirect apply; a failed save stays on this form with values intact.
  const saveAndAddPhotos = useCallback(() => {
    const submitter = photosSubmitRef.current
    if (submitter) formRef.current?.requestSubmit(submitter)
  }, [])
  useFloatingCameraSaveFirst({
    label: defaults.id ? 'Unsaved changes' : 'Unsaved daily log',
    actionLabel: defaults.id ? 'Save Changes & Take Photo' : 'Save Draft & Take Photo',
    enabled: true,
    disabled: pending,
    onSelect: saveAndAddPhotos,
    inline: photosInlineRef,
  })
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
  const [logDate, setLogDate] = useState(() => val('log_date'))

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-6">
      <input type="hidden" name="project_id" value={projectId} />
      {defaults.id && <input type="hidden" name="id" value={defaults.id} />}
      {defaults.version && <input type="hidden" name="version" value={defaults.version} />}

      <FormSection title="Daily overview" icon={CloudSun} description="Date and the weather you observed on site. Weather is saved as entered and never looked up automatically.">
        <TextField
          name="log_date"
          label="Log date"
          type="date"
          required
          max={maxDate}
          defaultValue={val('log_date')}
          onChange={(e) => setLogDate(e.target.value)}
          error={fe.log_date}
        />
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
        <TextAreaField name="site_conditions" label="Site conditions" defaultValue={val('site_conditions')} error={fe.site_conditions} className="sm:col-span-2" maxLength={2000} rows={1} inputClassName={COMPACT_TEXTAREA} />
      </FormSection>

      <FormSection title="Work completed" icon={ListChecks} description="What happened today and what is planned next.">
        <TextAreaField name="work_performed" label="Work performed" defaultValue={val('work_performed')} error={fe.work_performed} className="sm:col-span-2" maxLength={8000} rows={3} inputClassName="min-h-24" />
        <TextAreaField name="progress_notes" label="Progress notes" defaultValue={val('progress_notes')} error={fe.progress_notes} maxLength={4000} rows={2} inputClassName={COMPACT_TEXTAREA} />
        <TextAreaField name="work_planned_next" label="Planned next work" defaultValue={val('work_planned_next')} error={fe.work_planned_next} maxLength={4000} rows={2} inputClassName={COMPACT_TEXTAREA} />
      </FormSection>

      <FormSection title="Crew & subcontractors" icon={HardHat} description="Trades and crew counts observed today. This is a site record, not a timesheet or payroll entry.">
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

      <FormSection title="Related schedule activities" icon={Link2} description="Link today's work to activities in your project schedule.">
        <ScheduleActivityPicker
          activities={activities}
          selected={selected}
          onChange={setSelected}
          logDate={logDate}
          limit={DAILY_LOG_ACTIVITY_LIMIT}
          error={fe.activity_ids}
        />
      </FormSection>

      <FormSection
        title="Site photos"
        icon={Camera}
        description={
          defaults.id
            ? 'Photos are managed on the log page. Save your changes, then take or upload photos there.'
            : 'Photos attach to a saved log. Use Save and add photos to save this draft and go straight to the camera and upload options.'
        }
      >
        <div ref={photosInlineRef} className="flex flex-col gap-3 rounded-lg border border-dashed border-border bg-muted/40 p-4 sm:col-span-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">Take site photos with your camera or upload them from your device, then add captions.</p>
          <SaveAndAddPhotosButton ref={photosSubmitRef} />
        </div>
      </FormSection>

      <section aria-labelledby="additional-details-heading" className="flex flex-col gap-3">
        <h2 id="additional-details-heading" className="px-1 text-sm font-semibold text-foreground">
          Additional details
        </h2>
        <CollapsibleSection
          title="Delays & safety"
          icon={AlertTriangle}
          summary="Delays, corrective actions, and safety observations. A log is flagged as delayed when a delay description is entered."
          filled={DELAY_FIELDS.some((k) => Boolean(val(k)))}
          hasError={DELAY_FIELDS.some((k) => Boolean(fe[k]))}
        >
          <TextAreaField name="delay_description" label="Delay description" defaultValue={val('delay_description')} error={fe.delay_description} className="sm:col-span-2" maxLength={4000} rows={1} inputClassName={COMPACT_TEXTAREA} />
          <TextField name="delay_reason" label="Delay reason" defaultValue={val('delay_reason')} error={fe.delay_reason} maxLength={1000} hint="e.g. Weather, inspection, material" />
          <TextField name="delay_impact" label="Delay impact" defaultValue={val('delay_impact')} error={fe.delay_impact} maxLength={1000} hint="e.g. Half day lost on framing" />
          <TextAreaField name="corrective_actions" label="Corrective actions" defaultValue={val('corrective_actions')} error={fe.corrective_actions} maxLength={4000} rows={1} inputClassName={COMPACT_TEXTAREA} />
          <TextAreaField name="safety_observations" label="Safety observations" defaultValue={val('safety_observations')} error={fe.safety_observations} maxLength={4000} rows={1} inputClassName={COMPACT_TEXTAREA} />
        </CollapsibleSection>
        <CollapsibleSection
          title="Materials & equipment"
          icon={Truck}
          summary="Deliveries received and equipment on site."
          filled={MATERIAL_FIELDS.some((k) => Boolean(val(k)))}
          hasError={MATERIAL_FIELDS.some((k) => Boolean(fe[k]))}
        >
          <TextAreaField name="materials_delivered" label="Materials delivered" defaultValue={val('materials_delivered')} error={fe.materials_delivered} maxLength={4000} rows={1} inputClassName={COMPACT_TEXTAREA} />
          <TextAreaField name="equipment_used" label="Equipment on site" defaultValue={val('equipment_used')} error={fe.equipment_used} maxLength={4000} rows={1} inputClassName={COMPACT_TEXTAREA} />
          <TextAreaField name="delivery_notes" label="Delivery notes" defaultValue={val('delivery_notes')} error={fe.delivery_notes} className="sm:col-span-2" maxLength={2000} rows={1} inputClassName={COMPACT_TEXTAREA} />
        </CollapsibleSection>
      </section>

      <FormActions
        message={
          <div className="flex flex-col gap-2">
            <SaveStatus save={save} />
            <FormMessage state={state} />
          </div>
        }
        note="Saved logs stay as drafts until you finalize them."
      >
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

const SaveAndAddPhotosButton = forwardRef<HTMLButtonElement>(function SaveAndAddPhotosButton(_props, ref) {
  const { pending } = useFormStatus()
  return (
    <Button ref={ref} type="submit" name="intent" value="photos" variant="outline" size="lg" disabled={pending} className="h-12 w-full shrink-0 sm:h-11 sm:w-auto">
      <Camera aria-hidden="true" />
      {pending ? 'Saving...' : 'Save and add photos'}
    </Button>
  )
})

/** Native details element so collapsed fields stay mounted and keep submitting their typed values. */
function CollapsibleSection({
  title,
  summary,
  icon: Icon,
  filled,
  hasError,
  children,
}: {
  title: string
  summary: string
  icon: LucideIcon
  filled: boolean
  hasError: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(filled || hasError)
  return (
    <details
      open={open || hasError}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group rounded-xl border border-border/80 bg-card shadow-xs"
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-xl p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {title}
            {filled && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">Has entries</span>}
          </span>
          <span className="text-sm leading-relaxed text-pretty text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="grid gap-5 border-t border-border/60 p-5 sm:grid-cols-2 sm:p-6">{children}</div>
    </details>
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
