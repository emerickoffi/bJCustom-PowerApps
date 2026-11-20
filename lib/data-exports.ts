/**
 * Spreadsheet (CSV) exports: dataset definitions and the CSV writer. Pure, so node --test can load it.
 * Money is written as plain dollars (1250.5), dates as YYYY-MM-DD, so Excel and Google Sheets read them as numbers and dates.
 */
import type { JobCostReportRow } from './job-costing-report.ts'

export type Cell = string | number | null | undefined
export type Row = Record<string, unknown>

/** Text cells that start like a formula are prefixed so a spreadsheet never runs them. Real numbers are written as-is. */
export function cell(value: Cell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  let s = value
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function csv(headers: string[], rows: Cell[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export const dollars = (cents: unknown): number | null => {
  if (cents === null || cents === undefined || cents === '') return null
  const n = Number(cents)
  return Number.isFinite(n) ? Math.round(n) / 100 : null
}
export const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : '')
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v))
const hours = (minutes: unknown) => (minutes === null || minutes === undefined ? null : Math.round((Number(minutes) / 60) * 100) / 100)

export type ExportContext = {
  projectName: (id: unknown) => string
  clientName: (id: unknown) => string
  personName: (id: unknown) => string
  invoiceNumber: (id: unknown) => string
}

export type DatasetKey = 'clients' | 'projects' | 'invoices' | 'payments' | 'vendor_bills' | 'time_entries'

export type Dataset = {
  key: DatasetKey
  label: string
  description: string
  table: string
  select: string
  /** Module that must be on for this export to be offered. */
  feature?: 'invoices' | 'time_tracking'
  /** Needs the job costing tables. */
  costTracking?: boolean
  orderBy: string
  columns: { header: string; value: (row: Row, ctx: ExportContext) => Cell }[]
}

