'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePlatformAdmin } from '@/lib/platform'
import type { ActionState } from '@/lib/action-state'
import { supportDbMessage } from '@/lib/support-access-shared'

/** Owner console: close a help request when it is answered, or reopen it. */
export async function setHelpRequestStatusAction(ticketId: string, status: 'open' | 'closed'): Promise<ActionState> {
  await requirePlatformAdmin()
  if (!z.string().uuid().safeParse(ticketId).success) return { error: 'Help request not found.' }
  if (status !== 'open' && status !== 'closed') return { error: 'Unknown status.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('platform_set_support_ticket_status', { p_ticket: ticketId, p_status: status })
  if (error) return { error: supportDbMessage(error.message) }

  revalidatePath('/platform/support')
  return { success: status === 'closed' ? 'Help request closed.' : 'Help request reopened.' }
}
