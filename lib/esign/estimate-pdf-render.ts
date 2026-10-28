import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { EstimateRecord } from '@/lib/estimate-queries'
import { clientDisplayName } from '@/lib/estimate-queries'
import {
  ESTIMATE_CATEGORIES,
  ESTIMATE_STATUS_LABELS,
  formatCentsExact,
  formatPercent,
  formatQuantity,
  type EstimateLineItem,
} from '@/lib/estimates'
import { formatAddress, formatDate } from '@/lib/format'
import type { OrganizationBrand } from '@/lib/branding'

/**
 * Server-side rendering of the same estimate print layout (app/print/estimates/[id]) as a real PDF,
 * using the same records, grouping, totals, and formatters. The print route relies on the browser's
 * print dialog, which cannot run on the server, so signing snapshots are produced here.
 */

const GREEN = rgb(0x17 / 255, 0x4d / 255, 0x32 / 255)
const DEEP = rgb(0x10 / 255, 0x3b / 255, 0x27 / 255)
const SAGE = rgb(0xea / 255, 0xf0 / 255, 0xe9 / 255)
const INK = rgb(0.09, 0.09, 0.09)
const MUTED = rgb(0.4, 0.4, 0.4)
const RULE = rgb(0.86, 0.86, 0.86)

const PAGE_W = 612
const PAGE_H = 792
const M = 48
const CONTENT_W = PAGE_W - M * 2
const FOOTER_H = 36

const COL_QTY = 392
const COL_UNIT = 478
const COL_TOTAL = PAGE_W - M
const DESC_W = 270

/** Standard PDF fonts only cover WinAnsi; map common typography and drop anything else rather than failing. */
function safe(text: string | null | undefined): string {
  return (text ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019\u201a]/g, "'")
    .replace(/[\u201c\u201d\u201e]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2192/g, '->')
    .replace(/\t/g, ' ')
    .replace(/[^\n\x20-\x7e\xa0-\xff]/g, '')
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const out: string[] = []
  for (const paragraph of safe(text).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let line = ''
    for (let word of words) {
      while (font.widthOfTextAtSize(word, size) > maxWidth) {
        let cut = word.length - 1
        while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--
        if (line) {
          out.push(line)
          line = ''
        }
        out.push(word.slice(0, cut))
        word = word.slice(cut)
      }
      const next = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(next, size) <= maxWidth) line = next
      else {
        out.push(line)
        line = word
      }
    }
    if (line) out.push(line)
  }
  return out
}