export const DATASETS: Dataset[] = [
  {
    key: 'clients',
    label: 'Clients',
    description: 'Names, contact details, addresses and status.',
    table: 'clients',
    select:
      'id, first_name, middle_name, last_name, company_name, email, phone, alternate_phone, address_line1, address_line2, city, state, postal_code, country, status, preferred_communication, notes, created_at, archived_at',
    orderBy: 'last_name',
    columns: [
      { header: 'First Name', value: (r) => text(r.first_name) },
      { header: 'Middle Name', value: (r) => text(r.middle_name) },
      { header: 'Last Name', value: (r) => text(r.last_name) },
      { header: 'Company', value: (r) => text(r.company_name) },
      { header: 'Email', value: (r) => text(r.email) },
      { header: 'Phone', value: (r) => text(r.phone) },
      { header: 'Alternate Phone', value: (r) => text(r.alternate_phone) },
      { header: 'Street Address', value: (r) => text(r.address_line1) },
      { header: 'Address Line 2', value: (r) => text(r.address_line2) },
      { header: 'City', value: (r) => text(r.city) },
      { header: 'State', value: (r) => text(r.state) },
      { header: 'ZIP Code', value: (r) => text(r.postal_code) },
      { header: 'Country', value: (r) => text(r.country) },
      { header: 'Status', value: (r) => text(r.status) },
      { header: 'Preferred Contact', value: (r) => text(r.preferred_communication) },
      { header: 'Notes', value: (r) => text(r.notes) },
      { header: 'Created', value: (r) => day(r.created_at) },
      { header: 'Archived', value: (r) => day(r.archived_at) },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    description: 'Every job with its client, address, status, budget and dates.',
    table: 'projects',
    select:
      'id, project_number, name, status, project_type, primary_client_id, project_manager_id, address_line1, address_line2, city, state, postal_code, lot, block, community, estimated_budget_cents, proposed_start_date, target_completion_date, progress_percent, created_at, archived_at',
    orderBy: 'name',
    columns: [
      { header: 'Project Number', value: (r) => text(r.project_number) },
      { header: 'Project Name', value: (r) => text(r.name) },
      { header: 'Client', value: (r, c) => c.clientName(r.primary_client_id) },
      { header: 'Status', value: (r) => text(r.status) },
      { header: 'Project Type', value: (r) => text(r.project_type) },
      { header: 'Project Manager', value: (r, c) => c.personName(r.project_manager_id) },
      { header: 'Street Address', value: (r) => text(r.address_line1) },
      { header: 'Address Line 2', value: (r) => text(r.address_line2) },
      { header: 'City', value: (r) => text(r.city) },
      { header: 'State', value: (r) => text(r.state) },
      { header: 'ZIP Code', value: (r) => text(r.postal_code) },
      { header: 'Lot', value: (r) => text(r.lot) },
      { header: 'Block', value: (r) => text(r.block) },
      { header: 'Community', value: (r) => text(r.community) },
      { header: 'Budget', value: (r) => dollars(r.estimated_budget_cents) },
      { header: 'Start Date', value: (r) => day(r.proposed_start_date) },
      { header: 'Completion Date', value: (r) => day(r.target_completion_date) },
      { header: 'Progress %', value: (r) => (r.progress_percent === null || r.progress_percent === undefined ? null : Number(r.progress_percent)) },
      { header: 'Created', value: (r) => day(r.created_at) },
      { header: 'Archived', value: (r) => day(r.archived_at) },
    ],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    description: 'Every invoice and draw with totals, amount paid and status.',
    table: 'invoices',
    select: 'id, invoice_number, invoice_type, title, project_id, client_id, invoice_date, due_date, status, subtotal_cents, tax_cents, total_cents, paid_cents, voided_at',
    feature: 'invoices',
    orderBy: 'invoice_date',
    columns: [
      { header: 'Invoice Number', value: (r) => text(r.invoice_number) },
      { header: 'Title', value: (r) => text(r.title) },
      { header: 'Type', value: (r) => text(r.invoice_type) },
      { header: 'Project', value: (r, c) => c.projectName(r.project_id) },
      { header: 'Client', value: (r, c) => c.clientName(r.client_id) },
      { header: 'Invoice Date', value: (r) => day(r.invoice_date) },
      { header: 'Due Date', value: (r) => day(r.due_date) },
      { header: 'Status', value: (r) => text(r.status) },
      { header: 'Subtotal', value: (r) => dollars(r.subtotal_cents) },
      { header: 'Tax', value: (r) => dollars(r.tax_cents) },
      { header: 'Total', value: (r) => dollars(r.total_cents) },
      { header: 'Paid', value: (r) => dollars(r.paid_cents) },
      { header: 'Balance', value: (r) => (r.status === 'voided' || r.status === 'draft' ? 0 : dollars(Number(r.total_cents ?? 0) - Number(r.paid_cents ?? 0))) },
      { header: 'Voided', value: (r) => day(r.voided_at) },
    ],
  },
  {
    key: 'payments',
    label: 'Payments received',
    description: 'Homeowner payments recorded on invoices, including reversals.',
    table: 'invoice_payments',
    select: 'id, invoice_id, payment_date, amount_cents, method, reference, notes, reversed_at, reversal_reason',
    feature: 'invoices',
    orderBy: 'payment_date',
    columns: [
      { header: 'Payment Date', value: (r) => day(r.payment_date) },
      { header: 'Invoice Number', value: (r, c) => c.invoiceNumber(r.invoice_id) },
      { header: 'Amount', value: (r) => dollars(r.amount_cents) },
      { header: 'Method', value: (r) => text(r.method) },
      { header: 'Reference', value: (r) => text(r.reference) },
      { header: 'Notes', value: (r) => text(r.notes) },
      { header: 'Reversed', value: (r) => day(r.reversed_at) },
      { header: 'Reversal Reason', value: (r) => text(r.reversal_reason) },
    ],
  },
  {
    key: 'vendor_bills',
    label: 'Vendor bills',
    description: 'Bills from subcontractors and suppliers, by job and cost category.',
    table: 'vendor_bills',
    select: 'id, project_id, vendor_name, bill_number, bill_date, cost_category, description, status, amount_cents',
    costTracking: true,
    orderBy: 'bill_date',
    columns: [
      { header: 'Bill Date', value: (r) => day(r.bill_date) },
      { header: 'Vendor', value: (r) => text(r.vendor_name) },
      { header: 'Bill Number', value: (r) => text(r.bill_number) },
      { header: 'Project', value: (r, c) => c.projectName(r.project_id) },
      { header: 'Cost Category', value: (r) => text(r.cost_category) },
      { header: 'Description', value: (r) => text(r.description) },
      { header: 'Status', value: (r) => text(r.status) },
      { header: 'Amount', value: (r) => dollars(r.amount_cents) },
    ],
  },
  {
    key: 'time_entries',
    label: 'Time entries',
    description: 'Hours by person, job and cost code, with approval status and labor cost.',
    table: 'time_entries',
    select: 'id, user_id, project_id, cost_category, started_at, ended_at, break_minutes, worked_minutes, status, source, notes, cost_cents',
    feature: 'time_tracking',
    orderBy: 'started_at',
    columns: [
      { header: 'Date', value: (r) => day(r.started_at) },
      { header: 'Person', value: (r, c) => c.personName(r.user_id) },
      { header: 'Project', value: (r, c) => c.projectName(r.project_id) },
      { header: 'Cost Code', value: (r) => text(r.cost_category) },
      { header: 'Start', value: (r) => text(r.started_at) },
      { header: 'End', value: (r) => text(r.ended_at) },
      { header: 'Break (min)', value: (r) => (r.break_minutes === null || r.break_minutes === undefined ? null : Number(r.break_minutes)) },
      { header: 'Hours', value: (r) => hours(r.worked_minutes) },
      { header: 'Status', value: (r) => text(r.status) },
      { header: 'Entered By', value: (r) => (r.source === 'manual' ? 'By hand' : 'Clock') },
      { header: 'Labor Cost', value: (r) => dollars(r.cost_cents) },
      { header: 'Notes', value: (r) => text(r.notes) },
    ],
  },
]

export function datasetByKey(key: string): Dataset | null {
  return DATASETS.find((d) => d.key === key) ?? null
}

export function datasetCsv(dataset: Dataset, rows: Row[], ctx: ExportContext): string {
  return csv(
    dataset.columns.map((c) => c.header),
    rows.map((r) => dataset.columns.map((c) => c.value(r, ctx))),
  )
}

export function exportFileName(name: string, date: string): string {
  return `trefort-${name.replace(/_/g, '-')}-${date}.csv`
}

export function jobCostingCsv(rows: JobCostReportRow[]): string {
  const pct = (bp: number | null) => (bp === null ? null : bp / 100)
  return csv(
    ['Project Number', 'Job', 'Status', 'Contract', 'Budget', 'Cost to Date', 'Projected Final Cost', 'Over (-) / Under Budget', 'Projected Profit', 'Margin %', 'Billed', 'Collected', 'Note'],
    rows.map((r) => [
      r.projectNumber,
      r.name,
      r.status,
      dollars(r.contractCents),
      dollars(r.budgetCents),
      dollars(r.costToDateCents),
      dollars(r.forecastCents),
      dollars(r.overUnderCents),
      dollars(r.profitCents),
      pct(r.marginBasisPoints),
      dollars(r.billedCents),
      dollars(r.collectedCents),
      r.failed ? 'Could not load' : r.noBudget ? 'No approved estimate yet' : r.flag === 'over' ? 'Over budget' : r.flag === 'low_margin' ? 'Low margin' : '',
    ]),
  )
}
