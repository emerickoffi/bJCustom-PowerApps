import { cache } from 'react'

/** One ID per server render, so every source that fails while building a page can be grouped in the logs. */
const requestCorrelationId = cache((): string => crypto.randomUUID())

/**
 * One structured line per failed data source, written to server logs only. The UI shows module names;
 * the database code and message stay here so operators can find the cause without exposing it to users.
 * Record content is never logged: only ids passed in `context`, the error code, and the database message.
 */
export function logSourceFailure(scope: string, source: string, error: unknown, context: Record<string, string | undefined> = {}) {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; hint?: unknown }
  console.error(
    JSON.stringify({
      event: 'data_source_failed',
      scope,
      source,
      operation: context.operation ?? 'read',
      code: typeof e.code === 'string' ? e.code : null,
      message: typeof e.message === 'string' ? e.message.slice(0, 300) : error instanceof Error ? error.message.slice(0, 300) : null,
      hint: typeof e.hint === 'string' ? e.hint.slice(0, 200) : null,
      ...context,
      correlationId: requestCorrelationId(),
    }),
  )
}
