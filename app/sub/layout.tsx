import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { HardHat, LogOut } from 'lucide-react'
import { getSubcontractorSession } from '@/lib/subcontractor-session'

export const metadata: Metadata = {
  title: 'Subcontractor workspace',
  robots: { index: false, follow: false },
}

export default async function SubLayout({ children }: { children: React.ReactNode }) {
  const session = await getSubcontractorSession()
  if (!session) redirect('/')
  const company = session.accounts.map((a) => a.companyName).join(', ')
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-2xl items-center justify-between gap-3 px-4">
          <Link href="/sub" className="flex min-w-0 items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <HardHat className="size-5" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate font-serif text-base font-semibold text-foreground">{company}</span>
              <span className="truncate text-xs text-muted-foreground">{session.fullName}</span>
            </span>
          </Link>
          <form action="/auth/sign-out" method="post">
            <button
              type="submit"
              className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-muted-foreground hover:bg-sage/60 hover:text-primary"
            >
              <LogOut className="size-4" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  )
}
