import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/auth-shell'

export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: false } }

export default function NotFound() {
  return (
    <AuthShell title="Page not found" description="This page doesn't exist, or you don't have access to it.">
      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/" className="font-medium text-primary underline-offset-4 hover:underline">
          Go to start
        </Link>
        <a href="mailto:support@trefortpro.com" className="font-medium text-primary underline-offset-4 hover:underline">
          Contact support
        </a>
      </div>
    </AuthShell>
  )
}
