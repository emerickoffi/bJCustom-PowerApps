import type { Metadata } from 'next'
import Link from 'next/link'
import { LifeBuoy } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform'
import { loadPlatformSupportGrants } from '@/lib/support-access'
import { timeLeftLabel } from '@/lib/support-access-shared'
import { formatDateTime } from '@/lib/format'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Support access' }
export const dynamic = 'force-dynamic'

export default async function PlatformSupportPage() {
  await requirePlatformAdmin()
  const grants = await loadPlatformSupportGrants()
  const now = new Date()

  return (
    <div className={pageLayout()}>
      <PageHeader icon={LifeBuoy} title="Support access" />
      <Card>
        <CardHeader>
          <CardTitle>{grants ? `Open right now (${grants.length})` : 'Open right now'}</CardTitle>
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
              No company has granted access. Ask the customer to use Settings → Support access → Grant support access.
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
                    <p className="text-muted-foreground">
                      {`Granted by ${g.granted_by_name || g.granted_by_email || 'a company admin'}`}
                    </p>
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
