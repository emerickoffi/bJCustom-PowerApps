import type { Metadata } from 'next'
import { CloudOff } from 'lucide-react'
import { AuthShell } from '@/components/auth/auth-shell'
import { OfflineQueueList } from '@/components/app/offline-queue-list'

export const metadata: Metadata = { title: 'Offline', robots: { index: false, follow: false } }
// Cached by the service worker at install, so it must not depend on who is signed in.
export const dynamic = 'force-static'

export default function OfflinePage() {
  return (
    <AuthShell title="You are offline" description="This page has not been saved on this phone yet, so it needs a connection.">
      <div className="flex flex-col gap-4 text-sm leading-relaxed text-muted-foreground">
        <p className="flex items-start gap-2">
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Pages you opened recently, your active projects and new daily logs still work offline. Go back and keep working; anything you
          save uploads automatically when the signal returns.
        </p>
        <OfflineQueueList />
        <div className="flex flex-wrap gap-3">
          <a href="/dashboard" className="font-medium text-primary underline-offset-4 hover:underline">
            Open dashboard
          </a>
          <a href="/my-work" className="font-medium text-primary underline-offset-4 hover:underline">
            Open my work
          </a>
        </div>
      </div>
    </AuthShell>
  )
}
