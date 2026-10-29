/**
 * Exact URL shapes the assistant may cite for market data. Shared by the server (which builds the URLs)
 * and the drawer (which renders them), so a link is only shown when it points at the official dataset.
 */
const PATTERNS: RegExp[] = [
  /^https:\/\/fred\.stlouisfed\.org\/series\/[A-Z0-9]{3,20}$/,
  /^https:\/\/data\.bls\.gov\/timeseries\/[A-Z0-9]{10,25}$/,
  /^https:\/\/data\.bls\.gov\/cew\/data\/api\/\d{4}\/[1-4]\/area\/\d{5}\.csv$/,
  /^https:\/\/www2\.census\.gov\/econ\/bps\/County\/co\d{4}c\.txt$/,
  /^https:\/\/www2\.census\.gov\/econ\/bps\/Place\/(Northeast|Midwest|South|West)%20Region\/(ne|mw|so|we)\d{4}c\.txt$/,
]

export const isAllowedSourceUrl = (url: string) => typeof url === 'string' && url.length < 200 && PATTERNS.some((p) => p.test(url))
