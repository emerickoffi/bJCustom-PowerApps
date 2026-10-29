/**
 * Assistant answers are model output: only same-origin paths and http(s)/mailto
 * URLs may become links. Everything else (javascript:, data:, vbscript:,
 * protocol-relative //host) is dropped to an empty href.
 */
export function safeUrlTransform(url: string): string {
  const trimmed = url.trim()
  if (trimmed.startsWith('/') && !trimmed.startsWith('//') && !trimmed.startsWith('/\\')) return trimmed
  if (/^(https?:\/\/|mailto:)/i.test(trimmed) && !/[\s<>"]/.test(trimmed)) return trimmed
  return ''
}
