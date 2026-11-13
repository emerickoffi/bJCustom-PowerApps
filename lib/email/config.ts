import { checkTestIsolation, isTestEnvironment } from '../test-env/guard.ts'

export type EmailEnv = Record<string, string | undefined>

export type EmailConfig = {
  mode: 'off' | 'live'
  ready: boolean
  environment: string
  apiKey: string | null
  from: string | null
  replyTo: string | null
  appUrl: string | null
  allowlist: string[]
  /** Human-readable setup problems. Never includes secret values. */
  problems: string[]
}

const ADDRESS = /^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/
const NAMED_ADDRESS = /^[^<>]{1,80}<\s*([^@\s<>]+@[^@\s<>]+\.[^@\s<>]+)\s*>$/

export function isValidEmailAddress(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length <= 254 && ADDRESS.test(value.trim())
}

/** Accepts `team@example.com` or `Trefort <team@example.com>`; returns the bare address. */
export function senderAddress(value: string | null | undefined): string | null {
  const v = value?.trim()
  if (!v) return null
  if (ADDRESS.test(v)) return v
  const match = NAMED_ADDRESS.exec(v)
  return match ? match[1] : null
}

function normalizeAppUrl(raw: string | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null
  try {
    const url = new URL(value.startsWith('http') ? value : `https://${value}`)
    if (url.protocol !== 'https:' && url.hostname !== 'localhost') return null
    return url.origin
  } catch {
    return null
  }
}

export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0 && (v.startsWith('@') ? v.length > 3 : isValidEmailAddress(v)))
}

/** Allowlist entries are exact addresses or `@domain.com`. An empty list allows everyone. */
export function isAllowedRecipient(email: string, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true
  const address = email.trim().toLowerCase()
  const domain = address.slice(address.lastIndexOf('@'))
  return allowlist.includes(address) || allowlist.includes(domain)
}

export function resolveEmailConfig(env: EmailEnv = process.env): EmailConfig {
  const environment = env.VERCEL_ENV ?? (env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV ?? 'development')
  const mode = env.EMAIL_DELIVERY?.trim().toLowerCase() === 'live' ? 'live' : 'off'
  const apiKey = env.RESEND_API_KEY?.trim() || null
  const from = env.EMAIL_FROM?.trim() || null
  const replyTo = env.EMAIL_REPLY_TO?.trim() || null
  const appUrl = normalizeAppUrl(env.APP_BASE_URL) ?? normalizeAppUrl(env.VERCEL_PROJECT_PRODUCTION_URL)
  const allowlist = parseAllowlist(env.EMAIL_ALLOWED_RECIPIENTS)

  const problems: string[] = []
  if (mode === 'off') problems.push('Email delivery is off. Set EMAIL_DELIVERY=live to start sending.')
  if (!apiKey) problems.push('RESEND_API_KEY is not set.')
  else if (!apiKey.startsWith('re_')) problems.push('RESEND_API_KEY does not look like a Resend API key.')
  if (!from) problems.push('EMAIL_FROM is not set (for example "Trefort <notifications@mail.yourdomain.com>").')
  else if (!senderAddress(from)) problems.push('EMAIL_FROM is not a valid sender address.')
  if (replyTo && !isValidEmailAddress(replyTo)) problems.push('EMAIL_REPLY_TO is not a valid address.')
  if (!appUrl) problems.push('APP_BASE_URL is not set to the https origin used in email links.')
  if (isTestEnvironment(env)) {
    if (allowlist.length === 0) problems.push('TREFORT_ENV=test requires EMAIL_ALLOWED_RECIPIENTS so only sandbox inboxes receive mail.')
    const isolation = checkTestIsolation(env)
    if (!isolation.ok) problems.push(...isolation.problems.map((p) => `Test isolation: ${p}`))
  } else if (environment !== 'production' && allowlist.length === 0) {
    problems.push('Outside production, EMAIL_ALLOWED_RECIPIENTS must list test addresses or @domains so real customers are never emailed.')
  }
  if (env.NODE_ENV === 'test') problems.push('Email sending is disabled while automated tests run.')

  return { mode, ready: mode === 'live' && problems.length === 0, environment, apiKey, from, replyTo, appUrl, allowlist, problems }
}
