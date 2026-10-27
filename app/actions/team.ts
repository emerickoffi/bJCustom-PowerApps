'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/session'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { staffInviteSchema } from '@/lib/validation'

const uuid = z.uuid()

export async function inviteStaffAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin()
  const parsed = staffInviteSchema.safeParse(formValues(formData))
  if (!parsed.success) return fromZodError(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.from('invitations').insert({
    organization_id: session.organizationId,
    email: parsed.data.email,
    role: parsed.data.role,
    invited_by: session.userId,
  })
  if (error) {
    if (error.code === '23505') return { error: 'An invitation is already pending for this email.' }
    return { error: friendlyDbError(error) }
  }

  revalidatePath('/team')
  return {
    success: `Invitation created. Ask ${parsed.data.email} to sign up with that address to join your organization.`,
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  const session = await requireAdmin()
  if (!uuid.safeParse(invitationId).success) return { error: 'Invalid invitation.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('id', invitationId)
    .eq('organization_id', session.organizationId)
    .eq('status', 'pending')
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/team')
  return { success: 'Invitation revoked.' }
}

const memberUpdateSchema = z.object({
  role: z.enum(['org_admin', 'project_manager', 'builder_staff']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
})

export async function updateMemberAction(
  membershipId: string,
  update: z.infer<typeof memberUpdateSchema>,
): Promise<ActionState> {
  const session = await requireAdmin()
  if (!uuid.safeParse(membershipId).success) return { error: 'Invalid member.' }
  const parsed = memberUpdateSchema.safeParse(update)
  if (!parsed.success) return { error: 'Invalid update.' }

  const supabase = await createClient()
  const { data: target } = await supabase
    .from('organization_memberships')
    .select('user_id, role')
    .eq('id', membershipId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!target) return { error: 'Member not found.' }
  if (target.user_id === session.userId) return { error: 'You cannot change your own access.' }
  if (target.role === 'client') return { error: 'Homeowner access is managed from the client record.' }

  const { error } = await supabase
    .from('organization_memberships')
    .update(parsed.data)
    .eq('id', membershipId)
    .eq('organization_id', session.organizationId)
  if (error) return { error: friendlyDbError(error) }

  revalidatePath('/team')
  return { success: 'Team member updated.' }
}

export async function updateMemberFormAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const values = formValues(formData)
  const parsed = z
    .object({ membership_id: z.uuid(), role: z.enum(['org_admin', 'project_manager', 'builder_staff']) })
    .safeParse(values)
  if (!parsed.success) return fromZodError(parsed.error)
  return updateMemberAction(parsed.data.membership_id, { role: parsed.data.role })
}
