/**
 * Builds an absolute link for an email from an in-app path. Only same-origin paths are
 * allowed, so a notification row can never turn into an open redirect or external link.
 * Links point at authenticated pages; the destination enforces access, not the email.
 */
export function absoluteAppLink(appUrl: string, path: string | null | undefined): string | null {
  const value = (path ?? '/').trim() || '/'
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\s<>"']/.test(value)) return null
  try {
    const base = new URL(appUrl)
    const url = new URL(value, base)
    return url.origin === base.origin ? url.toString() : null
  } catch {
    return null
  }
}

export function preferencesPathFor(link: string | null | undefined): string | null {
  if (!link) return '/profile'
  if (link.startsWith('/portal')) return '/portal/profile'
  if (link.startsWith('/sub')) return null
  return '/profile'
}
