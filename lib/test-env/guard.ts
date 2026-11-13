export type IsolationEnv = Record<string, string | undefined>

/** The live Trefort project. Test tooling must never write here. */
export const PRODUCTION_SUPABASE_PROJECT_ID = 'koaaoatcxzhahoeiahxr'

const PROJECT_REF = /^[a-z0-9]{20}$/

export type IsolationCheck = {
  ok: boolean
  projectId: string | null
  /** Human-readable failures. Never includes secret values. */
  problems: string[]
}

export class IsolationError extends Error {
  readonly problems: string[]
  constructor(problems: string[]) {
    super(`Test isolation check failed: ${problems.join(' ')}`)
    this.problems = problems
  }
}

export function isTestEnvironment(env: IsolationEnv = process.env): boolean {
  return env.TREFORT_ENV?.trim().toLowerCase() === 'test'
}

/** `https://<ref>.supabase.co` → `<ref>`. Custom domains return null, which fails closed. */
export function projectRefFromSupabaseUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const host = new URL(raw.trim()).hostname
    const match = /^([a-z0-9]{20})\.supabase\.(co|in)$/.exec(host)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/** Direct hosts are `db.<ref>.supabase.co`; pooler connections carry the ref in the user (`postgres.<ref>`). */
export function projectRefFromPostgres(host: string | undefined, user?: string | undefined): string | null {
  const h = host?.trim().toLowerCase()
  const direct = h ? /^db\.([a-z0-9]{20})\.supabase\.(co|in)$/.exec(h) : null
  if (direct) return direct[1]
  const pooled = user?.trim() ? /^[a-z_]+\.([a-z0-9]{20})$/.exec(user.trim()) : null
  return pooled ? pooled[1] : null
}

export function projectRefFromPostgresUrl(raw: string | undefined): string | null {
  if (!raw?.trim()) return null
  try {
    const url = new URL(raw.trim())
    return projectRefFromPostgres(url.hostname, decodeURIComponent(url.username))
  } catch {
    return null
  }
}

const SUPABASE_URL_KEYS = ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL'] as const
const POSTGRES_URL_KEYS = ['POSTGRES_URL', 'POSTGRES_URL_NON_POOLING', 'POSTGRES_PRISMA_URL'] as const

/**
 * Proves every data connection resolves to the one authorized test project, and that external
 * delivery is sandboxed. `TREFORT_ENV=test` alone is never enough: each connection is checked.
 */
export function checkTestIsolation(env: IsolationEnv = process.env): IsolationCheck {
  const problems: string[] = []

  if (!isTestEnvironment(env)) problems.push('TREFORT_ENV is not "test".')

  const expected = env.TREFORT_TEST_SUPABASE_PROJECT_ID?.trim().toLowerCase() || null
  if (!expected) problems.push('TREFORT_TEST_SUPABASE_PROJECT_ID is not set.')
  else if (!PROJECT_REF.test(expected)) problems.push('TREFORT_TEST_SUPABASE_PROJECT_ID is not a valid Supabase project ref.')
  else if (expected === PRODUCTION_SUPABASE_PROJECT_ID) problems.push('TREFORT_TEST_SUPABASE_PROJECT_ID is the production project.')

  const resolved: { key: string; ref: string | null; required: boolean }[] = [
    ...SUPABASE_URL_KEYS.map((key) => ({ key, ref: projectRefFromSupabaseUrl(env[key]), required: key === 'NEXT_PUBLIC_SUPABASE_URL' || Boolean(env[key]) })),
    ...POSTGRES_URL_KEYS.filter((key) => env[key]).map((key) => ({ key, ref: projectRefFromPostgresUrl(env[key]), required: true })),
  ]
  if (env.POSTGRES_HOST) {
    resolved.push({ key: 'POSTGRES_HOST', ref: projectRefFromPostgres(env.POSTGRES_HOST, env.POSTGRES_USER), required: true })
  }

  for (const { key, ref, required } of resolved) {
    if (!required) continue
    if (!ref) problems.push(`${key} does not resolve to a Supabase project.`)
    else if (ref === PRODUCTION_SUPABASE_PROJECT_ID) problems.push(`${key} points at the production project.`)
    else if (expected && ref !== expected) problems.push(`${key} points at a different project than TREFORT_TEST_SUPABASE_PROJECT_ID.`)
  }

  // Catches the production ref hiding in any connection value, e.g. a custom pooler hostname.
  for (const key of [...SUPABASE_URL_KEYS, ...POSTGRES_URL_KEYS, 'POSTGRES_HOST', 'POSTGRES_USER']) {
    if (env[key]?.includes(PRODUCTION_SUPABASE_PROJECT_ID) && !problems.some((p) => p.startsWith(`${key} `))) {
      problems.push(`${key} references the production project.`)
    }
  }

  if (env.DROPBOX_SIGN_TEST_MODE?.trim().toLowerCase() === 'false') {
    problems.push('DROPBOX_SIGN_TEST_MODE=false is not allowed in the test environment.')
  }

  if (env.EMAIL_DELIVERY?.trim().toLowerCase() === 'live' && !env.EMAIL_ALLOWED_RECIPIENTS?.trim()) {
    problems.push('EMAIL_ALLOWED_RECIPIENTS must list sandbox inboxes before email delivery is enabled.')
  }

  const stripe = env.STRIPE_SECRET_KEY?.trim()
  if (stripe && !stripe.startsWith('sk_test_') && !stripe.startsWith('rk_test_')) {
    problems.push('STRIPE_SECRET_KEY is not a Stripe test-mode key.')
  }

  return { ok: problems.length === 0, projectId: expected, problems }
}

/** Call before any test write or external send. Throws when isolation cannot be proven. */
export function assertTestIsolation(env: IsolationEnv = process.env): string {
  const result = checkTestIsolation(env)
  if (!result.ok || !result.projectId) throw new IsolationError(result.problems)
  return result.projectId
}
