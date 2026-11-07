/**
 * Display-only normalization for project locations. Stored addresses are never rewritten;
 * these helpers only decide how existing values are labelled in lists and filters.
 */

const US_STATE_ABBR: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', 'district of columbia': 'DC', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY',
  louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH',
  'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
  'puerto rico': 'PR', guam: 'GU', 'u.s. virgin islands': 'VI', 'american samoa': 'AS',
  'northern mariana islands': 'MP',
}

const US_ABBRS = new Set(Object.values(US_STATE_ABBR))

/** Recognized US state names or abbreviations become postal codes; anything else is kept as entered (trimmed). */
export function normalizeStateLabel(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim()
  if (!trimmed) return ''
  const compact = trimmed.replace(/\./g, '').toUpperCase()
  if (compact.length === 2 && US_ABBRS.has(compact)) return compact
  return US_STATE_ABBR[trimmed.toLowerCase().replace(/\s+/g, ' ')] ?? trimmed
}

export function cityKey(city: string | null | undefined, stateLabel: string): string {
  return `${(city ?? '').trim().toLowerCase().replace(/\s+/g, ' ')}|${stateLabel.toLowerCase()}`
}

/**
 * Picks one label per city (within a state) from spellings already stored on the organization's
 * projects: the most common spelling wins, and ties prefer mixed case over all-lower/all-upper text.
 * Nothing is title-cased automatically, so unfamiliar names stay exactly as entered.
 */
export function canonicalCityLabels(rows: { city: string | null; state: string | null }[]): Map<string, string> {
  const counts = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const city = (row.city ?? '').trim().replace(/\s+/g, ' ')
    if (!city) continue
    const key = cityKey(city, normalizeStateLabel(row.state))
    const variants = counts.get(key) ?? new Map<string, number>()
    variants.set(city, (variants.get(city) ?? 0) + 1)
    counts.set(key, variants)
  }
  const mixedCase = (value: string) => value !== value.toLowerCase() && value !== value.toUpperCase()
  const labels = new Map<string, string>()
  for (const [key, variants] of counts) {
    let best = ''
    let bestCount = -1
    for (const [spelling, count] of variants) {
      if (count > bestCount || (count === bestCount && mixedCase(spelling) && !mixedCase(best))) {
        best = spelling
        bestCount = count
      }
    }
    labels.set(key, best)
  }
  return labels
}

export function formatLocation(
  city: string | null | undefined,
  state: string | null | undefined,
  cityLabels?: Map<string, string>,
): string {
  const stateLabel = normalizeStateLabel(state)
  const rawCity = (city ?? '').trim()
  const cityLabel = rawCity ? (cityLabels?.get(cityKey(rawCity, stateLabel)) ?? rawCity) : ''
  return [cityLabel, stateLabel].filter(Boolean).join(', ')
}
