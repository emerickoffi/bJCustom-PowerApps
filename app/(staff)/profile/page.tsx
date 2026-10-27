import type { Metadata } from 'next'
import { requireStaff } from '@/lib/session'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { ProfileForm } from '@/components/account/profile-form'
import { UserCog as UserCogIcon } from 'lucide-react'

export const metadata: Metadata = { title: 'Your profile' }

export default async function ProfilePage() {
  const session = await requireStaff()
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', session.userId).maybeSingle()
  return (
    <div className="flex flex-col gap-8">
      <PageHeader icon={UserCogIcon} title="Your profile" description="How your name appears to teammates and homeowners." />
      <ProfileForm fullName={data?.full_name ?? ''} phone={data?.phone ?? ''} email={session.email} />
    </div>
  )
}
