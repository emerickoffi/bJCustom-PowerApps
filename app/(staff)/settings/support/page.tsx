import type { Metadata } from 'next'
import { LifeBuoy } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { loadCompanySupportAccess } from '@/lib/support-access'
import { describeSupportEvent, grantState, timeLeftLabel, type SupportGrant } from '@/lib/support-access-shared'
import { formatDateTime } from '@/lib/format'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { StatusPill } from '@/components/shared/status-badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GrantSupportAccessButton, RevokeSupportAccessButton } from '@/components/settings/support-access-controls'

export const metadata: Metadata = { title: 'Support access' }
// Time left and expiry change by the minute, so never serve a cached copy.
export const dynamic = 'force-dynamic'

const STATE_PILL = {
  active: { tone: 'primary', label: 'Active' },
  expired: { tone: 'neutral', label: 'Expired' },
  revoked: { tone: 'danger', label: 'Revoked' },
} as const

function projectLabel(g: SupportGrant) {
  return g.project_number ? `${g.project_number} · ${g.project_name}` : g.project_name
}

export default async function SupportAccessPage() {
  const session = await requireAdmin()
  const { available, grants, events, projects } = await loadCompanySupportAccess(session.organizationId)
  const now = new Date()
  const active = grants.filter((g) => grantState(g, now) === 'active')
  const past = grants.filter((g) => grantState(g, now) !== 'active')
  const ticketByGrant = new Map(grants.map((g) => [g.id, g.ticket_reference]))
  const projectByGrant = new Map(grants.map((g) => [g.id, g.project_name]))

  return (
    <div className={pageLayout('form', 'max-w-5xl')}>
      <PageHeader icon={LifeBuoy} level={2} title="Support access" />

      <section aria-labelledby="support-grant-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="support-grant-heading" className="type-section-title text-foreground">
              Let Trefort support look at a project
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Trefort support cannot see your company&apos;s data unless you allow it. When you open a support ticket, you
              can give support read-only access to one project for a short time. Access ends on its own, and you can
              revoke it at any time.
            </p>
          </div>
          {available && <GrantSupportAccessButton projects={projects} />}
        </div>
        {!available && (
          <p className="rounded-xl bg-champagne-soft px-4 py-3 text-sm text-foreground">
            Support access is not set up on this server yet.
          </p>
        )}
        {available && projects.length === 0 && (
          <p className="text-sm text-muted-foreground">Create a project first. Support access is always for one project.</p>
        )}
      </section>

      {available && (
        <section aria-labelledby="support-active-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
          <h2 id="support-active-heading" className="type-section-title text-foreground">
            {`Active now (${active.length})`}
          </h2>
          {active.length === 0 ? (
            <p className="text-sm text-muted-foreground">Trefort support has no access to your projects right now.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {active.map((g) => (
                <li key={g.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <p className="font-medium text-foreground">{projectLabel(g)}</p>
                    <p className="text-muted-foreground">
                      {`Ticket ${g.ticket_reference} · Read-only · ${timeLeftLabel(g.expires_at, now)} (until ${formatDateTime(g.expires_at)})`}
                    </p>
                    <p className="text-muted-foreground">
                      {`Granted ${formatDateTime(g.granted_at)}${g.granted_by_name ? ` by ${g.granted_by_name}` : ''}`}
                    </p>
                    {g.reason && <p className="text-muted-foreground">{`Note: ${g.reason}`}</p>}
                  </div>
                  <RevokeSupportAccessButton grantId={g.id} projectName={g.project_name} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {available && (
        <section aria-labelledby="support-log-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
          <div className="flex flex-col gap-1">
            <h2 id="support-log-heading" className="type-section-title text-foreground">
              Access log
            </h2>
            <p className="text-sm text-muted-foreground">
              Every grant, revoke and page Trefort support opened, newest first. Entries cannot be edited or deleted.
            </p>
          </div>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing yet.</p>
          ) : (
            <div className="-mx-5 overflow-x-auto md:-mx-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5 md:pl-6">When</TableHead>
                    <TableHead>What happened</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="pr-5 md:pr-6">Ticket</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="pl-5 whitespace-nowrap text-muted-foreground md:pl-6">{formatDateTime(e.created_at)}</TableCell>
                      <TableCell>
                        <span className="text-foreground">{describeSupportEvent(e)}</span>
                        {e.actor_email && e.actor_name && <span className="block text-xs text-muted-foreground">{e.actor_email}</span>}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{(e.grant_id && projectByGrant.get(e.grant_id)) || '—'}</TableCell>
                      <TableCell className="pr-5 text-muted-foreground md:pr-6">{(e.grant_id && ticketByGrant.get(e.grant_id)) || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </section>
      )}

      {available && past.length > 0 && (
        <section aria-labelledby="support-past-heading" className="surface flex flex-col gap-4 p-5 md:p-6">
          <h2 id="support-past-heading" className="type-section-title text-foreground">
            Past access
          </h2>
          <ul className="flex flex-col divide-y">
            {past.map((g) => {
              const state = STATE_PILL[grantState(g, now)]
              return (
                <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{`${projectLabel(g)} · Ticket ${g.ticket_reference}`}</p>
                    <p className="text-muted-foreground">
                      {`${formatDateTime(g.granted_at)} → ${formatDateTime(g.revoked_at ?? g.expires_at)}`}
                    </p>
                  </div>
                  <StatusPill tone={state.tone}>{state.label}</StatusPill>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </div>
  )
}
