// Which fields each support section shows, and how. Pure, so it can be tested without a server.
import type { SupportSection } from './support-access-shared.ts'

export type ColumnKind = 'text' | 'date' | 'datetime' | 'cents' | 'percent' | 'bool' | 'number'
export type SupportColumn = { key: string; label: string; kind: ColumnKind }

const c = (key: string, label: string, kind: ColumnKind = 'text'): SupportColumn => ({ key, label, kind })

export const SUPPORT_COLUMNS: Record<Exclude<SupportSection, 'overview'>, SupportColumn[]> = {
  schedule: [
    c('name', 'Activity'),
    c('phase', 'Phase'),
    c('status', 'Status'),
    c('planned_start', 'Planned start', 'date'),
    c('planned_end', 'Planned end', 'date'),
    c('actual_start', 'Started', 'date'),
    c('actual_end', 'Finished', 'date'),
    c('percent_complete', 'Done', 'percent'),
    c('delay_reason', 'Delay reason'),
    c('is_published', 'Shared with homeowner', 'bool'),
  ],
  daily_logs: [
    c('log_date', 'Date', 'date'),
    c('status', 'Status'),
    c('weather_conditions', 'Weather'),
    c('temperature_f', '°F', 'number'),
    c('work_performed', 'Work performed'),
    c('has_delays', 'Delays', 'bool'),
    c('delay_description', 'Delay'),
    c('finalized_at', 'Finalized', 'datetime'),
  ],
  issues: [
    c('item_label', 'Issue'),
    c('category', 'Category'),
    c('status', 'Status'),
    c('priority', 'Priority'),
    c('due_date', 'Due', 'date'),
    c('location', 'Location'),
    c('reported_source', 'Source'),
    c('reported_at', 'Reported', 'datetime'),
  ],
  rfis: [
    c('rfi_number', 'No.', 'number'),
    c('subject', 'Subject'),
    c('status', 'Status'),
    c('priority', 'Priority'),
    c('due_date', 'Due', 'date'),
    c('responder_name', 'Responder'),
    c('sent_at', 'Sent', 'datetime'),
    c('answered_at', 'Answered', 'datetime'),
  ],
  change_orders: [
    c('co_number', 'No.'),
    c('title', 'Title'),
    c('status', 'Status'),
    c('price_adjustment_cents', 'Price change', 'cents'),
    c('schedule_impact_days', 'Days', 'number'),
    c('sent_to_homeowner_at', 'Sent', 'datetime'),
    c('decision_at', 'Decided', 'datetime'),
  ],
  selections: [
    c('name', 'Selection'),
    c('category', 'Category'),
    c('location', 'Location'),
    c('status', 'Status'),
    c('allowance_cents', 'Allowance', 'cents'),
    c('selected_price_cents', 'Selected price', 'cents'),
    c('due_date', 'Due', 'date'),
  ],
  estimates: [
    c('estimate_number', 'No.'),
    c('name', 'Name'),
    c('revision', 'Rev.', 'number'),
    c('status', 'Status'),
    c('construction_total_cents', 'Total', 'cents'),
    c('estimate_date', 'Date', 'date'),
    c('decision_at', 'Decided', 'datetime'),
  ],
  invoices: [
    c('invoice_number', 'No.'),
    c('title', 'Title'),
    c('invoice_type', 'Type'),
    c('status', 'Status'),
    c('total_cents', 'Total', 'cents'),
    c('paid_cents', 'Paid', 'cents'),
    c('due_date', 'Due', 'date'),
    c('accounting_sync_status', 'QuickBooks'),
  ],
  documents: [
    c('name', 'Document'),
    c('category', 'Category'),
    c('visibility', 'Visibility'),
    c('current_version_number', 'Version', 'number'),
    c('updated_at', 'Updated', 'datetime'),
  ],
  photos: [
    c('file_name', 'File'),
    c('caption', 'Caption'),
    c('phase', 'Phase'),
    c('location', 'Location'),
    c('created_at', 'Uploaded', 'datetime'),
  ],
}

/** snake_case status values read better as words: "in_progress" → "In progress". */
export function humanize(value: string): string {
  const spaced = value.replace(/_/g, ' ').trim()
  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : spaced
}
