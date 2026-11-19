import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { qboErrorMessage } from '@/lib/quickbooks-mapping'

export type QuickBooksStatus = {
  credentialsConfigured: boolean
  connected: boolean
}

export type QuickBooksConnection = {
  realm_id: string
  company_name: string | null
  environment: 'sandbox' | 'production'
  status: 'connected' | 'needs_reauth'
  connected_at: string
  last_synced_at: string | null
  last_error: string | null
}

const AUTHORIZE_URL = 'https://appcenter.intuit.com/connect/oauth2'
const TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'
const SCOPE = 'com.intuit.quickbooks.accounting'
const MINOR_VERSION = '75'

export function quickBooksEnvironment(): 'sandbox' | 'production' {
  return process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox'
}

function apiBase(env: 'sandbox' | 'production') {
  return env === 'production' ? 'https://quickbooks.api.intuit.com' : 'https://sandbox-quickbooks.api.intuit.com'
}

function credentials() {
  const id = process.env.QUICKBOOKS_CLIENT_ID
  const secret = process.env.QUICKBOOKS_CLIENT_SECRET
  return id && secret ? { id, secret } : null
}

export function quickBooksRedirectUri() {
  const base = (process.env.APP_BASE_URL ?? 'https://app.trefortpro.com').replace(/\/$/, '')
  return `${base}/api/integrations/quickbooks/callback`
}

/** Credentials only; pair with getQuickBooksConnection for the company connection. */
export function getQuickBooksStatus(connected = false): QuickBooksStatus {
  return { credentialsConfigured: Boolean(credentials()), connected }
}

export function quickBooksStatusLabel(status: QuickBooksStatus) {
  if (!status.credentialsConfigured) return 'Setup Required — API credentials missing'
  if (!status.connected) return 'Setup Required — not connected'
  return 'Connected'
}

/** Status columns only, read as the signed-in admin (RLS). */
export async function getQuickBooksConnection(orgId: string): Promise<QuickBooksConnection | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('quickbooks_connections')
    .select('realm_id, company_name, environment, status, connected_at, last_synced_at, last_error')
    .eq('organization_id', orgId)
    .maybeSingle()
  return (data as QuickBooksConnection | null) ?? null
}

export function buildAuthorizeUrl(state: string) {
  const c = credentials()
  if (!c) throw new Error('QuickBooks credentials are not configured.')
  const u = new URL(AUTHORIZE_URL)
  u.searchParams.set('client_id', c.id)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('scope', SCOPE)
  u.searchParams.set('redirect_uri', quickBooksRedirectUri())
  u.searchParams.set('state', state)
  return u.toString()
}

type TokenResponse = { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in: number }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const c = credentials()
  if (!c) throw new Error('QuickBooks credentials are not configured.')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
    cache: 'no-store',
  })
  if (!res.ok) {
    const err = new Error(`QuickBooks token request failed (${res.status})`) as Error & { status?: number }
    err.status = res.status
    throw err
  }
  return (await res.json()) as TokenResponse
}

const expiry = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString()

