'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requirePlatformAdmin } from '@/lib/platform'
import type { ActionState } from '@/lib/action-state'
import { FEATURES, featureLabel, isSwitchable, type FeatureKey } from '@/lib/feature-registry'
import { createAdminClient } from '@/lib/supabase/admin'
import { createPercentCoupon, getCompanyDiscount, setCompanyDiscount } from '@/lib/billing-discounts'
import { describeCoupon } from '@/lib/billing-discounts-shared'

const uuid = z.string().uuid()
const featureKeys = FEATURES.filter(isSwitchable).map((f) => f.key) as [FeatureKey, ...FeatureKey[]]

/** Database messages from the owner functions are written for people; pass them through, minus codes. */
function ownerError(message: string | undefined): string {
  if (!message) return 'Something went wrong. Try again.'
  return message.replace(/^.*?ERROR:\s*/i, '').trim()
}

export async function setCompanyFeatureAction(organizationId: string, key: string, enabled: boolean): Promise<ActionState> {
  await requirePlatformAdmin()
  if (!uuid.safeParse(organizationId).success) return { error: 'Company not found.' }
  const parsed = z.enum(featureKeys).safeParse(key)
  if (!parsed.success) return { error: 'This module cannot be switched.' }

  const supabase = await createClient()
  const { error } = await supabase.rpc('platform_set_feature', {
    p_org: organizationId,
    p_key: parsed.data,
    p_enabled: enabled,
  })
  if (error) return { error: ownerError(error.message) }

  revalidatePath(`/platform/companies/${organizationId}`)
  return { success: `${featureLabel(parsed.data)} ${enabled ? 'turned on' : 'turned off'} for this company.` }
}

const reasonSchema = z.string().trim().min(3, 'Give a short reason (it is shown to you and other owners only).').max(500)

export async function setCompanySuspendedAction(
  organizationId: string,
  suspended: boolean,
  reason?: string,
): Promise<ActionState> {
  await requirePlatformAdmin()
  if (!uuid.safeParse(organizationId).success) return { error: 'Company not found.' }
  let cleanReason: string | null = null
  if (suspended) {
    const parsed = reasonSchema.safeParse(reason ?? '')
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Give a reason.' }
    cleanReason = parsed.data
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('platform_set_suspended', {
    p_org: organizationId,
    p_suspended: suspended,
    p_reason: cleanReason,
  })
  if (error) return { error: ownerError(error.message) }

  revalidatePath('/platform')
  revalidatePath(`/platform/companies/${organizationId}`)
  return {
    success: suspended
      ? 'Company suspended. Its team, homeowners and subcontractors can no longer open it.'
      : 'Company reactivated. Everyone has access again.',
  }
}

const planSchema = z.object({
  plan: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/, 'Choose a plan.'),
  note: z.string().trim().max(500, 'Keep the note under 500 characters.').optional(),
})

export async function setCompanyPlanAction(organizationId: string, plan: string, note?: string): Promise<ActionState> {
  await requirePlatformAdmin()
  if (!uuid.safeParse(organizationId).success) return { error: 'Company not found.' }
  const parsed = planSchema.safeParse({ plan, note: note || undefined })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Choose a plan.' }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('platform_set_plan', {
    p_org: organizationId,
    p_plan: parsed.data.plan,
    p_note: parsed.data.note ?? null,
  })
  if (error) return { error: ownerError(error.message) }
  const result = data as { changed: boolean; over_limit?: boolean; staff_seats?: number; max_staff?: number | null }

  revalidatePath('/platform')
  revalidatePath(`/platform/companies/${organizationId}`)
  if (!result.changed) return { success: 'The company is already on that plan.' }
  if (result.over_limit) {
    return {
      success: `Plan changed. The company has ${result.staff_seats} team members but the plan includes ${result.max_staff}; nobody loses access, but they cannot add anyone until they are under the limit.`,
    }
  }
  return { success: 'Plan changed. Modules outside the new plan are now off for this company; their data is kept.' }
}

const discountSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('existing'), couponId: z.string().trim().min(1, 'Choose a coupon.').max(200) }),
  z.object({
    kind: z.literal('new'),
    percentOff: z.coerce.number().int('Use a whole percentage.').min(1, 'Enter 1 to 100 percent.').max(100, 'Enter 1 to 100 percent.'),
    months: z.coerce.number().int().min(0).max(36, 'Use 36 months or fewer (0 = forever).'),
  }),
  z.object({ kind: z.literal('remove') }),
])

export type DiscountChoice = z.input<typeof discountSchema>

/** Applies, creates-and-applies, or removes a Stripe discount for one company, and logs it as an owner action. */
export async function setCompanyDiscountAction(organizationId: string, choice: DiscountChoice): Promise<ActionState> {
  const session = await requirePlatformAdmin()
  if (!uuid.safeParse(organizationId).success) return { error: 'Company not found.' }
  const parsed = discountSchema.safeParse(choice)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Choose a discount.' }

  let message: string
  let label: string | null = null
  try {
    let couponId: string | null = null
    if (parsed.data.kind === 'existing') couponId = parsed.data.couponId
    if (parsed.data.kind === 'new') {
      const coupon = await createPercentCoupon(parsed.data.percentOff, parsed.data.months || null)
      couponId = coupon.id
      label = describeCoupon(coupon)
    }
    message = await setCompanyDiscount(organizationId, couponId)
    if (couponId && !label) label = (await getCompanyDiscount(organizationId))?.label ?? couponId
  } catch (error) {
    console.error('[platform] discount failed', error)
    return { error: error instanceof Error && error.message.length < 200 ? error.message : 'Stripe could not apply that discount. Try again.' }
  }

  await createAdminClient()
    .from('platform_admin_events')
    .insert({
      actor_id: session.userId,
      organization_id: organizationId,
      action: parsed.data.kind === 'remove' ? 'discount_removed' : 'discount_applied',
      details: label ? { discount: label } : {},
    })
    .then(({ error }) => error && console.error('[platform] could not log discount', error))

  revalidatePath(`/platform/companies/${organizationId}`)
  return { success: message }
}
