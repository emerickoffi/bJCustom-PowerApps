import { NextResponse, type NextRequest } from 'next/server'
import { getSession } from '@/lib/session'
import { landingPathForRole } from '@/lib/navigation'
import { getSubcontractorSession } from '@/lib/subcontractor-session'

// A route handler instead of a page: "/" only redirects, and rendering it as a Server Component tripped React's dev
// performance track ("'HomePage' cannot have a negative time stamp") whenever server and browser clocks drifted.
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url))

  const session = await getSession()
  if (!session?.organizationId) {
    // Subcontractor portal users have no staff membership; send them to their workspace, not onboarding.
    const sub = await getSubcontractorSession()
    if (sub) return to(sub.activationRequired ? '/sub/activate' : '/sub')
  }
  if (!session) return to('/auth/login')
  if (!session.organizationId) return to('/no-access')
  return to(landingPathForRole(session.role))
}
