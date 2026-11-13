import 'server-only'
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import type { EstimateRecord } from '@/lib/estimate-queries'
import { clientDisplayName } from '@/lib/estimate-queries'
import { formatCentsExact } from '@/lib/estimates'
import { formatAddress, formatDate } from '@/lib/format'
import type { OrganizationBrand } from '@/lib/branding'
import { closingSections, pricingRows, type ClientPricing, type ProposalContent } from '@/lib/proposals'
import { safe, wrap } from '@/lib/esign/estimate-pdf-render'

/**
 * Customer-facing proposal PDF: the same content as the on-screen proposal preview and the homeowner
 * portal. Prices come from the server-side client pricing, so builder unit costs, markup and
 * contingency percentages, and internal line notes are never written into the file.
 */

const GREEN = rgb(0x17 / 255, 0x4d / 255, 0x32 / 255)
const DEEP = rgb(0x10 / 255, 0x3b / 255, 0x27 / 255)
const SAGE = rgb(0xea / 255, 0xf0 / 255, 0xe9 / 255)
const INK = rgb(0.09, 0.09, 0.09)
const BODY = rgb(0.22, 0.22, 0.22)
const MUTED = rgb(0.4, 0.4, 0.4)
const RULE = rgb(0.86, 0.86, 0.86)

const PAGE_W = 612
const PAGE_H = 792
const M = 54
const CONTENT_W = PAGE_W - M * 2
const FOOTER_H = 36

