'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/session'
import { friendlyDbError } from '@/lib/action-state'

type Result = { error?: string; success?: string; projectId?: string }

function refresh() {
  revalidatePath('/dashboard')
  revalidatePath('/projects')
  revalidatePath('/clients')
}

/** Adds the sample job (or fills in modules switched on since it was added). Safe to call more than once. */
export async function loadSampleProjectAction(): Promise<Result> {
  const session = await requireAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('load_sample_project', { p_org: session.organizationId })
  if (error) return { error: friendlyDbError(error) }
  refresh()
  return { success: 'Sample project ready.', projectId: data as string }
}

/** Archives the sample job and client. Nothing is deleted. */
export async function removeSampleProjectAction(): Promise<Result> {
  const session = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase.rpc('remove_sample_project', { p_org: session.organizationId })
  if (error) return { error: friendlyDbError(error) }
  refresh()
  return { success: 'Sample project archived.' }
}

export async function dismissGettingStartedAction(): Promise<Result> {
  const session = await requireAdmin()
  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_settings')
    .update({ getting_started_dismissed_at: new Date().toISOString() })
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }
  revalidatePath('/dashboard')
  return {}
}
