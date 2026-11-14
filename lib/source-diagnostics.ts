/**
 * One structured line per failed data source, written to server logs only. The UI shows module names;
 * the database code and message stay here so operators can find the cause without exposing it to users.
 */
export function logSourceFailure(scope: string, source: string, error: unknown, context: Record<string, string | undefined> = {}) {
  const e = (error ?? {}) as { code?: unknown; message?: unknown; hint?: unknown }
  console.error(
    JSON.stringify({
      event: 'data_source_failed',
      scope,
      source,
      code: typeof e.code === 'string' ? e.code : null,
      message: typeof e.message === 'string' ? e.message.slice(0, 300) : error instanceof Error ? error.message.slice(0, 300) : null,
      hint: typeof e.hint === 'string' ? e.hint.slice(0, 200) : null,
      ...context,
    }),
  )
}
