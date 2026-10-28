'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSession, WORKSPACE_COOKIE } from '@/lib/session'
import { landingPathForRole } from '@/lib/navigation'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function switchWorkspace(organizationId: string): Promise<{ error: string } | void> {
  if (typeof organizationId !== 'string' || !UUID.test(organizationId)) return { error: 'Unknown workspace' }
  const session = await getSession()
  if (!session) redirect('/auth/login')

  const target = session.workspaces.find((w) => w.organizationId === organizationId)
  if (!target) return { error: 'You do not have access to that workspace' }

  ;(await cookies()).set(WORKSPACE_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  redirect(landingPathForRole(target.role))
}
