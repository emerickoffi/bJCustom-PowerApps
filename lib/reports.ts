import 'server-only'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { SupabaseClient } from '@supabase/supabase-js'
import { RESPONSE_LABELS, ISSUE_STATUS_LABELS, PRIORITY_LABELS, VALIDATION_LABELS, WALKTHROUGH_TYPE_LABELS } from '@/lib/walkthroughs'
import { compareItemNumbers, withItemNumbers } from '@/lib/punch-list'
import { getStaffMembers } from '@/lib/queries'

export const REPORTS_BUCKET = 'project-documents'

export type ReportSnapshot = {
  organization: string
  project: { id: string; name: string; number: string; address: string }
  homeowner: string
  walkthrough: { id: string; title: string; type: string; scheduledDate: string | null; submittedAt: string | null }
  // number/location/responsible are optional so snapshots stored before numbering still render.
  sections: { category: string; items: { number?: string; location?: string | null; label: string; response: string; attachments: number }[] }[]
  issues: {
    number?: string
    location?: string | null
    responsible?: string | null
    category: string
    item: string
    description: string
    status: string
    priority: string
    dueDate: string | null
    correctiveAction: string | null
    validation: string
    attachments: number
  }[]
  totals: { items: number; satisfactory: number; needsAttention: number; notApplicable: number; unanswered: number; outstandingIssues: number }
  generatedAt: string
}

const OUTSTANDING = new Set(['open', 'in_progress'])

