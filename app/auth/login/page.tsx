import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'
import { safeNextPath } from '@/lib/invitations'

export const metadata: Metadata = { title: 'Sign in' }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <AuthShell title="Sign in" description="Access your projects, clients, and construction records.">
      <LoginForm next={safeNextPath(next)} />
    </AuthShell>
  )
}