/** Exchanges the OAuth code and stores the connection. */
export async function completeQuickBooksConnection(orgId: string, userId: string, code: string, realmId: string) {
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: quickBooksRedirectUri() })
  const env = quickBooksEnvironment()
  let companyName: string | null = null
  try {
    const res = await fetch(`${apiBase(env)}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=${MINOR_VERSION}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' },
      cache: 'no-store',
    })
    if (res.ok) companyName = ((await res.json()) as { CompanyInfo?: { CompanyName?: string } }).CompanyInfo?.CompanyName ?? null
  } catch {
    // The name is cosmetic; the connection still works without it.
  }
  const admin = createAdminClient()
  const { error } = await admin.rpc('qbo_save_connection', {
    p_org: orgId, p_realm: realmId, p_environment: env, p_company: companyName,
    p_access: tokens.access_token, p_refresh: tokens.refresh_token,
    p_access_expires: expiry(tokens.expires_in), p_refresh_expires: expiry(tokens.x_refresh_token_expires_in),
    p_user: userId,
  })
  if (error) throw new Error('The QuickBooks connection could not be saved.')
}

type StoredTokens = {
  realm_id: string
  environment: 'sandbox' | 'production'
  access_token: string | null
  refresh_token: string | null
  access_token_expires_at: string | null
  service_item_id: string | null
  status: string
}

async function loadTokens(orgId: string): Promise<StoredTokens | null> {
  const { data, error } = await createAdminClient().rpc('qbo_get_tokens', { p_org: orgId })
  if (error) throw new Error('QuickBooks connection could not be read.')
  return ((data as StoredTokens[] | null) ?? [])[0] ?? null
}

async function markNeedsReauth(orgId: string, message: string) {
  await createAdminClient()
    .from('quickbooks_connections')
    .update({ status: 'needs_reauth', last_error: message, updated_at: new Date().toISOString() })
    .eq('organization_id', orgId)
}

export class QuickBooksError extends Error {}

/** A request-scoped API client that refreshes the access token when needed. */
export async function quickBooksClient(orgId: string) {
  let t = await loadTokens(orgId)
  if (!t || !t.refresh_token) throw new QuickBooksError('QuickBooks is not connected.')
  if (t.status === 'needs_reauth') throw new QuickBooksError('QuickBooks needs to be reconnected in Settings → Integrations.')

  const refresh = async () => {
    try {
      const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t!.refresh_token! })
      const { error } = await createAdminClient().rpc('qbo_save_connection', {
        p_org: orgId, p_realm: t!.realm_id, p_environment: t!.environment, p_company: null,
        p_access: tokens.access_token, p_refresh: tokens.refresh_token,
        p_access_expires: expiry(tokens.expires_in), p_refresh_expires: expiry(tokens.x_refresh_token_expires_in),
        p_user: null,
      })
      if (error) throw new Error('save failed')
      t = { ...t!, access_token: tokens.access_token, refresh_token: tokens.refresh_token }
    } catch (err) {
      const status = (err as { status?: number }).status
      if (status === 400 || status === 401) {
        await markNeedsReauth(orgId, 'QuickBooks access expired or was revoked. Reconnect to continue.')
        throw new QuickBooksError('QuickBooks needs to be reconnected in Settings → Integrations.')
      }
      throw new QuickBooksError('QuickBooks could not be reached. Try again in a minute.')
    }
  }

  const expiresAt = t.access_token_expires_at ? Date.parse(t.access_token_expires_at) : 0
  if (!t.access_token || expiresAt - Date.now() < 5 * 60 * 1000) await refresh()

  async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, retried = false): Promise<T> {
    const url = `${apiBase(t!.environment)}/v3/company/${t!.realm_id}/${path}${path.includes('?') ? '&' : '?'}minorversion=${MINOR_VERSION}`
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${t!.access_token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    })
    if (res.status === 401 && !retried) {
      await refresh()
      return request<T>(method, path, body, true)
    }
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new QuickBooksError(qboErrorMessage(res.status, json))
    return json as T
  }

  return {
    realmId: t.realm_id,
    serviceItemId: t.service_item_id,
    query: <T>(q: string) => request<{ QueryResponse: T }>('GET', `query?query=${encodeURIComponent(q)}`).then((r) => r.QueryResponse),
    post: <T>(path: string, body: unknown) => request<T>('POST', path, body),
  }
}

export async function disconnectQuickBooks(orgId: string) {
  const c = credentials()
  const t = await loadTokens(orgId).catch(() => null)
  if (c && t?.refresh_token) {
    await fetch(REVOKE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${c.id}:${c.secret}`).toString('base64')}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: t.refresh_token }),
      cache: 'no-store',
    }).catch(() => undefined)
  }
  const { error } = await createAdminClient().rpc('qbo_disconnect', { p_org: orgId })
  if (error) throw new Error('QuickBooks could not be disconnected.')
}
