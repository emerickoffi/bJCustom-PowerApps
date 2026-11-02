import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { ESTIMATE_CATEGORIES, ESTIMATE_UNITS } from '@/lib/estimates'
import {
  AMOUNT_BASES,
  COST_TYPES,
  MARKUP_SCOPES,
  PERCENT_KINDS,
  draftSchema,
  type DraftProject,
  type DraftProposal,
  type EstimateDraft,
} from '@/lib/ai/estimate-draft'

const MAX_PROJECTS = 200
const MAX_OPTIONS = 50

const numberText = (describe: string) => z.string().max(40).nullable().describe(describe)

/** What the model fills in. Plain strings only; the app parses and calculates everything. */
export const aiDraftInput = z.object({
  project: z.string().trim().max(120).nullable().describe('Project name or number the user named. Null when a project is open or none was named.'),
  title: z.string().max(200).describe('Short estimate title, e.g. "Yaupon Drive construction estimate".'),
  description: z.string().max(1000).nullable(),
  notes: z.string().max(2000).nullable().describe('Only notes the user explicitly supplied.'),
  amount_basis: z.enum(AMOUNT_BASES),
  percent: numberText('Markup or margin percentage exactly as supplied, e.g. "20". Null if none.'),
  percent_kind: z.enum(PERCENT_KINDS),
  markup_scope: z.enum(MARKUP_SCOPES),
  tax_percent: numberText('Tax percentage only if explicitly supplied.'),
  stated_total: numberText('A total or grand total written in the text, in dollars.'),
  ignored_lines: z.array(z.string().max(200)).max(10).describe('Subtotal/total lines that are not line items.'),
  items: z
    .array(
      z.object({
        description: z.string().max(500),
        category: z.enum(ESTIMATE_CATEGORIES),
        cost_type: z.enum(COST_TYPES),
        quantity: numberText('Quantity as written; "1" for a lump sum. Null if not given.'),
        unit: z.enum(ESTIMATE_UNITS),
        unit_cost: numberText('Dollars per unit (the full amount for a lump sum). Null if not given; never guess.'),
        lump_sum: z.boolean(),
        source_text: z.string().max(300).nullable().describe('The fragment of the user text this line came from.'),
      }),
    )
    .max(200),
})
type AiDraftInput = z.infer<typeof aiDraftInput>

const cleanNumber = (value: string | null, pattern: RegExp) => {
  const v = (value ?? '').replace(/[$,%\s]/g, '')
  return pattern.test(v) ? v : null
}

/** Normalizes the model's proposal; anything that is not a clean number becomes visibly missing. */
function normalize(input: AiDraftInput): EstimateDraft {
  const money = /^\d{1,10}(\.\d{1,2})?$/
  const pct = /^\d{1,4}(\.\d{1,3})?$/
  const qty = /^\d{1,9}(\.\d{1,3})?$/
  const candidate = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
    amount_basis: input.amount_basis,
    percent: cleanNumber(input.percent, pct),
    percent_kind: input.percent_kind,
    markup_scope: input.markup_scope,
    tax_percent: cleanNumber(input.tax_percent, pct),
    stated_total: cleanNumber(input.stated_total, money),
    ignored_lines: input.ignored_lines.map((l) => l.trim()).filter(Boolean),
    items: input.items
      .filter((i) => i.description.trim())
      .map((i) => ({
        description: i.description.trim(),
        category: i.category,
        cost_type: i.cost_type,
        quantity: i.lump_sum ? '1' : cleanNumber(i.quantity, qty),
        unit: i.lump_sum ? ('lot' as const) : i.unit,
        unit_cost: cleanNumber(i.unit_cost, money),
        lump_sum: i.lump_sum,
        source_text: i.source_text?.trim() || null,
      })),
  }
  return draftSchema.parse(candidate)
}

type ProjectRow = { id: string; name: string; project_number: string | null }
const toOption = (p: ProjectRow): DraftProject => ({ id: p.id, name: p.name, number: p.project_number })

function matchProjects(list: ProjectRow[], query: string) {
  const q = query.trim().toLowerCase()
  const exact = list.filter((p) => p.name.toLowerCase() === q || p.project_number?.toLowerCase() === q)
  if (exact.length) return exact
  const words = q.split(/\s+/).filter((w) => w.length > 2 && !['drive', 'road', 'street', 'project'].includes(w))
  return list.filter((p) => {
    const hay = `${p.name} ${p.project_number ?? ''}`.toLowerCase()
    return hay.includes(q) || (words.length > 0 && words.every((w) => hay.includes(w)))
  })
}

/**
 * Builds the preview the chat shows. The project is only preselected when it is the open
 * project or the user's text matches exactly one accessible project; otherwise the user picks.
 */
export async function buildDraftProposal(
  supabase: SupabaseClient,
  organizationId: string,
  openProjectId: string | null,
  input: AiDraftInput,
): Promise<DraftProposal> {
  const draft = normalize(input)
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, project_number')
    .eq('organization_id', organizationId)
    .order('name')
    .limit(MAX_PROJECTS)
  if (error) throw new Error(`projects: ${error.message}`)
  const projects = (data ?? []) as ProjectRow[]
  const options = projects.slice(0, MAX_OPTIONS).map(toOption)

  if (openProjectId) {
    const open = projects.find((p) => p.id === openProjectId)
    if (open) return { draft, project: toOption(open), projectOptions: [], projectNote: null }
    return { draft, project: null, projectOptions: options, projectNote: 'The open project is not available. Choose a project.' }
  }
  if (!input.project?.trim()) {
    return { draft, project: null, projectOptions: options, projectNote: 'No project was named. Choose the project for this estimate.' }
  }
  const matches = matchProjects(projects, input.project)
  if (matches.length === 1) return { draft, project: toOption(matches[0]), projectOptions: options, projectNote: null }
  if (matches.length > 1) {
    return {
      draft,
      project: null,
      projectOptions: matches.slice(0, MAX_OPTIONS).map(toOption),
      projectNote: `"${input.project.slice(0, 80)}" matches ${matches.length} projects. Choose one.`,
    }
  }
  return {
    draft,
    project: null,
    projectOptions: options,
    projectNote: `No accessible project matches "${input.project.slice(0, 80)}". Choose a project.`,
  }
}
