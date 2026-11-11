'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authCallbackUrl, requestOrigin } from '@/lib/invitations'
import type { ActionState } from '@/lib/action-state'

const NEUTRAL_RESET = 'If an account exists for that email, a password reset link is on its way. Check your inbox and spam folder.'

export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = z.email().trim().toLowerCase().max(254).safeParse(formData.get('email'))
  if (!parsed.success) return { error: 'Enter a valid email address.', values: { email: String(formData.get('email') ?? '') } }

  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: authCallbackUrl(await requestOrigin(), '/auth/update-password'),
  })
  if (error && (error.status === 429 || error.code === 'over_email_send_rate_limit')) {
    return { error: 'Too many requests. Please wait a few minutes and try again.' }
  }
  if (error) console.error('Password reset request failed', error.code ?? error.status)
  return { success: NEUTRAL_RESET }
}

const passwordSchema = z
  .object({
    password: z.string().min(8, 'Use at least 8 characters.').max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match.', path: ['confirm'] })

export async function updatePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = passwordSchema.safeParse({ password: formData.get('password'), confirm: formData.get('confirm') })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Check your password.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Your reset link has expired. Request a new one.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) {
    if (error.code === 'weak_password') return { error: 'Please choose a stronger password.' }
    if (error.code === 'same_password') return { error: 'Choose a password different from your current one.' }
    return { error: 'Your password could not be updated. Request a new reset link and try again.' }
  }

  // Accounts from the retired temporary-password flow finish activation once they set their own password.
  const admin = createAdminClient()
  await admin.from('organization_memberships').update({ activation_required: false }).eq('user_id', user.id).eq('activation_required', true)
  if (user.app_metadata?.temp_credential_expires_at) {
    await admin.auth.admin.updateUserById(user.id, { app_metadata: { temp_credential_expires_at: null } })
  }

  redirect('/')
}
