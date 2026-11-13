import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { pageLayout } from '@/components/shared/page-header'
import { OrganizationSettingsForm } from '@/components/settings/organization-settings-form'
import { EmailDeliveryCard, type EmailDeliveryOverview } from '@/components/settings/email-delivery-card'
import { resolveEmailConfig } from '@/lib/email/config'

export const metadata: Metadata = { title: 'Company settings' }

export default async function SettingsPage() {
  const session = await requireAdmin()
  const supabase = await createClient()
  const [orgRes, settingsRes, deliveryRes] = await Promise.all([
    supabase
      .from('organizations')
      .select(
        'display_name, legal_name, logo_url, primary_color, secondary_color, address_line1, address_line2, city, state, postal_code, phone, email, website',
      )
      .eq('id', session.organizationId)
      .single(),
    supabase
      .from('organization_settings')
      .select('project_number_prefix, next_project_number, next_client_number')
      .eq('organization_id', session.organizationId)
      .single(),
    supabase.rpc('email_delivery_overview', { p_org: session.organizationId }),
  ])
  const emailConfig = resolveEmailConfig()

  return (
    <div className={pageLayout('form', 'max-w-5xl')}>
      <OrganizationSettingsForm
        defaults={{ ...orgRes.data, project_number_prefix: settingsRes.data?.project_number_prefix ?? 'P' }}
        nextProjectNumber={settingsRes.data?.next_project_number ?? null}
        nextClientNumber={settingsRes.data?.next_client_number ?? null}
      />
      <EmailDeliveryCard
        overview={(deliveryRes.data as EmailDeliveryOverview | null) ?? null}
        ready={emailConfig.ready}
        problems={emailConfig.problems}
      />
    </div>
  )
}
