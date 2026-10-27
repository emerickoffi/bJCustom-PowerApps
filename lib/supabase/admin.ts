import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * Service-role client for Auth Admin operations. Bypasses RLS, so callers must
 * authorize the request (requireAdmin) and scope every query to the caller's organization.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Account provisioning is not configured on the server.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export const TEMP_CREDENTIAL_HOURS = 72

export function generateTemporaryPassword(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  const body = Buffer.from(bytes).toString('base64url')
  return `${body}-Bj7`
}

export function temporaryCredentialExpiry(): string {
  return new Date(Date.now() + TEMP_CREDENTIAL_HOURS * 3600 * 1000).toISOString()
}
