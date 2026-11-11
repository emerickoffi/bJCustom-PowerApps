import type { Metadata } from 'next'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { ProfileForm } from '@/components/account/profile-form'
import { EmailPreferencesForm } from '@/components/account/email-preferences-form'
import { loadEmailPreferences } from '@/lib/email/preferences'
import { UserCog as UserCogIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Your profile' }

export default async function ProfilePage() {
  const session = await requireStaff()
  const supabase = await createClient()
  const [{ data }, prefs] = await Promise.all([
    supabase.from('profiles').select('full_name, phone').eq('id', session.userId).maybeSingle(),
    loadEmailPreferences(session.userId),
  ])
  return (
    <div className={pageLayout('form')}>
      <PageHeader icon={UserCogIcon} title="Your profile" />
      <ProfileForm fullName={data?.full_name ?? ''} phone={data?.phone ?? ''} email={session.email} />
      <EmailPreferencesForm saved={prefs.saved} deliveryActive={prefs.deliveryActive} />
    </div>
  )
}