export async function buildWalkthroughSnapshot(supabase: SupabaseClient, walkthroughId: string, organizationId: string) {
  const { data: w } = await supabase
    .from('walkthroughs')
    .select('id, organization_id, project_id, title, walkthrough_type, scheduled_date, submitted_at, status, project:projects(id, name, project_number, address_line1, city, state, postal_code, primary_client_id)')
    .eq('id', walkthroughId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (!w) return { error: 'Walkthrough not found or access denied.' as const }
  if (w.status !== 'submitted') return { error: 'Reports can only be generated after the homeowner submits the walkthrough.' as const }

  const project = w.project as unknown as {
    id: string; name: string; project_number: string; address_line1: string | null; city: string | null; state: string | null; postal_code: string | null; primary_client_id: string | null
  }

  const [orgRes, clientRes, itemsRes, respRes, issuesRes, wAttRes, staff] = await Promise.all([
    supabase.from('organizations').select('display_name').eq('id', organizationId).maybeSingle(),
    project.primary_client_id
      ? supabase.from('clients').select('first_name, last_name').eq('id', project.primary_client_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('walkthrough_items').select('*').eq('walkthrough_id', walkthroughId).order('sort_order'),
    supabase.from('walkthrough_responses').select('item_id, response').eq('walkthrough_id', walkthroughId),
    supabase
      .from('project_issues')
      .select('id, item_id, category, item_label, homeowner_description, status, priority, due_date, responsible_user_id, corrective_action, homeowner_validation')
      .eq('walkthrough_id', walkthroughId)
      .order('reported_at'),
    supabase.from('walkthrough_attachments').select('item_id').eq('walkthrough_id', walkthroughId),
    getStaffMembers(organizationId),
  ])

  const items = withItemNumbers(
    (itemsRes.data ?? []) as { id: string; category: string; label: string; item_number?: string | null; location?: string | null }[],
  )
  const itemById = new Map(items.map((i) => [i.id, i]))
  const staffName = new Map(staff.map((m) => [m.user_id, m.full_name || m.email || 'Team member']))
  const issues = (issuesRes.data ?? [])
    .map((i) => ({ ...i, numbered: i.item_id ? itemById.get(i.item_id) : undefined }))
    .sort((a, b) => compareItemNumbers(a.numbered?.number ?? '', b.numbered?.number ?? ''))
  const issueIds = issues.map((i) => i.id)
  const iAttRes = issueIds.length
    ? await supabase.from('issue_attachments').select('issue_id').in('issue_id', issueIds)
    : { data: [] as { issue_id: string }[] }

  const countBy = <T,>(rows: T[] | null | undefined, key: (r: T) => string) => {
    const m = new Map<string, number>()
    for (const r of rows ?? []) m.set(key(r), (m.get(key(r)) ?? 0) + 1)
    return m
  }
  const itemAtt = countBy(wAttRes.data, (r) => r.item_id)
  const issueAtt = countBy(iAttRes.data, (r) => r.issue_id)
  const responses = new Map((respRes.data ?? []).map((r) => [r.item_id, r.response as keyof typeof RESPONSE_LABELS | null]))

  const totals = { items: 0, satisfactory: 0, needsAttention: 0, notApplicable: 0, unanswered: 0, outstandingIssues: 0 }
  const sectionMap = new Map<string, ReportSnapshot['sections'][number]>()
  for (const item of items) {
    const r = responses.get(item.id) ?? null
    totals.items++
    if (r === 'satisfactory') totals.satisfactory++
    else if (r === 'needs_attention') totals.needsAttention++
    else if (r === 'not_applicable') totals.notApplicable++
    else totals.unanswered++
    if (!sectionMap.has(item.category)) sectionMap.set(item.category, { category: item.category, items: [] })
    sectionMap.get(item.category)!.items.push({
      number: item.number,
      location: item.place,
      label: item.label,
      response: r ? RESPONSE_LABELS[r] : 'Not answered',
      attachments: itemAtt.get(item.id) ?? 0,
    })
  }
  totals.outstandingIssues = issues.filter((i) => OUTSTANDING.has(i.status)).length

  const client = clientRes.data as { first_name: string | null; last_name: string | null } | null
  const snapshot: ReportSnapshot = {
    organization: orgRes.data?.display_name ?? 'B & J Custom Homes',
    project: {
      id: project.id,
      name: project.name,
      number: project.project_number,
      address: [project.address_line1, [project.city, project.state].filter(Boolean).join(', '), project.postal_code].filter(Boolean).join(' '),
    },
    homeowner: client ? [client.first_name, client.last_name].filter(Boolean).join(' ') : 'Not recorded',
    walkthrough: {
      id: w.id,
      title: w.title,
      type: WALKTHROUGH_TYPE_LABELS[w.walkthrough_type] ?? w.walkthrough_type,
      scheduledDate: w.scheduled_date,
      submittedAt: w.submitted_at,
    },
    sections: [...sectionMap.values()],
    issues: issues.map((i) => ({
      number: i.numbered?.number,
      location: i.numbered?.place ?? null,
      responsible: i.responsible_user_id ? staffName.get(i.responsible_user_id) ?? 'Former team member' : null,
      category: i.category,
      item: i.item_label,
      description: i.homeowner_description,
      status: ISSUE_STATUS_LABELS[i.status as keyof typeof ISSUE_STATUS_LABELS] ?? i.status,
      priority: PRIORITY_LABELS[i.priority as keyof typeof PRIORITY_LABELS] ?? i.priority,
      dueDate: i.due_date,
      correctiveAction: i.corrective_action,
      validation: VALIDATION_LABELS[i.homeowner_validation as keyof typeof VALIDATION_LABELS] ?? i.homeowner_validation,
      attachments: issueAtt.get(i.id) ?? 0,
    })),
    totals,
    generatedAt: new Date().toISOString(),
  }
  return { snapshot, projectId: project.id }
}

const WIN_ANSI_MAP: Record<string, string> = {
  '\u2018': "'", '\u2019': "'", '\u201C': '"', '\u201D': '"', '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2022': '-', '\u00A0': ' ',
}
function pdfSafe(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201C\u201D\u2013\u2014\u2026\u2022\u00A0]/g, (c) => WIN_ANSI_MAP[c] ?? '')
    .replace(/\r/g, '')
    .replace(/\t/g, '  ')
    .replace(/[^\x20-\x7E\xA1-\xFF\n]/g, '?')
}

