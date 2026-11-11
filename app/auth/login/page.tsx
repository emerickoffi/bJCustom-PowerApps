import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { safeNextPath } from '@/lib/invitations'
import { LOGIN_IMAGE } from '@/lib/auth-image'

export const metadata: Metadata = { title: { absolute: 'Sign in · Trefort' } }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <AuthShell title="Sign in" image={LOGIN_IMAGE}>
      <LoginForm next={safeNextPath(next)} />
    </AuthShell>
  )
}
