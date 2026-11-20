import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform'
import { loadPlatformHelpRequests, loadPlatformSupportGrants, type PlatformHelpRequest } from '@/lib/support-access'
import { timeLeftLabel } from '@/lib/support-access-shared'
import { describeBrowser } from '@/lib/help-topics'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { StatusPill } from '@/components/shared/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { HelpRequestStatusButton } from '@/components/platform/help-request-status-button'

export const metadata: Metadata = { title: 'Support' }
export const dynamic = 'force-dynamic'

const AREA_LABEL: Record<PlatformHelpRequest['area'], string> = {
  staff: 'Builder team',
  portal: 'Homeowner',
  sub: 'Subcontractor',
  public: 'Not signed in',
}

const EMAIL_LABEL: Record<PlatformHelpRequest['email_status'], { tone: 'sage' | 'warning' | 'neutral' | 'danger'; label: string }> = {
  sent: { tone: 'sage', label: 'Emailed' },
  pending: { tone: 'neutral', label: 'Email sending' },
  failed: { tone: 'danger', label: 'Email failed' },
  not_configured: { tone: 'warning', label: 'Email off' },
}

function HelpRequestCard({ t }: { t: PlatformHelpRequest }) {
  const email = EMAIL_LABEL[t.email_status]
  const browser = t.context?.browser || (t.user_agent ? describeBrowser(t.user_agent) : null)
  return (
    <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            <span className="tabular-nums text-muted-foreground">{t.reference}</span>
            <span>{t.subject}</span>
          </p>
          <p className="text-sm text-muted-foreground">
            {[
              t.requester_name ? `${t.requester_name} · ${t.requester_email}` : t.requester_email,
              AREA_LABEL[t.area],
              t.organization_name,
              t.requester_role && t.area === 'staff' ? t.requester_role.replace(/_/g, ' ') : null,
              formatDateTime(t.created_at),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <StatusPill tone={email.tone}>{email.label}</StatusPill>
          <a
            href={`mailto:${t.requester_email}?subject=${encodeURIComponent(`Re: [${t.reference}] ${t.subject}`)}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Reply
          </a>
          <HelpRequestStatusButton ticketId={t.id} status={t.status} />
        </div>
      </div>

      <p className="whitespace-pre-line rounded-xl bg-muted/50 px-3 py-2 text-sm leading-relaxed text-foreground">{t.message}</p>

      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {t.page_path && (
          <div className="flex min-w-0 gap-1.5">
            <dt className="text-muted-foreground">Page</dt>
            <dd className="truncate font-mono text-xs leading-5 text-foreground">{t.page_path}</dd>
          </div>
        )}
        {browser && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Browser</dt>
            <dd className="text-foreground">{browser}</dd>
          </div>
        )}
        {t.project_name && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Project</dt>
            <dd className="text-foreground">{t.project_number ? `${t.project_number} · ${t.project_name}` : t.project_name}</dd>
          </div>
        )}
        {t.closed_at && (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">Answered</dt>
            <dd className="text-foreground">{`${formatDateTime(t.closed_at)}${t.closed_by_email ? ` by ${t.closed_by_email}` : ''}`}</dd>
          </div>
        )}
      </dl>

      {t.last_error && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm">
          <p className="font-medium text-foreground">Last error they saw</p>
          <p className="whitespace-pre-line break-words text-muted-foreground">{t.last_error}</p>
        </div>
      )}

      {t.support_access_grant_id && (
        <p className="text-sm">
          {t.support_access_open ? (
            <Link href={`/platform/support/${t.support_access_grant_id}`} prefetch={false} className="font-medium text-primary underline-offset-4 hover:underline">
              They granted project access. Open the read-only view
            </Link>
          ) : (
            <span className="text-muted-foreground">They granted project access; it has ended.</span>
          )}
        </p>
      )}
    </li>
  )
}

export default async function PlatformSupportPage({ searchParams }: { searchParams: Promise<{ requests?: string }> }) {
  await requirePlatformAdmin()
  const { requests } = await searchParams
  const view = requests === 'closed' ? 'closed' : 'open'
  const [tickets, grants] = await Promise.all([loadPlatformHelpRequests(view), loadPlatformSupportGrants()])
  const now = new Date()

  return (
    <div className={pageLayout()}>
      <PageHeader icon={LifeBuoy} title="Support" />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1.5">
              <CardTitle>{tickets ? `Help requests (${tickets.length} ${view})` : 'Help requests'}</CardTitle>
              <CardDescription>
                Sent from the ? button in Trefort. Each one is also emailed to the support inbox, and replying to that email
                reaches the person directly.
              </CardDescription>
            </div>
            <nav aria-label="Help request status" className="flex shrink-0 gap-1 rounded-lg bg-muted/60 p-1">
              {(['open', 'closed'] as const).map((s) => (
                <Link
                  key={s}
                  href={s === 'open' ? '/platform/support' : '/platform/support?requests=closed'}
                  aria-current={view === s ? 'page' : undefined}
                  className={cn(
                    'flex min-h-9 items-center rounded-md px-3 text-sm font-medium',
                    view === s ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {s === 'open' ? 'Open' : 'Answered'}
                </Link>
              ))}
            </nav>
          </div>
        </CardHeader>
        <CardContent>
          {tickets === null ? (
            <p className="text-sm text-muted-foreground">Help requests are not set up on this server yet.</p>
          ) : tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">{view === 'open' ? 'No open help requests.' : 'No answered help requests yet.'}</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {tickets.map((t) => (
                <HelpRequestCard key={t.id} t={t} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{grants ? `Project access open right now (${grants.length})` : 'Project access open right now'}</CardTitle>
          <CardDescription>
            Projects a company admin has opened to support for a ticket. Access is read-only, ends on its own, and every
            page you open is shown in that company&apos;s access log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {grants === null ? (
            <p className="text-sm text-muted-foreground">Support access is not set up on this server yet.</p>
          ) : grants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No company has granted access. Ask the customer to tick &quot;Let support view this project&quot; when they send a
              help request, or use Settings → Support access.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {grants.map((g) => (
                <li key={g.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 flex-col gap-0.5 text-sm">
                    <p className="font-medium text-foreground">
                      {`${g.organization_name} · ${g.project_number ? `${g.project_number} · ` : ''}${g.project_name}`}
                    </p>
                    <p className="text-muted-foreground">
                      {`Ticket ${g.ticket_reference} · ${timeLeftLabel(g.expires_at, now)} (until ${formatDateTime(g.expires_at)})`}
                    </p>
                    <p className="text-muted-foreground">{`Granted by ${g.granted_by_name || g.granted_by_email || 'a company admin'}`}</p>
                    {g.reason && <p className="text-muted-foreground">{`Note: ${g.reason}`}</p>}
                  </div>
                  <Link href={`/platform/support/${g.id}`} prefetch={false} className={buttonVariants({ variant: 'view' })}>
                    Open read-only view
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
