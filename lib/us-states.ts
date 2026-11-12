import { z } from 'zod'

export type UsStateOption = { value: string; name: string; label: string }

const STATES: [code: string, name: string][] = [
  ['AL', 'Alabama'],
  ['AK', 'Alaska'],
  ['AZ', 'Arizona'],
  ['AR', 'Arkansas'],
  ['CA', 'California'],
  ['CO', 'Colorado'],
  ['CT', 'Connecticut'],
  ['DE', 'Delaware'],
  ['DC', 'District of Columbia'],
  ['FL', 'Florida'],
  ['GA', 'Georgia'],
  ['HI', 'Hawaii'],
  ['ID', 'Idaho'],
  ['IL', 'Illinois'],
  ['IN', 'Indiana'],
  ['IA', 'Iowa'],
  ['KS', 'Kansas'],
  ['KY', 'Kentucky'],
  ['LA', 'Louisiana'],
  ['ME', 'Maine'],
  ['MD', 'Maryland'],
  ['MA', 'Massachusetts'],
  ['MI', 'Michigan'],
  ['MN', 'Minnesota'],
  ['MS', 'Mississippi'],
  ['MO', 'Missouri'],
  ['MT', 'Montana'],
  ['NE', 'Nebraska'],
  ['NV', 'Nevada'],
  ['NH', 'New Hampshire'],
  ['NJ', 'New Jersey'],
  ['NM', 'New Mexico'],
  ['NY', 'New York'],
  ['NC', 'North Carolina'],
  ['ND', 'North Dakota'],
  ['OH', 'Ohio'],
  ['OK', 'Oklahoma'],
  ['OR', 'Oregon'],
  ['PA', 'Pennsylvania'],
  ['RI', 'Rhode Island'],
  ['SC', 'South Carolina'],
  ['SD', 'South Dakota'],
  ['TN', 'Tennessee'],
  ['TX', 'Texas'],
  ['UT', 'Utah'],
  ['VT', 'Vermont'],
  ['VA', 'Virginia'],
  ['WA', 'Washington'],
  ['WV', 'West Virginia'],
  ['WI', 'Wisconsin'],
  ['WY', 'Wyoming'],
]

/** All 50 states plus Washington, D.C., alphabetical by name. */
export const US_STATE_OPTIONS: UsStateOption[] = STATES.map(([value, name]) => ({ value, name, label: `${name} (${value})` }))

const squash = (v: string) => v.trim().toLowerCase().replace(/[.\s]+/g, ' ').trim()

const LOOKUP = new Map<string, string>()
for (const { value, name } of US_STATE_OPTIONS) {
  LOOKUP.set(value.toLowerCase(), value)
  LOOKUP.set(squash(name), value)
}
for (const alias of ['washington dc', 'washington d c', 'd c', 'dc']) LOOKUP.set(alias, 'DC')

/** Maps a full name or abbreviation (any case, surrounding spaces) to its two-letter code, or null if unrecognized. */
export function normalizeUsState(input: string | null | undefined): string | null {
  if (!input) return null
  const key = squash(input)
  if (!key) return null
  return LOOKUP.get(key) ?? LOOKUP.get(key.replace(/\s/g, '')) ?? null
}

export function usStateLabel(code: string | null | undefined): string | null {
  const normalized = normalizeUsState(code)
  return normalized ? (US_STATE_OPTIONS.find((o) => o.value === normalized)?.label ?? null) : null
}

/** Matches an option when the query is in the full name or starts its abbreviation. */
export function matchesUsState(option: UsStateOption, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return option.name.toLowerCase().includes(q) || option.value.toLowerCase().startsWith(q) || option.label.toLowerCase().includes(q)
}

/** Blank countries are treated as U.S., matching the existing default. */
export function isUsCountry(country: string | null | undefined): boolean {
  const c = (country ?? '').trim().toLowerCase().replace(/\./g, '')
  return c === '' || c === 'us' || c === 'usa' || c === 'united states' || c === 'united states of america'
}

export const INVALID_STATE_MESSAGE = 'Select a valid U.S. state'

/** Optional U.S. state: blank becomes null; anything else must normalize to a two-letter code. */
export const optionalUsState = z
  .string()
  .trim()
  .max(40, 'Must be 40 characters or fewer')
  .nullish()
  .transform((v, ctx) => {
    if (!v) return null
    const code = normalizeUsState(v)
    if (!code) {
      ctx.addIssue({ code: 'custom', message: INVALID_STATE_MESSAGE })
      return z.NEVER
    }
    return code
  })

/** Required U.S. state, normalized to a two-letter code. */
export const requiredUsState = z
  .string({ error: 'State is required' })
  .trim()
  .min(1, 'State is required')
  .max(40, 'Must be 40 characters or fewer')
  .transform((v, ctx) => {
    const code = normalizeUsState(v)
    if (!code) {
      ctx.addIssue({ code: 'custom', message: INVALID_STATE_MESSAGE })
      return z.NEVER
    }
    return code
  })
