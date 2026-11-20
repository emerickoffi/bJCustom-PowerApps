'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin, requireManager, requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getOrgFeatures } from '@/lib/features'
import { getOrgTimeZone } from '@/lib/daily-logs-data'
import { TIME_COST_CATEGORIES, parseManualEntry, zonedToUtc } from '@/lib/time-tracking'

export type TimeActionResult = { ok: true; message?: string } | { ok: false; error: string }

const uuid = z.string().uuid()
const category = z.enum(TIME_COST_CATEGORIES as unknown as [string, ...string[]])
const notes = z.string().trim().max(1000).optional().transform((v) => v || null)

/** Database rule messages are written for people; anything else becomes a generic message. */
function friendly(error: { code?: string; message?: string } | null, fallback: string): string {
  if (error?.code === 'P0001' && error.message) return error.message
  if (error?.code === '23505') return 'You are already clocked in. Clock out first.'
  return fallback
}

async function ensureEnabled(organizationId: string) {
  const features = await getOrgFeatures(organizationId)
  return Boolean(features.time_tracking)
}

function refresh() {
  revalidatePath('/time')
  revalidatePath('/time/review')
}

export async function clockInAction(input: { projectId: string; category: string; notes?: string }): Promise<TimeActionResult> {
  const session = await requireStaff()
  if (!(await ensureEnabled(session.organizationId))) return { ok: false, error: 'Time tracking is turned off for your company.' }
  const parsed = z.object({ projectId: uuid, category, notes }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Choose a project and cost code.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('time_clock_in', { p_project: parsed.data.projectId, p_category: parsed.data.category, p_notes: parsed.data.notes })
  if (error) return { ok: false, error: friendly(error, 'You could not be clocked in. Try again.') }
  refresh()
  return { ok: true, message: 'Clocked in.' }
}

export async function clockOutAction(input: { breakMinutes?: number; notes?: string; endDate?: string; endTime?: string }): Promise<TimeActionResult> {
  const session = await requireStaff()
  const parsed = z
    .object({
      breakMinutes: z.coerce.number().int().min(0).max(720).default(0),
      notes,
      endDate: z.string().optional(),
      endTime: z.string().optional(),
    })
    .safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Break must be between 0 and 720 minutes.' }
  let endedAt: string | null = null
  if (parsed.data.endDate && parsed.data.endTime) {
    const tz = await getOrgTimeZone(session.organizationId)
    const end = zonedToUtc(parsed.data.endDate, parsed.data.endTime, tz)
    if (!end) return { ok: false, error: 'Enter the time you stopped.' }
    endedAt = end.toISOString()
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('time_clock_out', {
    p_ended_at: endedAt,
    p_break_minutes: parsed.data.breakMinutes,
    p_notes: parsed.data.notes,
  })
  if (error) return { ok: false, error: friendly(error, 'You could not be clocked out. Try again.') }
  refresh()
  return { ok: true, message: 'Clocked out. Your time is waiting for approval.' }
}

const entrySchema = z.object({
  id: uuid.optional(),
  projectId: uuid,
  category,
  date: z.string(),
  start: z.string(),
  end: z.string(),
  breakMinutes: z.union([z.string(), z.number()]).default(0),
  notes,
  userId: uuid.optional(),
})

export async function saveTimeEntryAction(input: z.input<typeof entrySchema>): Promise<TimeActionResult> {
  const session = await requireStaff()
  if (!(await ensureEnabled(session.organizationId))) return { ok: false, error: 'Time tracking is turned off for your company.' }
  const parsed = entrySchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Check the project, cost code and times.' }
  const tz = await getOrgTimeZone(session.organizationId)
  const times = parseManualEntry(parsed.data, tz)
  if (!times.ok) return { ok: false, error: times.error }
  const supabase = await createClient()
  const { error } = await supabase.rpc('time_entry_save', {
    p_id: parsed.data.id ?? null,
    p_project: parsed.data.projectId,
    p_category: parsed.data.category,
    p_started_at: times.startedAt,
    p_ended_at: times.endedAt,
    p_break_minutes: times.breakMinutes,
    p_notes: parsed.data.notes,
    p_user: parsed.data.userId ?? null,
  })
  if (error) return { ok: false, error: friendly(error, 'The time entry could not be saved. Try again.') }
  refresh()
  return { ok: true, message: parsed.data.id ? 'Time entry updated.' : 'Time entry added.' }
}

export async function deleteTimeEntryAction(id: string): Promise<TimeActionResult> {
  await requireStaff()
  if (!uuid.safeParse(id).success) return { ok: false, error: 'This page is out of date. Reload and try again.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('time_entry_delete', { p_id: id })
  if (error) return { ok: false, error: friendly(error, 'The time entry could not be deleted.') }
  refresh()
  return { ok: true, message: 'Time entry deleted.' }
}

export async function reviewTimeEntriesAction(input: { ids: string[]; decision: 'approve' | 'reject' | 'reopen'; note?: string }): Promise<TimeActionResult> {
  await requireManager()
  const parsed = z
    .object({ ids: z.array(uuid).min(1).max(500), decision: z.enum(['approve', 'reject', 'reopen']), note: z.string().trim().max(500).optional() })
    .safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Select at least one entry.' }
  if (parsed.data.decision === 'reject' && !parsed.data.note) return { ok: false, error: 'Say what needs to change.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('time_entries_review', {
    p_ids: parsed.data.ids,
    p_decision: parsed.data.decision,
    p_note: parsed.data.note ?? null,
  })
  if (error) return { ok: false, error: friendly(error, 'The entries could not be updated. Try again.') }
  refresh()
  const count = Number(data ?? 0)
  const verb = parsed.data.decision === 'approve' ? 'approved' : parsed.data.decision === 'reject' ? 'sent back' : 'reopened'
  return { ok: true, message: `${count} ${count === 1 ? 'entry' : 'entries'} ${verb}.` }
}

export async function setLaborRateAction(input: { userId: string; hourly: string }): Promise<TimeActionResult> {
  const session = await requireAdmin()
  const parsed = z
    .object({ userId: uuid, hourly: z.string().trim().regex(/^\d{1,4}(\.\d{1,2})?$/, 'Enter an hourly amount like 45 or 42.50') })
    .safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter an hourly amount.' }
  const cents = Math.round(Number(parsed.data.hourly) * 100)
  if (cents > 100000) return { ok: false, error: 'Hourly cost must be $1,000 or less.' }
  const supabase = await createClient()
  const { error } = await supabase
    .from('labor_rates')
    .upsert({ organization_id: session.organizationId, user_id: parsed.data.userId, hourly_cost_cents: cents }, { onConflict: 'organization_id,user_id' })
  if (error) return { ok: false, error: friendly(error, 'The rate could not be saved.') }
  revalidatePath('/time/rates')
  return { ok: true, message: 'Rate saved. It applies to time approved from now on.' }
}
