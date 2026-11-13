/**
 * Company logo rules shared by the upload/remove actions and the branding UI.
 *
 * Priority rule: an organization has exactly one active logo, stored in `organizations.logo_url`.
 * Uploading a file stores it in the `company-logos` bucket and writes that file's public URL into
 * `logo_url`; entering a hosted URL in the Logo URL field and saving replaces it. Whichever was saved
 * last is the active logo. An empty `logo_url` means "no logo" and renders a neutral placeholder,
 * never another company's branding.
 */

export const COMPANY_LOGOS_BUCKET = 'company-logos'
export const MAX_LOGO_BYTES = 2 * 1024 * 1024

/**
 * SVG is deliberately excluded: an SVG can carry script that runs when the file is opened directly
 * from storage, and there is no sanitizer in this project.
 */
export const LOGO_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export type LogoMimeType = (typeof LOGO_MIME_TYPES)[number]
export const LOGO_ACCEPT = LOGO_MIME_TYPES.join(',')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Identifies the image format from its leading bytes so a renamed file cannot claim another type. */
export function detectLogoMime(bytes: Uint8Array): LogoMimeType | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }
  return null
}

export type LogoValidation = { ok: true; mime: LogoMimeType } | { ok: false; error: string }

export function validateLogoUpload(file: { size: number; type: string; bytes: Uint8Array }): LogoValidation {
  if (file.size === 0) return { ok: false, error: 'Choose an image file to upload.' }
  if (file.size > MAX_LOGO_BYTES) return { ok: false, error: 'Logo must be 2 MB or smaller.' }
  const detected = detectLogoMime(file.bytes)
  if (!detected || !(LOGO_MIME_TYPES as readonly string[]).includes(file.type) || detected !== normalizeMime(file.type)) {
    return { ok: false, error: 'Use a PNG, JPG, or WebP image.' }
  }
  return { ok: true, mime: detected }
}

function normalizeMime(type: string): string {
  return type === 'image/jpg' ? 'image/jpeg' : type
}

/** One stable object per company; replacing a logo overwrites it, so no orphaned files accumulate. */
export function logoStoragePath(organizationId: string): string {
  if (!UUID.test(organizationId)) throw new Error('Invalid organization id')
  return `${organizationId}/logo`
}

/**
 * Uploaded logos live in a private bucket and are served by this same-origin route, which always
 * returns the signed-in user's own company logo. The URL deliberately carries no organization id, so
 * it cannot be pointed at another company.
 */
export const UPLOADED_LOGO_ROUTE = '/api/company-logo'
const UPLOADED_LOGO_PATTERN = /^\/api\/company-logo(?:\?v=\d{1,16})?$/

/** The stored URL carries a version so browsers show a replaced logo immediately. */
export function uploadedLogoUrl(version: number): string {
  return `${UPLOADED_LOGO_ROUTE}?v=${Math.trunc(version)}`
}

export function isUploadedLogo(logoUrl: string | null | undefined): boolean {
  return UPLOADED_LOGO_PATTERN.test(logoUrl?.trim() ?? '')
}

/** Hosted logo URLs must be https or a same-site path; protocol-relative `//host` URLs are rejected. */
export function isAllowedLogoUrl(value: string | null): boolean {
  return value === null || (value.startsWith('/') && !value.startsWith('//')) || /^https:\/\//.test(value)
}

export type LogoSource = 'none' | 'uploaded' | 'url'

export function logoSource(logoUrl: string | null | undefined): LogoSource {
  const value = logoUrl?.trim()
  if (!value) return 'none'
  return isUploadedLogo(value) ? 'uploaded' : 'url'
}

/** Headers for serving a stored logo: the type comes from the file's bytes, never from storage metadata. */
export function logoResponseHeaders(mime: LogoMimeType): Record<string, string> {
  return {
    'Content-Type': mime,
    'Content-Disposition': 'inline',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    Vary: 'Cookie',
  }
}
