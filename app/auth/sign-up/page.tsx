import { redirect } from 'next/navigation'

// Accounts are created from an invitation link (/invite/[token]); there is no open sign-up.
export default function SignUpPage() {
  redirect('/auth/login')
}
