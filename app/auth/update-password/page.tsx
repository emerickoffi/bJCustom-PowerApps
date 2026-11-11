import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/auth/auth-shell'
import { UpdatePasswordForm } from '@/components/auth/password-forms'

export const metadata: Metadata = { title: 'Choose a new password' }

export default async function UpdatePasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <AuthShell title="Reset link expired" description="This password reset link is no longer valid. Links work once and expire after a short time.">
        <Link href="/auth/forgot-password" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Request a new reset link
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Choose a new password" description={`Set a new password for ${user.email}.`}>
      <UpdatePasswordForm />
    </AuthShell>
  )
}
