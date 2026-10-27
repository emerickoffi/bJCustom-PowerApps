import type { Metadata } from 'next'
import { Plug } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getQuickBooksStatus, quickBooksStatusLabel } from '@/lib/quickbooks'
import { PageHeader } from '@/components/shared/page-header'

export const metadata: Metadata = { title: 'Integrations' }

export default async function IntegrationsPage() {
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)
  const status = getQuickBooksStatus()

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader
        icon={Plug}
        backHref="/settings"
        backLabel="Company settings"
        title="Integrations"
        description="Connect outside services. Nothing is sent to another service until it is connected and authorized."
      />

      <section aria-labelledby="qbo-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="qbo-heading" className="font-serif text-xl font-semibold tracking-tight text-foreground">
              QuickBooks Online
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Send approved estimates to QuickBooks so your books match what homeowners approved.
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-full bg-champagne-soft px-2.5 py-1 text-xs font-medium text-warning">
            {quickBooksStatusLabel(status)}
          </span>
        </div>

        <dl className="grid gap-3 border-t pt-5 text-sm md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Intuit API credentials</dt>
            <dd className="font-medium text-foreground">{status.credentialsConfigured ? 'Added' : 'Missing'}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Company connection</dt>
            <dd className="font-medium text-foreground">{status.connected ? 'Authorized' : 'Not connected'}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Estimates module</dt>
            <dd className="font-medium text-foreground">{features.estimates ? 'On' : 'Off'}</dd>
          </div>
        </dl>

        <div className="flex flex-col gap-3 rounded-xl bg-sage/50 p-4 text-sm leading-relaxed text-foreground">
          <p>
            {status.credentialsConfigured
              ? 'Credentials are in place. Connecting your QuickBooks company is the next step.'
              : 'QuickBooks needs Intuit developer credentials before it can connect. No data is sent to QuickBooks until it is connected.'}
          </p>
          <p className="text-muted-foreground">
            Only approved estimates can be exported. Draft, sent, and rejected estimates stay in this app.
          </p>
        </div>

        <div>
          <Button disabled aria-describedby="qbo-connect-note">
            Connect QuickBooks
          </Button>
          <p id="qbo-connect-note" className="mt-2 text-xs text-muted-foreground">
            Available once API credentials are added.
          </p>
        </div>
      </section>
    </div>
  )
}
