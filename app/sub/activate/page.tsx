import { redirect } from 'next/navigation'
import { getSubcontractorSession } from '@/lib/subcontractor-session'
import { SubActivateForm } from '@/components/subcontractor-work/sub-activate-form'

export default async function SubActivatePage() {
  const session = await getSubcontractorSession()
  if (!session) redirect('/')
  if (!session.activationRequired) redirect('/sub')
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground">Set your password</h1>
        <p className="text-sm text-muted-foreground">Replace the temporary password the builder gave you to open your workspace.</p>
      </div>
      {session.activationExpired ? (
        <p role="alert" className="text-sm text-destructive">
          Your temporary password has expired. Ask the builder to issue a new one.
        </p>
      ) : (
        <SubActivateForm />
      )}
    </section>
  )
}
