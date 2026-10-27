import Link from 'next/link'
import { LogOut, UserRound } from 'lucide-react'
import { initials } from '@/lib/format'
import { ROLE_LABELS, type OrgRole } from '@/lib/domain'

export function UserMenu({
  name,
  email,
  role,
  profileHref,
}: {
  name: string | null
  email: string
  role: OrgRole | null
  profileHref: string
}) {
  return (
    <div className="flex flex-col gap-2 border-t pt-4">
      <div className="flex items-center gap-3 px-1">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {initials(name || email)}
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium text-foreground">{name || email}</span>
          <span className="truncate text-xs text-muted-foreground">{role ? ROLE_LABELS[role] : email}</span>
        </div>
      </div>
      <div className="flex gap-1">
        <Link
          href={profileHref}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <UserRound className="size-3.5" aria-hidden="true" />
          Profile
        </Link>
        <form action="/auth/sign-out" method="post" className="flex flex-1">
          <button
            type="submit"
            className="flex flex-1 items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  )
}
