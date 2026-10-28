import 'server-only'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

export const MAX_SIGNING_PDF_BYTES = 25 * 1024 * 1024

export type PacketSigner = { name: string; role: string; initials: boolean }

/**
 * Builds the file sent to the provider: the exact source PDF pages, unchanged, plus an appended signature page.
 * Fields are Dropbox Sign text tags, so the provider renders and enforces real signature, date, and initials fields;
 * hide_text_tags removes the tag text from the final document.
 */
export async function buildSigningPacket(source: Uint8Array, meta: {
  documentName: string
  versionNumber: number
  projectName: string
  organizationName: string
  signers: PacketSigner[]
}): Promise<Uint8Array> {
  let pdf: PDFDocument
  try {
    pdf = await PDFDocument.load(source, { updateMetadata: false })
  } catch {
    throw new Error('This PDF is password protected or damaged and cannot be prepared for signing.')
  }
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const ink = rgb(0.12, 0.16, 0.14)
  const muted = rgb(0.4, 0.44, 0.42)
  const tagInk = rgb(0.55, 0.58, 0.56)

  const initialers = meta.signers.map((s, i) => ({ ...s, n: i + 1 })).filter((s) => s.initials)
  if (initialers.length) {
    for (const page of pdf.getPages()) {
      const { width } = page.getSize()
      initialers.forEach((s, i) => {
        page.drawText(`[initial|req|signer${s.n}      ]`, { x: width - 120 - i * 110, y: 18, size: 9, font, color: tagInk })
      })
    }
  }

  const page = pdf.addPage([612, 792])
  let y = 740
  page.drawText('Signature page', { x: 56, y, size: 20, font: bold, color: ink })
  y -= 26
  const lines = [
    `Document: ${meta.documentName} (version ${meta.versionNumber})`,
    `Project: ${meta.projectName}`,
    `Prepared by: ${meta.organizationName}`,
  ]
  for (const line of lines) {
    page.drawText(truncate(line, 90), { x: 56, y, size: 10.5, font, color: muted })
    y -= 16
  }
  y -= 6
  page.drawText(
    'By signing below, each signer agrees to the document above. Signatures are collected electronically through Dropbox Sign,',
    { x: 56, y, size: 8.5, font, color: muted },
  )
  y -= 12
  page.drawText('which appends a verifiable audit trail to the completed document.', { x: 56, y, size: 8.5, font, color: muted })
  y -= 36

  meta.signers.forEach((s, i) => {
    const n = i + 1
    if (y < 110) return
    page.drawText(truncate(s.name, 60), { x: 56, y, size: 12, font: bold, color: ink })
    page.drawText(s.role, { x: 56, y: y - 14, size: 9, font, color: muted })
    y -= 44
    page.drawText(`[sig|req|signer${n}                                        ]`, { x: 56, y, size: 12, font, color: tagInk })
    page.drawText(`[date|req|signer${n}             ]`, { x: 380, y, size: 12, font, color: tagInk })
    page.drawLine({ start: { x: 56, y: y - 6 }, end: { x: 340, y: y - 6 }, thickness: 0.75, color: muted })
    page.drawLine({ start: { x: 380, y: y - 6 }, end: { x: 556, y: y - 6 }, thickness: 0.75, color: muted })
    page.drawText('Signature', { x: 56, y: y - 18, size: 8, font, color: muted })
    page.drawText('Date', { x: 380, y: y - 18, size: 8, font, color: muted })
    y -= 56
  })

  return pdf.save({ useObjectStreams: false })
}

function truncate(text: string, max: number) {
  const clean = text.replace(/[^\x20-\x7E]/g, ' ')
  return clean.length > max ? `${clean.slice(0, max - 1)}…`.replace('…', '...') : clean
}
