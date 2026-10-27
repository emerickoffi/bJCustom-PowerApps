import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { LoginForm } from '@/components/auth/login-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function LoginPage() {
  return (
    <AuthShell title="Sign in" description="Access your projects, clients, and construction records.">
      <LoginForm />
    </AuthShell>
  )
}
