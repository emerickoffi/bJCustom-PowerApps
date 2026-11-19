import type { Metadata } from 'next'
import Link from 'next/link'
import { Plug } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { getQuickBooksConnection, getQuickBooksStatus, quickBooksEnvironment } from '@/lib/quickbooks'
import { formatDate } from '@/lib/format'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { QuickBooksDisconnectButton, QuickBooksSyncAllButton } from '@/components/integrations/quickbooks-buttons'

export const metadata: Metadata = { title: 'Integrations' }

const RESULT_MESSAGES: Record<string, { tone: 'ok' | 'warn'; text: string }> = {
  connected: { tone: 'ok', text: 'QuickBooks is connected.' },
  cancelled: { tone: 'warn', text: 'QuickBooks connection was cancelled.' },
  expired: { tone: 'warn', text: 'That connection attempt expired. Start again.' },
  failed: { tone: 'warn', text: 'QuickBooks could not be connected. Try again, and contact support if it keeps happening.' },
  plan: { tone: 'warn', text: 'QuickBooks is part of the Business plan. Upgrade in Settings → Billing to connect it.' },
  not_configured: { tone: 'warn', text: 'QuickBooks API credentials are not set up yet.' },
}

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ qbo?: string }> }) {
  const session = await requireAdmin()
  const [features, connection, { qbo }] = await Promise.all([
    getOrgFeatures(session.organizationId),
    getQuickBooksConnection(session.organizationId),
    searchParams,
  ])
  const status = getQuickBooksStatus(Boolean(connection))
  const result = qbo ? RESULT_MESSAGES[qbo] : undefined
  const needsReauth = connection?.status === 'needs_reauth'
  const sandbox = (connection?.environment ?? quickBooksEnvironment()) === 'sandbox'

  return (
    <div className={pageLayout('form', 'max-w-5xl')}>
      <PageHeader icon={Plug} level={2} title="Integrations" />

      {result && (
        <p
          role="status"
          className={`rounded-xl px-4 py-3 text-sm ${result.tone === 'ok' ? 'bg-sage/60 text-foreground' : 'bg-champagne-soft text-foreground'}`}
        >
          {result.text}
        </p>
      )}

      <section aria-labelledby="qbo-heading" className="surface flex flex-col gap-5 p-5 md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h2 id="qbo-heading" className="type-section-title text-foreground">
              QuickBooks Online
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Send issued invoices and the payments you record to QuickBooks, so your books match what you billed.
              Customers are created or matched by name.
            </p>
          </div>
          <span className="w-fit shrink-0 rounded-badge bg-champagne-soft px-2.5 py-1 text-xs font-medium text-warning">
            {needsReauth ? 'Reconnect needed' : connection ? 'Connected' : status.credentialsConfigured ? 'Not connected' : 'Setup required'}
          </span>
        </div>

        <dl className="grid gap-3 border-t pt-5 text-sm md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">QuickBooks company</dt>
            <dd className="font-medium text-foreground">
              {connection ? (connection.company_name ?? `Company ${connection.realm_id}`) : 'Not connected'}
              {connection && sandbox ? ' (test company)' : ''}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Last sync</dt>
            <dd className="font-medium text-foreground">{connection?.last_synced_at ? formatDate(connection.last_synced_at) : 'Never'}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Module</dt>
            <dd className="font-medium text-foreground">{features.quickbooks ? 'On' : 'Off'}</dd>
          </div>
        </dl>

        {connection?.last_error && (
          <p className="rounded-xl bg-champagne-soft px-4 py-3 text-sm text-foreground">{connection.last_error}</p>
        )}

        <div className="flex flex-col gap-2 rounded-xl bg-sage/50 p-4 text-sm leading-relaxed text-foreground">
          <p>What goes to QuickBooks: issued invoices (not drafts), their payments, voids and reversed payments.</p>
          <p className="text-muted-foreground">
            Invoices with sales tax are skipped for now, so QuickBooks’ own tax settings apply. Enter those directly in QuickBooks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!status.credentialsConfigured ? (
            <p className="text-sm text-muted-foreground">Available once Intuit API credentials are added to the server.</p>
          ) : !connection || needsReauth ? (
            <Link href="/api/integrations/quickbooks/connect" prefetch={false} className={buttonVariants()}>
              {needsReauth ? 'Reconnect QuickBooks' : 'Connect QuickBooks'}
            </Link>
          ) : (
            <>
              <QuickBooksSyncAllButton />
              <QuickBooksDisconnectButton />
            </>
          )}
        </div>
      </section>
    </div>
  )
}
