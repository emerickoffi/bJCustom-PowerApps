export class PreviewRequestError extends Error {
  constructor(
    readonly status: number | null,
    /** The server's explanation, when it sent one. */
    readonly reason: string | null = null,
  ) {
    super('project_preview_failed')
  }
}

/** Loads one of the preview's JSON resources. Every failure carries the HTTP status, or null when there was no answer. */
export async function fetchPreviewJson<T>(url: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch {
    throw new PreviewRequestError(null)
  }
  // An expired session is redirected to the sign-in page rather than answered with JSON.
  if (res.redirected) throw new PreviewRequestError(401)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null
    throw new PreviewRequestError(res.status, typeof body?.error === 'string' ? body.error : null)
  }
  try {
    return (await res.json()) as T
  } catch {
    throw new PreviewRequestError(null)
  }
}
