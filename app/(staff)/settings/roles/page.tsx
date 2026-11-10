import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { requireAdmin } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { HeaderHelp, PageHeader, pageLayout } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { PermissionsMatrix } from '@/components/settings/permissions-matrix'

export const metadata: Metadata = { title: 'Roles & Permissions' }

export default async function RolesPermissionsPage() {
  const session = await requireAdmin()
  const features = await getOrgFeatures(session.organizationId)

  return (
    <div className={pageLayout('workspace')}>
      <PageHeader
        icon={ShieldCheck}
        title="Roles & Permissions"
        titleAddon={
          <HeaderHelp label="About roles and permissions">
            A read-only view of what each role can do today, based on the checks the server runs and the live database
            security policies. A module also has to be turned on in Feature management before anyone can use it.
          </HeaderHelp>
        }
        actions={
          <Button
            variant="outline"
            className="border-[#D6E0D5] bg-white text-primary hover:bg-[#F3F4F6] hover:text-brand-deep"
            render={<Link href="/settings" />}
            nativeButton={false}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Company settings
          </Button>
        }
      />
      <PermissionsMatrix features={features} />
    </div>
  )
}
