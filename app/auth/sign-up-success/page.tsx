import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'
import { Button } from '@/components/ui/button'

export const metadata: Metadata = { title: 'Check your email' }

export default function SignUpSuccessPage() {
  return (
    <AuthShell
      title="Check your email"
      description="We sent a confirmation link to your inbox. Open it to activate your account, then sign in."
    >
      <Button render={<Link href="/auth/login" />} nativeButton={false} variant="outline" size="lg" className="h-10 w-full">
        Return to sign in
      </Button>
    </AuthShell>
  )
}
