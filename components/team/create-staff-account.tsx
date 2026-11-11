export type PendingActivation = { membershipId: string; name: string; email: string | null }

/** Accounts created under the retired temporary-password flow. They finish by resetting their password. */
export function PendingActivationList({ accounts }: { accounts: PendingActivation[] }) {
  if (!accounts.length) return null
  return (
    <section aria-labelledby="pending-activation" className="flex flex-col gap-4">
      <h2 id="pending-activation" className="type-section-title text-foreground">
        Awaiting first sign-in
      </h2>
      <ul className="flex flex-col divide-y rounded-xl border bg-card">
        {accounts.map((a) => (
          <li key={a.membershipId} className="flex flex-col gap-1 p-4">
            <span className="font-medium text-foreground">{a.name}</span>
            <span className="text-sm text-muted-foreground">{a.email}</span>
            <span className="mt-1 text-xs text-muted-foreground">
              {'Activation pending. No project data is visible yet. Ask them to use "Forgot password" on the sign-in page to set their own password.'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
