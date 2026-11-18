import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, LogOut } from 'lucide-react'
import { requirePlatformAdmin } from '@/lib/platform'
import { TrefortLogo } from '@/components/brand/trefort-logo'
import { PlatformNav } from '@/components/platform/platform-nav'

export const metadata: Metadata = {
  title: { template: '%s · Trefort owner console', default: 'Trefort owner console' },
  robots: { index: false, follow: false },
}

/** Trefort's own back office. Separate from every company workspace and only open to platform administrators. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await requirePlatformAdmin()
  const backHref = session.role === 'client' ? '/portal' : session.organizationId ? '/dashboard' : '/no-access'

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-[#D6DDE5] bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-(--page-gutter-x) sm:h-16">
          <Link
            href="/platform"
            className="flex min-h-10 w-28 shrink-0 items-center rounded-md bg-[#00788d] px-2.5 py-1.5 sm:w-32"
            aria-label="Trefort owner console home"
          >
            <TrefortLogo priority />
          </Link>
          <span className="hidden text-sm font-semibold text-foreground sm:inline">Owner console</span>
          <PlatformNav />
          <div className="ml-auto flex items-center gap-1 text-sm">
            <Link
              href={backHref}
              className="flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Back to app</span>
              <span className="sm:hidden">App</span>
            </Link>
            <form action="/auth/sign-out" method="post">
              <button
                type="submit"
                className="flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-lg px-2.5 font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Sign out"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-(--page-gutter-x) pt-(--page-gutter-top) pb-16">{children}</main>
    </div>
  )
}
