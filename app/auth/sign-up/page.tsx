import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { SignUpForm } from '@/components/auth/sign-up-form'

export const metadata: Metadata = { title: 'Create account' }

export default function SignUpPage() {
  return (
    <AuthShell
      title="Create your account"
      description="If you were invited by your builder, sign up with the same email address that received the invitation."
    >
      <SignUpForm />
    </AuthShell>
  )
}
