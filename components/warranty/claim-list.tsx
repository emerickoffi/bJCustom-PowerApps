import { Paperclip } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { HomeownerClaimControls, StaffClaimControls, type StaffOption } from '@/components/warranty/claim-forms'

export const CLAIM_STATUS_LABELS: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under review',
  info_requested: 'Information requested',
  accepted: 'Accepted for repair',
  not_covered: 'Not covered',
  in_progress: 'Repair in progress',
  ready_for_validation: 'Ready for your review',
  closed: 'Closed',
}

const STAFF_STATUS_OVERRIDES: Record<string, string> = { ready_for_validation: 'Awaiting homeowner review' }

const EVENT_LABELS: Record<string, string> = {
  submitted: 'Claim submitted',
  start_review: 'Review started',
  request_info: 'Information requested',
  provide_info: 'Homeowner replied',
  accept: 'Accepted for repair',
  not_covered: 'Marked not covered',
  start_work: 'Repair started',
  ready_for_validation: 'Repair completed, awaiting homeowner review',
  accept_repair: 'Homeowner accepted the repair',
  reject_repair: 'Homeowner reported the repair is not resolved',
  close: 'Claim closed',
  assign: 'Assignment changed',
  note: 'Internal note',
  update_corrective: 'Corrective work updated',
}

type Claim = {
  id: string
  coverage_key: string
  category: string
  location: string
  title: string
  original_description: string
  submitted_after_coverage: boolean
  reported_by_role: string
  reported_at: string
  status: string
  coverage_decision_note: string | null
  assigned_to: string | null
  corrective_action: string | null
  homeowner_validation: string
  homeowner_validation_note: string | null
}

type ClaimEvent = {
  id: string
  claim_id: string
  event_type: string
  note: string | null
  visibility: string
  actor_role: string
  created_at: string
}

type ClaimMedia = { id: string; claim_id: string; storage_path: string; file_name: string; kind: string }

const STATUS_TONE: Record<string, string> = {
  submitted: 'bg-primary/10 text-primary',
  under_review: 'bg-primary/10 text-primary',
  info_requested: 'bg-amber-100 text-amber-900',
  ready_for_validation: 'bg-amber-100 text-amber-900',
  accepted: 'bg-secondary text-secondary-foreground',
  in_progress: 'bg-secondary text-secondary-foreground',
  not_covered: 'bg-muted text-muted-foreground',
  closed: 'bg-muted text-muted-foreground',
}

export async function ClaimList({
  projectId,
  audience,
  coverageNames,
  isManager = false,
  staff = [],
}: {
  projectId: string
  audience: 'staff' | 'homeowner'
  coverageNames: Record<string, string>
  isManager?: boolean
  staff?: StaffOption[]
}) {
  const supabase = await createClient()
  const { data: claimRows } = await supabase
    .from('warranty_claims')
    .select(
      'id, coverage_key, category, location, title, original_description, submitted_after_coverage, reported_by_role, reported_at, status, coverage_decision_note, assigned_to, corrective_action, homeowner_validation, homeowner_validation_note',
    )
    .eq('project_id', projectId)
    .order('reported_at', { ascending: false })
  const claims = (claimRows ?? []) as Claim[]

  if (claims.length === 0) {
    return (
      <p className="surface p-5 text-sm text-muted-foreground">
        {audience === 'homeowner' ? 'You have not submitted any warranty claims.' : 'No warranty claims for this project.'}
      </p>
    )
  }

  const ids = claims.map((c) => c.id)
  const [{ data: eventRows }, { data: mediaRows }] = await Promise.all([
    supabase
      .from('warranty_claim_events')
      .select('id, claim_id, event_type, note, visibility, actor_role, created_at')
      .in('claim_id', ids)
      .order('created_at'),
    supabase.from('warranty_claim_media').select('id, claim_id, storage_path, file_name, kind').in('claim_id', ids).order('uploaded_at'),
  ])
  const events = (eventRows ?? []) as ClaimEvent[]
  const media = (mediaRows ?? []) as ClaimMedia[]

  const signed = media.length
    ? (await supabase.storage.from('warranty-claims').createSignedUrls(media.map((m) => m.storage_path), 3600)).data ?? []
    : []
  const urlByPath = new Map(signed.map((s) => [s.path, s.signedUrl]))
  const staffNames = new Map(staff.map((s) => [s.id, s.name]))

  return (
    <ul className="flex flex-col gap-4">
      {claims.map((c) => {
        const statusLabel =
          (audience === 'staff' ? STAFF_STATUS_OVERRIDES[c.status] : undefined) ?? CLAIM_STATUS_LABELS[c.status] ?? c.status
        const claimEvents = events.filter((e) => e.claim_id === c.id)
        const claimMedia = media.filter((m) => m.claim_id === c.id)
        return (
          <li key={c.id} className="surface flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h3 className="font-medium text-foreground">{c.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {coverageNames[c.coverage_key] ?? c.coverage_key} · {c.category} · {c.location}
                </p>
                <p className="text-xs text-muted-foreground">
                  Reported {formatDate(c.reported_at)}
                  {audience === 'staff' && ` by ${c.reported_by_role === 'homeowner' ? 'homeowner' : 'staff'}`}
                  {audience === 'staff' && c.assigned_to && ` · Assigned to ${staffNames.get(c.assigned_to) ?? 'staff member'}`}
                </p>
              </div>
              <span className={cn('rounded-full px-2.5 py-1 text-xs font-medium', STATUS_TONE[c.status])}>{statusLabel}</span>
            </div>

            {c.submitted_after_coverage && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Submitted after this coverage period ended. The builder will review whether it is covered.
              </p>
            )}

            <p className="whitespace-pre-wrap text-sm text-foreground">{c.original_description}</p>

            {c.coverage_decision_note && (
              <p className="text-sm">
                <span className="font-medium">Coverage decision: </span>
                {c.coverage_decision_note}
              </p>
            )}
            {c.corrective_action && (
              <p className="text-sm">
                <span className="font-medium">Corrective work: </span>
                {c.corrective_action}
              </p>
            )}

            {claimMedia.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Attachments">
                {claimMedia.map((m) => {
                  const url = urlByPath.get(m.storage_path)
                  return (
                    <li key={m.id}>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                        >
                          <Paperclip className="size-3.5" aria-hidden="true" />
                          {m.file_name}
                          <span className="text-muted-foreground">({m.kind})</span>
                        </a>
                      ) : (
                        <span className="text-xs text-muted-foreground">{m.file_name}</span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            {claimEvents.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  History ({claimEvents.length})
                </summary>
                <ol className="mt-2 flex flex-col gap-2 border-l pl-4">
                  {claimEvents.map((e) => (
                    <li key={e.id} className="flex flex-col">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                        {e.visibility === 'internal' && (
                          <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">Staff only</span>
                        )}
                        <time dateTime={e.created_at} className="text-xs text-muted-foreground">
                          {formatDate(e.created_at)}
                        </time>
                      </span>
                      {e.note && <span className="whitespace-pre-wrap text-muted-foreground">{e.note}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            )}

            {c.status !== 'closed' && (
              <div className="border-t pt-4">
                {audience === 'staff' ? (
                  <StaffClaimControls
                    claimId={c.id}
                    projectId={projectId}
                    status={c.status}
                    homeownerValidation={c.homeowner_validation}
                    isManager={isManager}
                    assignedTo={c.assigned_to}
                    staff={staff}
                  />
                ) : (
                  <HomeownerClaimControls
                    claimId={c.id}
                    projectId={projectId}
                    status={c.status}
                    homeownerValidation={c.homeowner_validation}
                  />
                )}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
