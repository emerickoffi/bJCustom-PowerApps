export type WalkthroughStatus = 'draft' | 'in_progress' | 'submitted'
export type ResponseValue = 'satisfactory' | 'needs_attention' | 'not_applicable'
export type IssueStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type HomeownerValidation = 'pending' | 'accepted' | 'rejected'
export type MediaKind = 'photo' | 'video'

export const MEDIA_BUCKET = 'project-media'
export const MAX_MEDIA_BYTES = 50 * 1024 * 1024
export const ISSUE_DESCRIPTION_MAX = 5000

export const WALKTHROUGH_STATUS_LABELS: Record<WalkthroughStatus, string> = {
  draft: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
}

export const RESPONSE_LABELS: Record<ResponseValue, string> = {
  satisfactory: 'Satisfactory',
  needs_attention: 'Needs Attention',
  not_applicable: 'Not Applicable',
}

export const RESPONSE_ORDER: ResponseValue[] = ['satisfactory', 'needs_attention', 'not_applicable']

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Repair complete',
  closed: 'Closed',
}

export const STAFF_SETTABLE_ISSUE_STATUSES: IssueStatus[] = ['open', 'in_progress', 'resolved']

export type IssuePriority = 'low' | 'normal' | 'high' | 'critical'
export const ISSUE_PRIORITIES: IssuePriority[] = ['low', 'normal', 'high', 'critical']
export const PRIORITY_LABELS: Record<IssuePriority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  critical: 'Critical',
}

export type IssueEventType =
  | 'reported'
  | 'status_changed'
  | 'assigned'
  | 'repair_recorded'
  | 'priority_changed'
  | 'due_date_changed'
  | 'builder_approved'
  | 'homeowner_accepted'
  | 'homeowner_rejected'
  | 'repair_photo_added'
  | 'builder_reply'
  | 'homeowner_comment'

export type IssueEvent = {
  id: string
  event_type: IssueEventType
  actor_id: string | null
  from_value: string | null
  to_value: string | null
  details: string | null
  created_at: string
}

export function isOverdue(dueDate: string | null, status: IssueStatus): boolean {
  if (!dueDate || status === 'closed' || status === 'resolved') return false
  return dueDate < new Date().toISOString().slice(0, 10)
}

export const VALIDATION_LABELS: Record<HomeownerValidation, string> = {
  pending: 'Awaiting homeowner',
  accepted: 'Homeowner confirmed',
  rejected: 'Homeowner reopened',
}

export const WALKTHROUGH_TYPE_LABELS: Record<string, string> = {
  orientation: 'Pre-drywall orientation',
  final: 'Final walkthrough',
  warranty_30: '30-day warranty',
  warranty_11: '11-month warranty',
  other: 'Other',
}

export const DEFAULT_CHECKLIST: { category: string; items: string[] }[] = [
  {
    category: 'Exterior',
    items: ['Siding and trim', 'Roof, gutters, and downspouts', 'Exterior doors and hardware', 'Driveway and walkways', 'Grading and drainage', 'Landscaping'],
  },
  {
    category: 'Kitchen',
    items: ['Cabinets and drawers', 'Countertops and backsplash', 'Sink, faucet, and disposal', 'Appliances', 'Lighting and outlets'],
  },
  {
    category: 'Living areas',
    items: ['Walls and ceilings', 'Flooring', 'Interior doors and trim', 'Windows and screens', 'Fireplace'],
  },
  {
    category: 'Bathrooms',
    items: ['Vanities and countertops', 'Toilets', 'Showers and tubs', 'Tile and grout', 'Mirrors and accessories', 'Exhaust fans'],
  },
  {
    category: 'Bedrooms',
    items: ['Walls and ceilings', 'Closets and shelving', 'Flooring', 'Windows and blinds'],
  },
  {
    category: 'Systems',
    items: ['HVAC and thermostat', 'Water heater', 'Electrical panel', 'Smoke and CO detectors', 'Garage door and opener'],
  },
]

export function mediaKindFor(mime: string): MediaKind | null {
  if (mime.startsWith('image/')) return 'photo'
  if (mime.startsWith('video/')) return 'video'
  return null
}

export function safeFileName(name: string): string {
  const cleaned = name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-120)
  return cleaned || 'upload'
}

export type MediaItem = {
  id: string
  storage_path: string
  file_name: string
  media_kind: MediaKind
  url: string | null
}
