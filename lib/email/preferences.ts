import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { resolveEmailConfig } from './config'

export async function loadEmailPreferences(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notification_email_preferences')
    .select('category, email_enabled')
    .eq('user_id', userId)
  const saved: Record<string, boolean> = {}
  for (const row of data ?? []) saved[row.category] = row.email_enabled
  return { saved, deliveryActive: resolveEmailConfig().ready }
}
