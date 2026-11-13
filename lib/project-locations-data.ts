import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSession } from '@/lib/session'
import {
  GEOCODE_PER_REQUEST,
  addressKey,
  geocodeQuery,
  needsGeocode,
  toProjectLocation,
  type ProjectLocation,
  type SiteAddress,
  type StoredGeocodeStatus,
  type StoredLocation,
} from '@/lib/project-locations'

type CensusResponse = { result?: { addressMatches?: { coordinates: { x: number; y: number } }[] } }

/**
 * U.S. Census geocoder: public, keyless, no usage fees, and its results may be stored. Only the street address is
 * sent — never client names, notes, or amounts. Distinct matches more than ~1 km apart are treated as ambiguous.
 */
async function censusGeocode(query: string): Promise<{ status: StoredGeocodeStatus; lat?: number; lng?: number }> {
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(query)}`
  try {
    const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return { status: 'failed' }
    const data = (await res.json()) as CensusResponse
    const matches = data.result?.addressMatches ?? []
    if (!matches.length) return { status: 'unresolved' }
    const [first] = matches
    const spread = matches.some(
      (m) => Math.abs(m.coordinates.y - first.coordinates.y) > 0.01 || Math.abs(m.coordinates.x - first.coordinates.x) > 0.01,
    )
    if (spread) return { status: 'ambiguous' }
    return { status: 'ok', lat: Number(first.coordinates.y.toFixed(6)), lng: Number(first.coordinates.x.toFixed(6)) }
  } catch {
    return { status: 'failed' }
  }
}

type ProjectAddressRow = SiteAddress & { id: string; organization_id: string }

export type LocationsResult =
  | { ok: true; locations: ProjectLocation[] }
  | { ok: false; status: 401 | 403; error: string }

/**
 * Pins for the requested projects. Access is decided by the caller's own RLS-scoped read of `projects` within their
 * organization; IDs that read does not return are dropped silently, so another company's project is indistinguishable
 * from one that does not exist. Only then are new coordinates written, with the service role, for those projects alone.
 */
export async function loadProjectLocations(ids: string[]): Promise<LocationsResult> {
  const session = await getSession()
  if (!session) return { ok: false, status: 401, error: 'Sign in to see project locations.' }
  if (!session.organizationId || !session.role || session.role === 'client' || session.activationRequired)
    return { ok: false, status: 403, error: 'You do not have access to project locations.' }
  if (!ids.length) return { ok: true, locations: [] }

  const supabase = await createClient()
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, organization_id, address_line1, address_line2, city, state, postal_code, country')
    .eq('organization_id', session.organizationId)
    .in('id', ids)
  if (error) throw error
  const rows = (projects ?? []) as ProjectAddressRow[]
  if (!rows.length) return { ok: true, locations: [] }

  const { data: storedRows, error: storedError } = await supabase
    .from('project_site_locations')
    .select('project_id, address_key, status, latitude, longitude, geocoded_at')
    .in('project_id', rows.map((r) => r.id))
  if (storedError) throw storedError
  const stored = new Map<string, StoredLocation>((storedRows ?? []).map((r) => [r.project_id as string, r as StoredLocation]))

  const due = rows
    .flatMap((row) => {
      const query = geocodeQuery(row)
      if (!query.ok) return []
      const key = addressKey(query.query)
      return needsGeocode(stored.get(row.id), key) ? [{ row, query: query.query, key }] : []
    })
    .slice(0, GEOCODE_PER_REQUEST)

  if (due.length) {
    const results = await Promise.all(due.map(async (d) => ({ ...d, result: await censusGeocode(d.query) })))
    const geocodedAt = new Date().toISOString()
    const upserts = results.map(({ row, key, result }) => ({
      project_id: row.id,
      organization_id: row.organization_id,
      address_key: key,
      status: result.status,
      latitude: result.lat ?? null,
      longitude: result.lng ?? null,
      geocoded_at: geocodedAt,
    }))
    for (const u of upserts) stored.set(u.project_id, u)
    try {
      await createAdminClient().from('project_site_locations').upsert(upserts, { onConflict: 'project_id' })
    } catch {
      // Caching is best-effort; the pins for this response are already resolved.
    }
  }

  const order = new Map(ids.map((id, i) => [id, i]))
  return {
    ok: true,
    locations: rows
      .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      .map((row) => toProjectLocation(row.id, row, stored.get(row.id))),
  }
}