export async function renderProposalPdf(input: {
  estimate: EstimateRecord
  proposal: ProposalContent
  pricing: ClientPricing
  brand: OrganizationBrand
  generatedAt: Date
  purpose: 'download' | 'signing'
}): Promise<Uint8Array> {
  const { estimate, proposal, pricing, brand } = input
  const project = estimate.project
  if (!project) throw new Error('Estimate project is missing')

  const pdf = await PDFDocument.create()
  const sans = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const serif = await pdf.embedFont(StandardFonts.TimesRomanBold)
  const mono = await pdf.embedFont(StandardFonts.Courier)

  const companyName = brand.legalName || brand.displayName
  const number = `${estimate.estimate_number} Rev ${estimate.revision}`
  pdf.setTitle(safe(`${proposal.title} - Proposal ${number}`))
  pdf.setAuthor(safe(companyName))
  pdf.setSubject('Construction Proposal')
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
  const ensure = (height: number) => {
    if (y - height >= M + FOOTER_H) return
    page = pdf.addPage([PAGE_W, PAGE_H])
    y = PAGE_H - M
    text(`Proposal ${number} · ${project.name}`, M, y - 8, bold, 8, MUTED)
    y -= 24
  }
  const heading = (label: string) => {
    ensure(40)
    y -= 6
    text(label.toUpperCase(), M, y - 10, bold, 8.5, GREEN)
    y -= 20
  }
  const paragraph = (value: string, size = 10, color = BODY) => {
    for (const line of wrap(value, sans, size, CONTENT_W)) {
      ensure(size + 4)
      if (line) text(line, M, y - size, sans, size, color)
      y -= size + 4
    }
    y -= 6
  }

  // Letterhead
  const orEmpty = (v: string) => (v === '—' ? '' : v)
  const companyAddress = orEmpty(formatAddress({ address_line1: brand.addressLine1, city: brand.city, state: brand.state, postal_code: brand.postalCode }))
  const contact = [brand.phone, brand.email, brand.website].filter(Boolean).join(' · ')
  text(companyName.toUpperCase(), M, y - 14, serif, 15, DEEP)
  let hy = y - 30
  for (const line of [companyAddress, contact].filter(Boolean)) {
    text(line, M, hy, sans, 9, MUTED)
    hy -= 12
  }
  right('PROPOSAL', PAGE_W - M, y - 12, bold, 9, GREEN)
  y = Math.min(hy, y - 26) - 4
  rule(y, GREEN, 2)
  y -= 16

  // Project block
  const projectAddress = orEmpty(formatAddress(project))
  const nameLines = wrap(project.name, serif, 18, CONTENT_W - 32)
  const boxH = 30 + nameLines.length * 21 + (projectAddress ? 14 : 0) + 50
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
    text(projectAddress, M + 18, by + 4, sans, 9.5, BODY)
    by -= 14
  }
  rule(by + 4, RULE, 0.75, M + 18, PAGE_W - M - 14)
  const colW = (CONTENT_W - 32) / 4
  const cells: [string, string, PDFFont][] = [
    ['PROPOSAL NO.', number, mono],
    ['DATE', formatDate(estimate.estimate_date), bold],
    ['VALID UNTIL', estimate.expiration_date ? formatDate(estimate.expiration_date) : 'No expiration', bold],
    ['PREPARED FOR', clientDisplayName(estimate.client) ?? 'Client not assigned', bold],
  ]
  cells.forEach(([label, value, font], i) => {
    const x = M + 18 + colW * i
    text(label, x, by - 12, bold, 7, MUTED)
    text(wrap(value, font, 9.5, colW - 8)[0] ?? '', x, by - 26, font, 9.5)
  })
  y -= boxH + 22

  for (const line of wrap(proposal.title, serif, 16, CONTENT_W)) {
    ensure(22)
    text(line, M, y - 15, serif, 16)
    y -= 21
  }
  y -= 8

  if (proposal.introduction) {
    heading('Introduction')
    paragraph(proposal.introduction)
  }
  if (proposal.show_scope && estimate.description) {
    heading('Scope of work')
    paragraph(estimate.description)
  }

  // Pricing
  heading('Pricing')
  const rows = pricingRows(pricing, proposal.pricing_display)
  for (const row of rows) {
    const labelLines = wrap(row.label, sans, 10, CONTENT_W - 120)
    const h = labelLines.length * 13 + (row.detail ? 11 : 0) + 8
    ensure(h)
    let ry = y - 11
    labelLines.forEach((line, i) => {
      text(line, M, ry, i === 0 ? bold : sans, 10)
      if (i === 0) right(formatCentsExact(row.cents), PAGE_W - M, ry, sans, 10)
      ry -= 13
    })
    if (row.detail) text(row.detail, M, ry + 2, sans, 8, MUTED)
    y -= h
    rule(y + 2, rgb(0.93, 0.93, 0.93), 0.5)
  }
  y -= 8
  const totalsX = PAGE_W - M - 230
  const hasLand = (pricing.land_cost_cents ?? 0) > 0
  ensure(80)
  if (pricing.allowance_cents > 0) {
    text('Allowances included', totalsX, y - 11, sans, 9, MUTED)
    right(formatCentsExact(pricing.allowance_cents), PAGE_W - M, y - 11, sans, 9, MUTED)
    y -= 16
  }
  rule(y - 2, INK, 1.25, totalsX)
  y -= 6
  text(hasLand ? 'Construction total' : 'Total', totalsX, y - 13, bold, 11)
  right(formatCentsExact(pricing.construction_total_cents), PAGE_W - M, y - 13, bold, 11)
  y -= 20
  if (hasLand) {
    text('Land', totalsX, y - 11, sans, 9.5, MUTED)
    right(formatCentsExact(pricing.land_cost_cents), PAGE_W - M, y - 11, sans, 9.5)
    y -= 16
    text('Total', totalsX, y - 12, bold, 11)
    right(formatCentsExact(pricing.total_with_land_cents), PAGE_W - M, y - 12, bold, 11)
    y -= 20
  }
  if (pricing.allowance_cents > 0) {
    y -= 4
    paragraph('Allowances are budgets for items you select. Selections above or below an allowance are adjusted by change order.', 8.5, MUTED)
  }

  for (const s of closingSections(proposal)) {
    heading(s.heading)
    paragraph(s.body, s.field === 'terms' ? 9 : 10)
  }

  // Acceptance
  heading('Acceptance')
  if (proposal.acceptance_text) paragraph(proposal.acceptance_text)
  ensure(70)
  y -= 34
  const half = (CONTENT_W - 30) / 2
  for (const [i, label] of ['Homeowner signature', 'Date'].entries()) {
    const x = M + i * (half + 30)
    rule(y, rgb(0.45, 0.45, 0.45), 0.75, x, x + half)
    text(label, x, y - 12, sans, 8, MUTED)
  }
  y -= 24

  const pages = pdf.getPages()
  const stamp = input.purpose === 'signing' ? 'Signing copy' : 'Generated'
  const footer = `${companyName} · Proposal ${number} · ${stamp} ${input.generatedAt.toISOString().slice(0, 10)}`
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 18 }, end: { x: PAGE_W - M, y: M + 18 }, thickness: 0.5, color: RULE })
    p.drawText(safe(footer), { x: M, y: M + 6, size: 7, font: sans, color: MUTED })
    const label = `Page ${i + 1} of ${pages.length}`
    p.drawText(label, { x: PAGE_W - M - sans.widthOfTextAtSize(label, 7), y: M + 6, size: 7, font: sans, color: MUTED })
  })

  return pdf.save()
}
