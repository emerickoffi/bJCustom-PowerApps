'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { WORKSPACE_COOKIE } from '@/lib/session'
import type { ActionState } from '@/lib/action-state'

const RESULT_MESSAGES: Record<string, string> = {
  signed_out: 'Your session ended. Sign in again to accept this invitation.',
  invalid: 'This invitation link is not valid. Ask your administrator for a new invitation.',
  used: 'This invitation has already been used. Ask your administrator for a new invitation.',
  revoked: 'This invitation was revoked. Ask your administrator for a new invitation.',
  expired: 'This invitation has expired. Ask your administrator for a new invitation.',
  wrong_account: 'You are signed in with a different email than the one invited. Sign out and sign in with the invited email.',
  unconfirmed: 'Confirm your email address first, then open the invitation link again.',
  suspended: 'Your access to this workspace is suspended. Contact your administrator.',
}

export async function acceptInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const token = String(formData.get('token') ?? '')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('accept_invitation', { p_token: token })
  if (error) return { error: 'The invitation could not be accepted. Please try again.' }

  const result = (data ?? {}) as { result?: string; organization_id?: string }
  if (result.result !== 'accepted' || !result.organization_id) {
    return { error: RESULT_MESSAGES[result.result ?? ''] ?? 'The invitation could not be accepted. Please try again.' }
  }

  ;(await cookies()).set(WORKSPACE_COOKIE, result.organization_id, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    maxAge: 60 * 60 * 24 * 365,
  })
  redirect('/')
}
