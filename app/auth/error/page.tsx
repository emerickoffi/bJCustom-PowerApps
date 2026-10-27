import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Sign-in problem' }

export default function AuthErrorPage() {
  return (
    <AuthShell
      title="We could not verify that link"
      description="The confirmation link may have expired or already been used. Please sign in again or request a new link."
    >
      <Button render={<Link href="/auth/login" />} nativeButton={false} size="lg" className="h-10 w-full">
        Go to sign in
      </Button>
    </AuthShell>
  )
}
