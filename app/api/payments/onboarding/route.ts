import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { getStripe } from '@/lib/stripe'
import { PaymentsError, startOnboarding } from '@/lib/stripe-connect'

export const dynamic = 'force-dynamic'

const back = (req: NextRequest, result: string) => NextResponse.redirect(new URL(`/settings/integrations?payments=${result}`, req.url))

/** Sends an admin to Stripe's onboarding (also where Stripe sends them back if the link expired). */
export async function GET(req: NextRequest) {
  const session = await requireAdmin()
  if (!getStripe()) return back(req, 'not_configured')

  // Turning the module on runs the plan check (Business) in the database.
  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_features')
    .upsert({ organization_id: session.organizationId, feature_key: 'payments', enabled: true }, { onConflict: 'organization_id,feature_key' })
  if (error) return back(req, 'plan')

  try {
    const url = await startOnboarding({ organizationId: session.organizationId, userId: session.userId, origin: req.nextUrl.origin })
    return NextResponse.redirect(url)
  } catch (err) {
    console.error('[payments] onboarding failed', { message: err instanceof Error ? err.message : String(err) })
    return back(req, err instanceof PaymentsError ? 'failed' : 'stripe_error')
  }
}
