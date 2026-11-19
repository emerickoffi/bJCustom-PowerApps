import type { Metadata } from 'next'
import { LoginShell } from '@/components/auth/login-shell'
import { LoginForm } from '@/components/auth/login-form'
import { safeNextPath } from '@/lib/invitations'
import { ClearOfflinePages } from '@/components/app/clear-offline-pages'

export const metadata: Metadata = { title: { absolute: 'Sign in · Trefort' } }

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  return (
    <LoginShell>
      <ClearOfflinePages />
      <LoginForm next={safeNextPath(next)} />
    </LoginShell>
  )
}
