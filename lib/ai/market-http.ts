/**
 * Bounded HTTP for public market sources: a per-request timeout, one retry for transient failures
 * (network errors, 429, 5xx, never timeouts or 4xx), and an in-memory cache of parsed public results so
 * repeated questions do not re-download large official files or spend rate-limited quotas.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json' | 'text'>>

export type MarketCache = {
  get(key: string): Promise<unknown> | undefined
  set(key: string, value: Promise<unknown>, ttlMs: number): void
}

export function createMarketCache(maxEntries = 300): MarketCache {
  const entries = new Map<string, { expires: number; value: Promise<unknown> }>()
  return {
    get(key) {
      const hit = entries.get(key)
      if (!hit) return undefined
      if (hit.expires <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      return hit.value
    },
    set(key, value, ttlMs) {
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next().value
        if (oldest !== undefined) entries.delete(oldest)
      }
      entries.set(key, { expires: Date.now() + ttlMs, value })
      value.catch(() => {
        if (entries.get(key)?.value === value) entries.delete(key)
      })
    },
  }
}

/** Shared across requests in one server instance. Holds public statistics only, never tenant data. */
export const sharedMarketCache = createMarketCache()

export type HttpDeps = {
  fetchImpl: FetchLike
  timeoutMs?: number
  /** Pass null to disable caching (tests). Defaults to the shared cache. */
  cache?: MarketCache | null
}

export const HOUR = 3_600_000

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const retryable = (status: number) => status === 429 || status >= 500

export async function fetchWithRetry(url: string, init: RequestInit, deps: HttpDeps) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await deps.fetchImpl(url, { ...init, signal: AbortSignal.timeout(deps.timeoutMs ?? 6000) })
      if (attempt === 0 && retryable(res.status)) {
        await sleep(300)
        continue
      }
      return res
    } catch (error) {
      const timedOut = (error as { name?: string } | null)?.name === 'TimeoutError'
      if (attempt > 0 || timedOut) throw error
      await sleep(300)
    }
  }
}

export function cached<T>(deps: HttpDeps, key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const cache = deps.cache === undefined ? sharedMarketCache : deps.cache
  if (!cache) return load()
  const hit = cache.get(key)
  if (hit) return hit as Promise<T>
  const value = load()
  cache.set(key, value, ttlMs)
  return value
}