export async function renderEstimatePdf(input: {
  estimate: EstimateRecord
  items: EstimateLineItem[]
  brand: OrganizationBrand
  generatedAt: Date
}): Promise<Uint8Array> {
  const { estimate, items, brand } = input
  const project = estimate.project
  if (!project) throw new Error('Estimate project is missing')

  const pdf = await PDFDocument.create()
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const mono = await pdf.embedFont(StandardFonts.Courier)

  const companyName = brand.legalName || brand.displayName
  pdf.setTitle(safe(`${project.project_number} ${project.name} - ${estimate.estimate_number} Rev ${estimate.revision}`))
  pdf.setAuthor(safe(companyName))
  pdf.setSubject('Construction Estimate')
  pdf.setCreator(safe(companyName))
  pdf.setCreationDate(input.generatedAt)
  pdf.setModificationDate(input.generatedAt)

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H])
  let y = PAGE_H - M

  const text = (value: string, x: number, atY: number, font: PDFFont, size: number, color = INK) =>
    page.drawText(safe(value), { x, y: atY, size, font, color })
  const right = (value: string, xRight: number, atY: number, font: PDFFont, size: number, color = INK) => {
    const v = safe(value)
    page.drawText(v, { x: xRight - font.widthOfTextAtSize(v, size), y: atY, size, font, color })
  }
  const rule = (atY: number, color = RULE, thickness = 0.75, x1 = M, x2 = PAGE_W - M) =>
    page.drawLine({ start: { x: x1, y: atY }, end: { x: x2, y: atY }, thickness, color })

  let inTable = false
  const tableHeader = () => {
    text('DESCRIPTION', M + 6, y - 10, bold, 7.5, MUTED)
    right('QTY', COL_QTY, y - 10, bold, 7.5, MUTED)
    right('UNIT COST', COL_UNIT, y - 10, bold, 7.5, MUTED)
    right('TOTAL', COL_TOTAL - 6, y - 10, bold, 7.5, MUTED)
    y -= 16
    rule(y, rgb(0.75, 0.75, 0.75), 1.5)
    y -= 4
  }
  const ensure = (height: number) => {
    if (y - height >= M + FOOTER_H) return
    page = pdf.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - M
    text(`${estimate.estimate_number} · Rev ${estimate.revision} · ${project.name}`, M, y - 8, bold, 8, MUTED)
    y -= 22
    if (inTable) tableHeader()
  }

  // Header
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).join(' · ')
  const orEmpty = (v: string) => (v === '—' ? '' : v)
  const companyAddress = orEmpty(formatAddress({ address_line1: brand.addressLine1, city: brand.city, state: brand.state, postal_code: brand.postalCode }))
  text(companyName.toUpperCase(), M, y - 14, serif, 15, DEEP)
  let hy = y - 30
  if (companyAddress) {
    text(companyAddress, M, hy, sans, 9, MUTED)
    hy -= 12
  }
  if (contact) {
    text(contact, M, hy, sans, 9, MUTED)
    hy -= 12
  }
  right('CONSTRUCTION ESTIMATE', PAGE_W - M, y - 12, bold, 9, GREEN)
  right(`Status: ${ESTIMATE_STATUS_LABELS[estimate.status]}`, PAGE_W - M, y - 26, sans, 9, MUTED)
  y = Math.min(hy, y - 34) - 4
  rule(y, GREEN, 2)
  y -= 16

  // Project identification
  const projectAddress = orEmpty(formatAddress(project))
  const nameLines = wrap(project.name, serif, 18, CONTENT_W - 32)
  const clientName = clientDisplayName(estimate.client)
  const boxH = 30 + nameLines.length * 21 + (projectAddress ? 14 : 0) + 58
  page.drawRectangle({ x: M, y: y - boxH, width: CONTENT_W, height: boxH, color: SAGE, borderColor: RULE, borderWidth: 0.75 })
  page.drawRectangle({ x: M, y: y - boxH, width: 4, height: boxH, color: GREEN })
  let by = y - 18
  text('PROJECT', M + 18, by, bold, 7.5, MUTED)
  by -= 20
  for (const line of nameLines) {
    text(line, M + 18, by, serif, 18, DEEP)
    by -= 21
  }
  if (projectAddress) {
    text(projectAddress, M + 18, by + 4, sans, 9.5, rgb(0.25, 0.25, 0.25))
    by -= 14
  }
  by -= 2
  rule(by + 6, RULE, 0.75, M + 18, PAGE_W - M - 14)
  const colW = (CONTENT_W - 32) / 4
  const cells: [string, string, string | null, PDFFont][] = [
    ['PROJECT NO.', project.project_number || '-', null, mono],
    ['ESTIMATE NO.', `${estimate.estimate_number} · Rev ${estimate.revision}`, null, mono],
    ['ESTIMATE DATE', formatDate(estimate.estimate_date), estimate.expiration_date ? `Valid until ${formatDate(estimate.expiration_date)}` : 'No expiration date', bold],
    ['PREPARED FOR', clientName ?? 'Client not assigned', estimate.client?.email ?? null, bold],
  ]
  cells.forEach(([label, value, sub, font], i) => {
    const x = M + 18 + colW * i
    text(label, x, by - 10, bold, 7, MUTED)
    text(wrap(value, font, 9.5, colW - 8)[0] ?? '', x, by - 24, font, 9.5)
    if (sub) text(wrap(sub, sans, 8, colW - 8)[0] ?? '', x, by - 36, sans, 8, MUTED)
  })
  y -= boxH + 22

  // Title and description
  for (const line of wrap(estimate.name, serif, 13, CONTENT_W)) {
    ensure(18)
    text(line, M, y - 12, serif, 13)
    y -= 17
  }
  if (estimate.description) {
    for (const line of wrap(estimate.description, sans, 9.5, CONTENT_W)) {
      ensure(13)
      text(line, M, y - 10, sans, 9.5, rgb(0.25, 0.25, 0.25))
      y -= 13
    }
  }
  y -= 14

  // Line items, grouped exactly like the print view
  const groups = ESTIMATE_CATEGORIES.map((category) => {
    const rows = items.filter((i) => i.category === category)
    return { category, rows, total: rows.reduce((sum, r) => sum + r.line_total_cents, 0) }
  }).filter((g) => g.rows.length > 0)
  const unitCost = (i: EstimateLineItem) => i.material_unit_cents + i.labor_unit_cents + i.other_unit_cents

  if (!groups.length) {
    text('This estimate has no line items yet.', M, y - 10, sans, 9.5, MUTED)
    y -= 20
  } else {
    ensure(60)
    inTable = true
    tableHeader()
    for (const g of groups) {
      ensure(44)
      page.drawRectangle({ x: M, y: y - 18, width: CONTENT_W, height: 18, color: rgb(0.97, 0.97, 0.96) })
      text(g.category, M + 6, y - 12.5, bold, 9)
      right(formatCentsExact(g.total), COL_TOTAL - 6, y - 12.5, bold, 9)
      y -= 18
      rule(y)
      for (const r of g.rows) {
        const desc = wrap(r.description + (r.is_allowance ? ' (Allowance)' : ''), sans, 9, DESC_W)
        const notes = r.notes ? wrap(r.notes, sans, 7.5, DESC_W) : []
        const h = 8 + desc.length * 11 + notes.length * 9.5 + 4
        ensure(h)
        let ry = y - 13
        desc.forEach((line, i) => {
          text(line, M + 6, ry, sans, 9)
          if (i === 0) {
            right(`${formatQuantity(r.quantity)} ${r.unit}`, COL_QTY, ry, sans, 9)
            right(formatCentsExact(unitCost(r)), COL_UNIT, ry, sans, 9)
            right(formatCentsExact(r.line_total_cents), COL_TOTAL - 6, ry, sans, 9)
          }
          ry -= 11
        })
        for (const line of notes) {
          text(line, M + 6, ry + 1, sans, 7.5, MUTED)
          ry -= 9.5
        }
        y -= h
        rule(y, rgb(0.93, 0.93, 0.93), 0.5)
      }
    }
    inTable = false
    y -= 16
  }

  // Totals
  const summary: [string, number | null, boolean?][] = [
    ['Materials', estimate.material_cents],
    ['Labor', estimate.labor_cents],
    ['Other costs', estimate.other_cents],
    ['Direct cost', estimate.direct_cost_cents, true],
    ['Allowances', estimate.allowance_cents],
    [`Markup (${formatPercent(estimate.markup_percent)})`, estimate.markup_cents],
    [`Contingency (${formatPercent(estimate.contingency_percent)})`, estimate.contingency_cents],
  ]
  const totalsX = PAGE_W - M - 240
  ensure(summary.length * 15 + 70)
  for (const [label, value, strong] of summary) {
    if (strong) {
      rule(y - 2, RULE, 0.75, totalsX)
      y -= 4
    }
    text(label, totalsX, y - 11, strong ? bold : sans, 9, strong ? INK : MUTED)
    right(formatCentsExact(value), PAGE_W - M, y - 11, strong ? bold : sans, 9)
    y -= 15
  }
  rule(y - 2, INK, 1.5, totalsX)
  y -= 6
  text('Construction total', totalsX, y - 13, bold, 11)
  right(formatCentsExact(estimate.construction_total_cents), PAGE_W - M, y - 13, bold, 11)
  y -= 20
  if (estimate.land_cost_cents !== null) {
    text('Land cost (separate)', totalsX, y - 11, sans, 9, MUTED)
    right(formatCentsExact(estimate.land_cost_cents), PAGE_W - M, y - 11, sans, 9, MUTED)
    y -= 15
    text('Total including land', totalsX, y - 11, bold, 9.5)
    right(formatCentsExact(estimate.total_with_land_cents), PAGE_W - M, y - 11, bold, 9.5)
    y -= 18
  }

  // Footers
  const pages = pdf.getPages()
  const stamp = `${estimate.estimate_number} Rev ${estimate.revision} · Signing copy generated ${input.generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: PAGE_W - M, y: M + 18 }, thickness: 0.5, color: RULE })
    p.drawText(safe(`${companyName} · ${stamp}`), { x: M, y: M + 6, size: 7, font: sans, color: MUTED })
    const label = `Page ${i + 1} of ${pages.length}`
    p.drawText(label, { x: PAGE_W - M - sans.widthOfTextAtSize(label, 7), y: M + 6, size: 7, font: sans, color: MUTED })
  })

  return pdf.save()
}
