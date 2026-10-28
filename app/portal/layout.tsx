import Link from 'next/link'
import { redirect } from 'next/navigation'
import { LogOut, UserRound } from 'lucide-react'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { CompanyLogo } from '@/components/brand/company-logo'
import { BrandStyle } from '@/components/brand/brand-style'
import { WorkspaceSwitcher } from '@/components/app/workspace-switcher'
import { ROLE_LABELS } from '@/lib/domain'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.role) redirect('/onboarding')
  if (session.activationRequired) redirect('/account/activate')
  if (session.role !== 'client') redirect('/dashboard')
  const { brand } = session
  const portalEnabled = session.organizationId ? (await getOrgFeatures(session.organizationId)).portal : false

  return (
    <BrandStyle brand={brand}>
      <div className="flex min-h-svh flex-col bg-background">
        <header className="sticky top-0 z-30 border-b border-border/70 bg-card/85 backdrop-blur-md">
          <div className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
            <Link href="/portal" className="block w-36 sm:w-44" aria-label={`${brand.displayName} homeowner portal`}>
              <CompanyLogo brand={brand} priority />
            </Link>
            <nav aria-label="Account" className="flex items-center gap-1 text-sm">
              <WorkspaceSwitcher
                currentId={session.organizationId}
                workspaces={session.workspaces.map((w) => ({
                  organizationId: w.organizationId,
                  organizationName: w.organizationName,
                  roleLabel: ROLE_LABELS[w.role],
                  kind: w.kind,
                }))}
              />
              <Link
                href="/portal/profile"
                className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-sage/60 hover:text-primary sm:min-h-0 sm:min-w-0"
              >
                <UserRound className="size-4" aria-hidden="true" />
                <span className="sr-only sm:not-sr-only">Profile</span>
              </Link>
              <form action="/auth/sign-out" method="post">
                <button
                  type="submit"
                  className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:bg-sage/60 hover:text-primary sm:min-h-0 sm:min-w-0"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Sign out</span>
                </button>
              </form>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 md:py-12">
          {portalEnabled ? (
            children
          ) : (
            <div className="surface mx-auto flex max-w-xl flex-col gap-2 p-8 text-center">
              <h1 className="font-serif text-2xl font-semibold text-foreground">The homeowner portal is unavailable</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {`${brand.displayName} has paused online access. Your project information is safe. Contact your builder${brand.phone ? ` at ${brand.phone}` : ''} for updates.`}
              </p>
            </div>
          )}
        </main>
        <footer className="border-t border-border/70 bg-card">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <span className="font-medium text-foreground">{brand.legalName || brand.displayName}</span>
            <span>{[brand.phone, brand.email].filter(Boolean).join(' · ')}</span>
          </div>
        </footer>
      </div>
    </BrandStyle>
  )
}
