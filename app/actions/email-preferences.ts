'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getSession, requireAdmin } from '@/lib/session'
import { OPTIONAL_EMAIL_CATEGORIES } from '@/lib/email/categories'
import { friendlyDbError, type ActionState } from '@/lib/action-state'

export async function saveEmailPreferencesAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getSession()
  if (!session) return { error: 'Your session expired. Sign in again.' }

  const now = new Date().toISOString()
  const rows = OPTIONAL_EMAIL_CATEGORIES.map((c) => ({
    user_id: session.userId,
    category: c.key,
    email_enabled: formData.get(c.key) === 'on',
    updated_at: now,
  }))

  const supabase = await createClient()
  const { error } = await supabase.from('notification_email_preferences').upsert(rows, { onConflict: 'user_id,category' })
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/profile')
  revalidatePath('/portal/profile')
  revalidatePath('/sub/profile')
  return { success: 'Email preferences saved.' }
}

export async function retryFailedEmailAction(id: number): Promise<ActionState> {
  await requireAdmin()
  if (!z.number().int().positive().safeParse(id).success) return { error: 'Invalid email.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('retry_failed_email', { p_id: id })
  if (error) return { error: friendlyDbError(error) }
  if (data !== true) return { error: 'This email can no longer be retried.' }
  revalidatePath('/settings')
  return { success: 'Email queued to send again.' }
}
