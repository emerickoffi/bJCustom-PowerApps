export type SiteAddress = {
  address_line1: string | null
  address_line2?: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  country?: string | null
}

export type StoredGeocodeStatus = 'ok' | 'unresolved' | 'ambiguous' | 'failed'

export type StoredLocation = {
  address_key: string
  status: StoredGeocodeStatus
  latitude: number | null
  longitude: number | null
  geocoded_at: string
}

/** Why a project has no pin. `pending` means a lookup is still owed and will run on a later request. */
export type LocationUnavailableReason = 'no_address' | 'unsupported' | 'unresolved' | 'ambiguous' | 'failed' | 'pending'

export type ProjectLocation =
  | { projectId: string; state: 'ok'; lat: number; lng: number; address: string }
  | { projectId: string; state: 'unavailable'; reason: LocationUnavailableReason; address: string | null }

export const LOCATION_IDS_MAX = 50
/** Upper bound on new geocoder calls per request, so one page view never fans out into a burst. */
export const GEOCODE_PER_REQUEST = 10
/** A transient provider failure is retried after this long; an unmatched address waits for an edit instead. */
export const FAILED_RETRY_MS = 60 * 60 * 1000

const US_COUNTRIES = new Set(['united states', 'usa', 'us', 'u.s.', 'u.s.a.', 'united states of america'])

const clean = (value: string | null | undefined) => (value ?? '').replace(/\s+/g, ' ').trim()

/** The site address as one display line, or null when there is none. */
export function siteAddressLine(a: SiteAddress): string | null {
  const line1 = [clean(a.address_line1), clean(a.address_line2)].filter(Boolean).join(' ')
  const tail = [clean(a.city), [clean(a.state), clean(a.postal_code)].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const line = [line1, tail].filter(Boolean).join(', ')
  return line || null
}

/**
 * The geocoder query, or why there can be none. A street plus either city and state or a ZIP is required:
 * a city alone would pin the project at the city center, which reads as a real location and is not one.
 */
export function geocodeQuery(a: SiteAddress): { ok: true; query: string } | { ok: false; reason: 'no_address' | 'unsupported' } {
  const country = clean(a.country).toLowerCase()
  if (country && !US_COUNTRIES.has(country)) return { ok: false, reason: 'unsupported' }
  const street = clean(a.address_line1)
  const city = clean(a.city)
  const state = clean(a.state)
  const zip = clean(a.postal_code)
  if (!street || !((city && state) || zip)) return { ok: false, reason: 'no_address' }
  const tail = [city, [state, zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return { ok: true, query: `${street}, ${tail}` }
}

/** Case- and spacing-insensitive, so re-saving the same address never triggers another lookup. */
export function addressKey(query: string): string {
  return query.toLowerCase().replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400)
}

/** Whether the stored row still answers for this address. */
export function needsGeocode(stored: StoredLocation | null | undefined, key: string, now = Date.now()): boolean {
  if (!stored || stored.address_key !== key) return true
  if (stored.status !== 'failed') return false
  return now - Date.parse(stored.geocoded_at) >= FAILED_RETRY_MS
}

export function toProjectLocation(
  projectId: string,
  address: SiteAddress,
  stored: StoredLocation | null | undefined,
): ProjectLocation {
  const display = siteAddressLine(address)
  const query = geocodeQuery(address)
  if (!query.ok) return { projectId, state: 'unavailable', reason: query.reason, address: display }
  const key = addressKey(query.query)
  if (!stored || stored.address_key !== key) return { projectId, state: 'unavailable', reason: 'pending', address: display }
  if (stored.status === 'ok' && stored.latitude !== null && stored.longitude !== null)
    return { projectId, state: 'ok', lat: stored.latitude, lng: stored.longitude, address: display ?? query.query }
  return {
    projectId,
    state: 'unavailable',
    reason: stored.status === 'ok' ? 'failed' : stored.status,
    address: display,
  }
}

export const LOCATION_REASON_LABELS: Record<LocationUnavailableReason, string> = {
  no_address: 'No site address',
  unsupported: 'Outside the U.S.',
  unresolved: 'Address not found',
  ambiguous: 'Address is ambiguous',
  failed: 'Lookup failed',
  pending: 'Locating…',
}

/** Directions to the site: the stored pin when there is one, otherwise the address text. */
export function directionsUrl(target: { lat: number; lng: number } | { address: string }): string {
  const destination = 'address' in target ? target.address : `${target.lat},${target.lng}`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

export function parseLocationIds(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length > LOCATION_IDS_MAX) return null
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!input.every((id) => typeof id === 'string' && uuid.test(id))) return null
  return [...new Set(input as string[])]
}
