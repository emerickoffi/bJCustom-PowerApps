import 'server-only'
import ExcelJS from 'exceljs'
import { safeCellText, wallClockDate, type PresentedEvent } from '@/lib/activity-history'

const FOREST = 'FF174D32'
const SAGE = 'FFEAF0E9'
const IVORY = 'FFF8F7F3'
const BORDER = 'FFE2E8E2'
const DEEP = 'FF103B27'

export type WorkbookInfo = {
  organizationName: string
  projectName: string
  projectNumber: string | null
  timeZone: string
  zoneName: string
  generatedAtLabel: string
  exportedBy: string
  scope: 'All history' | 'Filtered history'
  appliedFilters: string
}

const thin = { style: 'thin' as const, color: { argb: BORDER } }
const cellBorder = { top: thin, left: thin, bottom: thin, right: thin }

export async function buildHistoryWorkbook(events: PresentedEvent[], info: WorkbookInfo): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  wb.creator = info.organizationName
  wb.title = `${info.projectNumber ?? ''} ${info.projectName} Activity History`.trim()
  wb.subject = 'Construction schedule activity history'
  wb.created = new Date()

  const ws = wb.addWorksheet('Activity History', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '3:3' },
    headerFooter: { oddFooter: '&L&8Activity History&R&8Page &P of &N' },
  })

  ws.columns = [
    { key: 'date', width: 14 },
    { key: 'time', width: 11 },
    { key: 'activity', width: 30 },
    { key: 'type', width: 24 },
    { key: 'actor', width: 22 },
    { key: 'previous', width: 30 },
    { key: 'next', width: 30 },
    { key: 'description', width: 52 },
    { key: 'utc', width: 24 },
  ]

  ws.mergeCells('A1:I1')
  const title = ws.getCell('A1')
  title.value = safeCellText(`${info.projectNumber ? `${info.projectNumber} · ` : ''}${info.projectName} — Activity History`)
  title.font = { bold: true, size: 14, color: { argb: DEEP } }
  ws.getRow(1).height = 22

  ws.mergeCells('A2:I2')
  const subtitle = ws.getCell('A2')
  subtitle.value = safeCellText(
    `${info.organizationName} · ${info.scope} · Dates and times in ${info.timeZone} (${info.zoneName}) · UTC timestamp in last column`,
  )
  subtitle.font = { size: 9, italic: true, color: { argb: 'FF5B6B60' } }

  const header = ws.getRow(3)
  header.values = [
    'Event Date',
    'Event Time',
    'Activity Name',
    'Event Type',
    'Changed By',
    'Previous Value',
    'New Value',
    'Event Description',
    'Recorded (UTC)',
  ]
  header.height = 20
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOREST } }
    cell.alignment = { vertical: 'middle', wrapText: true }
    cell.border = cellBorder
  })

  events.forEach((e, i) => {
    const valueChanges = e.changes.filter((c) => !c.textOnly)
    const local = wallClockDate(e.createdAt, info.timeZone)
    const row = ws.addRow({
      date: local,
      time: local,
      activity: safeCellText(e.activityName),
      type: safeCellText(e.categories.map((c) => c.label).join(', ')),
      actor: safeCellText(e.actorName),
      previous: safeCellText(valueChanges.map((c) => `${c.label}: ${c.from}`).join('\n')),
      next: safeCellText(valueChanges.map((c) => `${c.label}: ${c.to}`).join('\n')),
      description: safeCellText(e.action),
      utc: e.createdAt,
    })
    row.getCell('date').numFmt = 'yyyy-mm-dd'
    row.getCell('time').numFmt = 'h:mm AM/PM'
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.alignment = { vertical: 'top', wrapText: true }
      cell.border = cellBorder
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: IVORY } }
    })
  })

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: Math.max(3, events.length + 3), column: 9 } }

  const meta = wb.addWorksheet('Export Information', { pageSetup: { orientation: 'portrait', fitToPage: true } })
  meta.columns = [
    { key: 'label', width: 28 },
    { key: 'value', width: 70 },
  ]
  const metaHeader = meta.addRow(['Field', 'Value'])
  metaHeader.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FOREST } }
    cell.border = cellBorder
  })
  const rows: [string, string | number][] = [
    ['Company / organization', info.organizationName],
    ['Project name', info.projectName],
    ['Project number', info.projectNumber ?? '—'],
    ['Export generated at', info.generatedAtLabel],
    ['Exported by', info.exportedBy],
    ['Export scope', info.scope],
    ['Applied filters', info.appliedFilters],
    ['Total exported records', events.length],
    ['Timezone / time representation', `Event Date and Event Time are local to ${info.timeZone} (${info.zoneName}). "Recorded (UTC)" is the stored ISO 8601 timestamp.`],
    ['Source', 'Copy of the project schedule audit log. The database history remains the authoritative record.'],
    ['Note', 'Text fields (internal notes, homeowner notes, delay reasons) are listed as updated without their contents.'],
  ]
  rows.forEach(([label, value], i) => {
    const row = meta.addRow([label, typeof value === 'number' ? value : safeCellText(value)])
    row.getCell(1).font = { bold: true, color: { argb: DEEP } }
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'top', wrapText: true, horizontal: 'left' }
      cell.border = cellBorder
      if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SAGE } }
    })
  })
  meta.views = [{ state: 'frozen', ySplit: 1 }]

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}
