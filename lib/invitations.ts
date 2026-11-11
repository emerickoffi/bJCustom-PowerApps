import { createHash, randomBytes } from 'node:crypto'
import { headers } from 'next/headers'

/** The raw token only ever lives in the invitation link; the database keeps its SHA-256 hash. */
export function newInvitationToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: createHash('sha256').update(token).digest('hex') }
}

export async function requestOrigin() {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  const proto = h.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : ''
}

export async function invitationUrl(token: string) {
  return `${await requestOrigin()}/invite/${token}`
}

/** Auth email links go through the v0 redirect proxy in previews, then land on /auth/callback with `next`. */
export function authCallbackUrl(origin: string, next: string) {
  const url = new URL(process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${origin}/auth/callback`)
  url.searchParams.set('next', next)
  return url.toString()
}

export function safeNextPath(next: string | null | undefined, fallback = '/') {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : fallback
}

export const INVITATION_DAYS = 14
