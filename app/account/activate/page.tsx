import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { landingPathForRole } from '@/lib/navigation'
import { BrandStyle } from '@/components/brand/brand-style'
import { CompanyLogo } from '@/components/brand/company-logo'
import { ActivateForm } from '@/components/account/activate-form'

export const metadata: Metadata = { title: 'Activate your account' }

export default async function ActivatePage() {
  const session = await getSession()
  if (!session) redirect('/auth/login')
  if (!session.activationRequired) redirect(session.role === 'client' ? '/portal' : landingPathForRole(session.role))

  return (
    <BrandStyle brand={session.brand}>
      <main className="flex min-h-svh items-center justify-center bg-background px-4 py-12">
        <div className="flex w-full max-w-md flex-col gap-6 rounded-xl border bg-card p-6 sm:p-8">
          <div className="w-40">
            <CompanyLogo brand={session.brand} priority />
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="font-serif text-2xl font-semibold text-foreground">Set your password</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {`You signed in as ${session.email} with a temporary password. Choose your own password to finish activating your account.`}
            </p>
          </div>
          {session.activationExpired ? (
            <div className="flex flex-col gap-4">
              <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                Your temporary password has expired. Ask your administrator to issue a new one.
              </p>
              <form action="/auth/sign-out" method="post">
                <button type="submit" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <ActivateForm />
          )}
        </div>
      </main>
    </BrandStyle>
  )
}
