export type TradeGroup = { value: string; items: string[] }

export const OTHER_TRADE = 'Other / Specialty not listed'

export const TRADE_GROUPS: TradeGroup[] = [
  {
    value: 'Structural & Exterior',
    items: [
      'General Contracting',
      'Site Preparation & Excavation',
      'Concrete & Foundations',
      'Framing & Carpentry',
      'Roofing',
      'Masonry',
      'Siding & Exterior Finishes',
      'Windows & Doors',
    ],
  },
  {
    value: 'Mechanical, Electrical & Plumbing',
    items: ['Electrical', 'Plumbing', 'HVAC', 'Fire Protection', 'Low-Voltage & Smart Home'],
  },
  {
    value: 'Interior & Finishes',
    items: ['Drywall', 'Painting', 'Flooring', 'Tile & Stone', 'Cabinets & Millwork', 'Insulation'],
  },
  {
    value: 'Site & Specialty',
    items: ['Landscaping', 'Fencing', 'Pools & Outdoor Living', 'Cleaning & Final Turnover'],
  },
  { value: 'Other', items: [OTHER_TRADE] },
]

export const STANDARD_TRADES = TRADE_GROUPS.flatMap((group) => group.items).filter((t) => t !== OTHER_TRADE)

function tradeKey(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]/g, '')
}

const TRADE_ALIASES: Record<string, string> = {
  electrician: 'Electrical',
  plumber: 'Plumbing',
  painter: 'Painting',
  roofer: 'Roofing',
  framing: 'Framing & Carpentry',
  carpentry: 'Framing & Carpentry',
  framer: 'Framing & Carpentry',
  concrete: 'Concrete & Foundations',
  foundations: 'Concrete & Foundations',
  excavation: 'Site Preparation & Excavation',
  sitework: 'Site Preparation & Excavation',
  generalcontractor: 'General Contracting',
  landscaper: 'Landscaping',
  tile: 'Tile & Stone',
  cabinets: 'Cabinets & Millwork',
  cabinetry: 'Cabinets & Millwork',
  cleaning: 'Cleaning & Final Turnover',
  siding: 'Siding & Exterior Finishes',
  heatingandcooling: 'HVAC',
  lowvoltage: 'Low-Voltage & Smart Home',
}

const CANONICAL_BY_KEY = new Map<string, string>([
  ...STANDARD_TRADES.map((trade) => [tradeKey(trade), trade] as const),
  ...Object.entries(TRADE_ALIASES),
])

/** Returns the standard trade a free-text entry refers to, or null when it is a genuinely custom specialty. */
export function matchStandardTrade(value: string): string | null {
  return CANONICAL_BY_KEY.get(tradeKey(value)) ?? null
}

/** Trims a trade and folds casing or naming variants of a standard trade into its canonical name. */
export function canonicalizeTrade(value: string) {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  return matchStandardTrade(trimmed) ?? trimmed
}
