import { redirect } from 'next/navigation'

// Self-serve workspace creation is disabled; signed-in users without a membership see the no-access screen.
export default function OnboardingPage() {
  redirect('/no-access')
}
