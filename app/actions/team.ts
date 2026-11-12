'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin } from '@/lib/session'
import { INVITATION_DAYS, invitationUrl, newInvitationToken } from '@/lib/invitations'
import { fromZodError, friendlyDbError, formValues, type ActionState } from '@/lib/action-state'
import { staffInviteSchema } from '@/lib/validation'
import { resolveEmailConfig } from '@/lib/email/config'
import { queueAccountEmail, supersedeQueuedEmails } from '@/lib/email/worker'

const uuid = z.uuid()

export type InviteState = ActionState & { inviteUrl?: string; inviteEmail?: string }

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

function expiryFromNow() {
  return new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export async function inviteStaffAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireAdmin()
  const values = formValues(formData)
  const parsed = staffInviteSchema.safeParse(values)
  if (!parsed.success) return { ...fromZodError(parsed.error), values }
  const { email, role } = parsed.data

  const supabase = await createClient()
  const requested = [...new Set(formData.getAll('project_ids').map(String))].filter((id) => uuid.safeParse(id).success)
  const { data: projects } = requested.length
    ? await supabase
        .from('projects')
        .select('id')
        .eq('organization_id', session.organizationId)
        .is('archived_at', null)
        .in('id', requested)
    : { data: [] as { id: string }[] }

  const admin = createAdminClient()
  const { data: existing } = await admin.from('profiles').select('id').ilike('email', escapeLike(email)).limit(1).maybeSingle()
  if (existing) {
    const { data: membership } = await admin
      .from('organization_memberships')
      .select('id')
      .eq('organization_id', session.organizationId)
      .eq('user_id', existing.id)
      .maybeSingle()
    if (membership) return { error: 'This person already has access to your workspace.', values }
  }

  // An expired invitation would otherwise block a fresh one through the one-pending-per-email rule.
  await supabase
    .from('invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: session.userId })
    .eq('organization_id', session.organizationId)
    .eq('status', 'pending')
    .ilike('email', escapeLike(email))
    .lt('expires_at', new Date().toISOString())

  const { token, hash } = newInvitationToken()
  const expiresAt = expiryFromNow()
  const { data: created, error } = await supabase
    .from('invitations')
    .insert({
      organization_id: session.organizationId,
      email,
      role,
      invited_by: session.userId,
      token_hash: hash,
      project_ids: (projects ?? []).map((p) => p.id),
      expires_at: expiresAt,
    })
    .select('id')
    .single()
  if (error) {
    if (error.code === '23505') {
      return { error: 'An invitation is already pending for this email. Issue a new link from the pending list instead.', values }
    }
    return { error: friendlyDbError(error), values }
  }

  const emailed = await queueStaffInvitationEmail(session.organizationId, created.id, hash, email, role, token, expiresAt)
  revalidatePath('/team')
  return {
    success: emailed ? `Invitation emailed to ${email}. You can also copy the link below.` : `Invitation created for ${email}.`,
    inviteUrl: await invitationUrl(token),
    inviteEmail: email,
  }
}

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'an admin',
  project_manager: 'a project manager',
  builder_staff: 'a team member',
}

async function queueStaffInvitationEmail(
  organizationId: string,
  invitationId: string,
  tokenHash: string,
  email: string,
  role: string,
  token: string,
  expiresAt: string,
) {
  if (!resolveEmailConfig().ready) return false
  return queueAccountEmail({
    // Keyed by the token hash so each issued link is emailed at most once.
    eventKey: `invitation:${invitationId}:${tokenHash.slice(0, 16)}`,
    organizationId,
    email,
    template: 'staff_invitation',
    payload: { link: `/invite/${token}`, role_label: ROLE_LABELS[role] ?? null, expires_at: expiresAt },
  })
}

export async function reissueInvitationLinkAction(_prev: InviteState, formData: FormData): Promise<InviteState> {
  const session = await requireAdmin()
  const invitationId = String(formData.get('invitation_id') ?? '')
  if (!uuid.safeParse(invitationId).success) return { error: 'Invalid invitation.' }

  const { token, hash } = newInvitationToken()
  const supabase = await createClient()
  const expiresAt = expiryFromNow()
  const { data, error } = await supabase
    .from('invitations')
    .update({ token_hash: hash, expires_at: expiresAt })
    .eq('id', invitationId)
    .eq('organization_id', session.organizationId)
    .eq('status', 'pending')
    .neq('role', 'client')
    .select('email, role')
    .maybeSingle()
  if (error) return { error: friendlyDbError(error) }
  if (!data) return { error: 'This invitation is no longer pending.' }

  await supersedeQueuedEmails(session.organizationId, `invitation:${invitationId}:`)
  const emailed = await queueStaffInvitationEmail(session.organizationId, invitationId, hash, data.email, data.role, token, expiresAt)
  revalidatePath('/team')
  return {
    success: emailed
      ? 'New link issued and emailed. The previous link no longer works.'
      : 'New link issued. The previous link no longer works.',
    inviteUrl: await invitationUrl(token),
    inviteEmail: data.email,
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionState> {
  const session = await requireAdmin()
  if (!uuid.safeParse(invitationId).success) return { error: 'Invalid invitation.' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('invitations')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: session.userId })
    .eq('id', invitationId)
    .eq('organization_id', session.organizationId)
    .eq('status', 'pending')
  if (error) return { error: friendlyDbError(error) }

  await supersedeQueuedEmails(session.organizationId, `invitation:${invitationId}:`)
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
