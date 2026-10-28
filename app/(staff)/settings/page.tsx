import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { requireAdmin } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { OrganizationSettingsForm } from '@/components/settings/organization-settings-form'
import { Settings as SettingsIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Company settings' }

const navButtonClass = 'border-[#D6E0D5] bg-white text-[#174D32] hover:bg-[#F8F7F3] hover:text-[#103B27]'

export default async function SettingsPage() {
  const session = await requireAdmin()
  const supabase = await createClient()
  const [orgRes, settingsRes] = await Promise.all([
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
  ])

  return (
    <div className="flex max-w-5xl flex-col gap-8">
      <PageHeader icon={SettingsIcon}
        title="Company settings"
        description="Your company identity appears throughout the app, the homeowner portal, and future documents."
        actions={
          <>
            <Button variant="outline" className={navButtonClass} render={<Link href="/settings/integrations" />} nativeButton={false}>
              Integrations
            </Button>
            <Button variant="outline" className={navButtonClass} render={<Link href="/settings/features" />} nativeButton={false}>
              Feature management
            </Button>
            <Button variant="outline" className={navButtonClass} render={<Link href="/settings/roles" />} nativeButton={false}>
              Roles &amp; permissions
            </Button>
          </>
        }
      />
      <OrganizationSettingsForm
        defaults={{ ...orgRes.data, project_number_prefix: settingsRes.data?.project_number_prefix ?? 'P' }}
        nextProjectNumber={settingsRes.data?.next_project_number ?? null}
        nextClientNumber={settingsRes.data?.next_client_number ?? null}
      />
    </div>
  )
}
