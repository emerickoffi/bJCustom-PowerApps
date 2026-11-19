'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/session'
import type { ActionState } from '@/lib/action-state'
import { isSupportDuration, supportDbMessage } from '@/lib/support-access-shared'

const SUPPORT_PATH = '/settings/support'

const grantSchema = z.object({
  projectId: z.string().uuid('Choose the project support should see.'),
  ticket: z.string().trim().min(3, 'Enter the support ticket number.').max(40, 'Keep the ticket number under 40 characters.'),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
  minutes: z.coerce.number().refine(isSupportDuration, 'Choose how long support can look.'),
})

/** Company admins only. The database checks the role, the project's company and the window again. */
export async function grantSupportAccessAction(input: {
  projectId: string
  ticket: string
  note?: string
  minutes: number
}): Promise<ActionState> {
  await requireAdmin()
  const parsed = grantSchema.safeParse({ ...input, note: input.note || undefined })
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: parsed.error.issues[0]?.message ?? 'Check the form.', fieldErrors }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('support_grant_access', {
    p_project: parsed.data.projectId,
    p_ticket: parsed.data.ticket,
    p_reason: parsed.data.note ?? null,
    p_minutes: parsed.data.minutes,
  })
  if (error) return { error: supportDbMessage(error.message) }

  revalidatePath(SUPPORT_PATH)
  return { success: 'Support access granted. It ends on its own when the time is up.' }
}

export async function revokeSupportAccessAction(grantId: string): Promise<ActionState> {
  await requireAdmin()
  if (!z.string().uuid().safeParse(grantId).success) return { error: 'Support access not found.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('support_revoke_access', { p_grant: grantId })
  if (error) return { error: supportDbMessage(error.message) }

  revalidatePath(SUPPORT_PATH)
  return { success: 'Support access revoked. Trefort support can no longer open this project.' }
}