const fmtDate = (v: string | null) =>
  v ? new Date(v.length === 10 ? `${v}T12:00:00Z` : v).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'America/Chicago' }) : 'Not set'
const fmtDateTime = (v: string | null) =>
  v ? new Date(v).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Chicago' }) + ' CT' : 'Not set'

export async function renderWalkthroughPdf(s: ReportSnapshot, version: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(pdfSafe(`${s.walkthrough.title} - Report v${version}`))
  doc.setAuthor(pdfSafe(s.organization))
  doc.setCreationDate(new Date(s.generatedAt))
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.11, 0.13, 0.16)
  const muted = rgb(0.42, 0.45, 0.5)
  const rule = rgb(0.85, 0.86, 0.88)
  const W = 612, H = 792, M = 54, contentW = W - M * 2

  let logo: Awaited<ReturnType<PDFDocument['embedPng']>> | null = null
  try {
    logo = await doc.embedPng(await readFile(path.join(process.cwd(), 'public/branding/bj-custom-homes-logo.png')))
  } catch {
    logo = null
  }

  let page: PDFPage = doc.addPage([W, H])
  let y = H - M
  const newPage = () => { page = doc.addPage([W, H]); y = H - M }
  const ensure = (h: number) => { if (y - h < M + 24) newPage() }

  const wrap = (text: string, f: PDFFont, size: number, width: number) => {
    const lines: string[] = []
    for (const para of pdfSafe(text).split('\n')) {
      let line = ''
      for (const word of para.split(/\s+/)) {
        if (!word) continue
        const test = line ? `${line} ${word}` : word
        if (f.widthOfTextAtSize(test, size) <= width) { line = test; continue }
        if (line) lines.push(line)
        let w = word
        while (f.widthOfTextAtSize(w, size) > width) {
          let cut = w.length
          while (cut > 1 && f.widthOfTextAtSize(w.slice(0, cut), size) > width) cut--
          lines.push(w.slice(0, cut))
          w = w.slice(cut)
        }
        line = w
      }
      lines.push(line)
    }
    return lines
  }
  const text = (t: string, opts: { f?: PDFFont; size?: number; color?: typeof ink; x?: number; width?: number; gap?: number } = {}) => {
    const f = opts.f ?? font, size = opts.size ?? 10, x = opts.x ?? M, lh = size * 1.35
    for (const line of wrap(t, f, size, opts.width ?? contentW - (x - M))) {
      ensure(lh)
      page.drawText(line, { x, y: y - size, size, font: f, color: opts.color ?? ink })
      y -= lh
    }
    y -= opts.gap ?? 0
  }
  const hr = () => { ensure(12); page.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.75, color: rule }); y -= 14 }
  const heading = (t: string) => { ensure(40); y -= 8; text(t, { f: bold, size: 13, gap: 2 }); hr() }
  const field = (label: string, value: string) => {
    ensure(14)
    page.drawText(pdfSafe(label), { x: M, y: y - 9.5, size: 9.5, font: bold, color: muted })
    const lines = wrap(value, font, 9.5, contentW - 130)
    for (const [i, l] of lines.entries()) {
      if (i > 0) ensure(13)
      page.drawText(l, { x: M + 130, y: y - 9.5, size: 9.5, font, color: ink })
      y -= 13
    }
  }

  if (logo) {
    const lh = 40, lw = (logo.width / logo.height) * lh
    page.drawImage(logo, { x: M, y: y - lh, width: Math.min(lw, 200), height: lh })
  }
  page.drawText(pdfSafe(`Report version ${version}`), { x: W - M - bold.widthOfTextAtSize(`Report version ${version}`, 10), y: y - 12, size: 10, font: bold, color: ink })
  y -= 56
  text(s.walkthrough.title, { f: bold, size: 18, gap: 2 })
  text(`${s.walkthrough.type} walkthrough report`, { color: muted, size: 11, gap: 10 })

  heading('Project')
  field('Project', `${s.project.name} (${s.project.number})`)
  field('Address', s.project.address || 'Not recorded')
  field('Homeowner', s.homeowner)
  field('Builder', s.organization)
  field('Scheduled', fmtDate(s.walkthrough.scheduledDate))
  field('Submitted', fmtDateTime(s.walkthrough.submittedAt))
  field('Report generated', fmtDateTime(s.generatedAt))

  heading('Summary')
  const t = s.totals
  field('Checklist items', String(t.items))
  field('Satisfactory', String(t.satisfactory))
  field('Needs attention', String(t.needsAttention))
  field('Not applicable', String(t.notApplicable))
  if (t.unanswered) field('Not answered', String(t.unanswered))
  field('Issues reported', String(s.issues.length))
  field('Outstanding issues', String(t.outstandingIssues))

  heading('Checklist responses')
  for (const section of s.sections) {
    ensure(30)
    text(section.category, { f: bold, size: 10.5, gap: 2 })
    for (const item of section.items) {
      const right = item.response + (item.attachments ? `  (${item.attachments} file${item.attachments === 1 ? '' : 's'})` : '')
      const rw = font.widthOfTextAtSize(pdfSafe(right), 9.5)
      const numW = item.number ? 34 : 0
      const labelText = item.location ? `${item.label} - ${item.location}` : item.label
      const lines = wrap(labelText, font, 9.5, contentW - rw - 24 - numW)
      ensure(lines.length * 13)
      page.drawText(pdfSafe(right), { x: W - M - rw, y: y - 9.5, size: 9.5, font: item.response === 'Needs attention' ? bold : font, color: ink })
      if (item.number) page.drawText(pdfSafe(item.number), { x: M + 10, y: y - 9.5, size: 9.5, font: bold, color: muted })
      for (const l of lines) { page.drawText(l, { x: M + 10 + numW, y: y - 9.5, size: 9.5, font, color: ink }); y -= 13 }
    }
    y -= 6
  }

  heading('Reported issues')
  if (!s.issues.length) text('No issues were reported in this walkthrough.', { color: muted })
  for (const [i, issue] of s.issues.entries()) {
    ensure(70)
    text(`${issue.number ?? i + 1}. ${issue.category} - ${issue.item}`, { f: bold, size: 10.5, gap: 1 })
    if (issue.location) field('Location', issue.location)
    field('Status', `${issue.status}  |  Priority: ${issue.priority}  |  Due: ${fmtDate(issue.dueDate)}`)
    if (issue.responsible !== undefined) field('Responsible', issue.responsible ?? 'Unassigned')
    field('Homeowner note', issue.description)
    if (issue.correctiveAction) field('Corrective action', issue.correctiveAction)
    field('Homeowner validation', issue.validation)
    if (issue.attachments) field('Attachments', `${issue.attachments} photo/video file${issue.attachments === 1 ? '' : 's'} on file in the project record`)
    y -= 8
  }

  const pages = doc.getPages()
  for (const [i, p] of pages.entries()) {
    const footer = pdfSafe(`${s.organization}  |  ${s.project.number}  |  Report v${version}  |  Page ${i + 1} of ${pages.length}`)
    p.drawText(footer, { x: M, y: M - 24, size: 8, font, color: muted })
  }
  return doc.save()
}

export function acknowledgmentStatement(version: number, sha256: string, decision: 'acknowledged' | 'accepted' | 'changes_requested') {
  const base = `I have reviewed walkthrough report version ${version} (document fingerprint ${sha256.slice(0, 16)}).`
  if (decision === 'accepted') return `${base} I accept the report as an accurate record of the walkthrough.`
  if (decision === 'changes_requested') return `${base} I am requesting changes before I accept it.`
  return `${base} I acknowledge that I have received it.`
}
