import Link from 'next/link'
import { ArrowRight, FolderKanban, Search } from 'lucide-react'
import { SemanticBadge, type SemanticTone } from '@/components/shared/semantic-badge'
import { Button } from '@/components/ui/button'
import { initials } from '@/lib/format'
import {
  HOMEOWNER_STATUS_LABELS,
  type HomeownerAccountRow,
  type HomeownerAccountStatus,
} from '@/lib/homeowner-accounts'

const STATUS_TONE: Record<HomeownerAccountStatus, SemanticTone> = {
  active: 'success',
  pending_activation: 'pending',
  suspended: 'danger',
  contact_disabled: 'orange',
  unknown: 'neutral',
  not_provisioned: 'neutral',
}

export type HomeownerFilter = 'all' | 'with_account' | 'without_account'

const FILTERS: { value: HomeownerFilter; label: string }[] = [
  { value: 'all', label: 'All contacts' },
  { value: 'with_account', label: 'Portal accounts' },
  { value: 'without_account', label: 'No account' },
]

function filterHref(filter: HomeownerFilter, q: string) {
  const params = new URLSearchParams({ tab: 'homeowners' })
  if (filter !== 'all') params.set('account', filter)
  if (q) params.set('q', q)
  return `/team?${params.toString()}`
}

export function HomeownerAccountList({
  rows,
  filter,
  q,
  truncated,
  portalEnabled,
}: {
  rows: HomeownerAccountRow[]
  filter: HomeownerFilter
  q: string
  truncated: boolean
  portalEnabled: boolean
}) {
  const withAccount = rows.filter((r) => r.hasAccount)
  const active = withAccount.filter((r) => r.status === 'active').length
  const visible =
    filter === 'with_account' ? withAccount : filter === 'without_account' ? rows.filter((r) => !r.hasAccount) : rows

  return (
    <section aria-labelledby="homeowners-heading" className="flex flex-col gap-4">
      {!portalEnabled && (
        <p role="status" className="rounded-lg border border-[#F3DDB0] bg-[#FFF2DA] px-4 py-3 text-sm text-[#96570E]">
          The Homeowner Portal is turned off in Settings → Features. Existing accounts are kept, but homeowners
          can&apos;t sign in until it&apos;s turned back on.
        </p>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="homeowners-heading" className="font-serif text-lg font-semibold text-foreground">
          Homeowner accounts
        </h2>
        <span className="text-sm text-[#64756D]">
          {`${withAccount.length} portal ${withAccount.length === 1 ? 'account' : 'accounts'} · ${active} active · ${rows.length} contacts`}
        </span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Filter homeowner contacts" className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={filterHref(f.value, q)}
              aria-current={filter === f.value ? 'page' : undefined}
              className="rounded-full border border-[#E2E8E2] bg-card px-3 py-1 text-sm text-[#64756D] transition-colors hover:bg-[#F8F7F3] hover:text-[#174D32] aria-[current=page]:border-[#174D32] aria-[current=page]:bg-[#174D32] aria-[current=page]:text-white"
            >
              {f.label}
            </Link>
          ))}
        </nav>
        <form action="/team" className="relative w-full sm:w-72">
          <input type="hidden" name="tab" value="homeowners" />
          {filter !== 'all' && <input type="hidden" name="account" value={filter} />}
          <label htmlFor="homeowner-search" className="sr-only">
            Search contacts
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#64756D]" aria-hidden="true" />
          <input
            id="homeowner-search"
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Search name, email, or client"
            className="h-9 w-full rounded-md border border-[#E2E8E2] bg-card pl-9 pr-3 text-sm outline-none placeholder:text-[#64756D]/80 focus-visible:border-[#174D32]/50 focus-visible:ring-2 focus-visible:ring-[#174D32]/20"
          />
        </form>
      </div>

      {visible.length ? (
        <ul className="divide-y divide-[#E2E8E2]/80 overflow-hidden rounded-xl border border-[#E2E8E2] bg-card shadow-[0_1px_2px_rgba(16,59,39,0.04)]">
          {visible.map((row) => (
            <HomeownerItem key={row.key} row={row} />
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border border-dashed border-[#E2E8E2] bg-card p-6 text-sm text-[#64756D]">
          {q ? 'No contacts match your search.' : 'No contacts in this view yet.'}
        </p>
      )}

      {truncated && (
        <p className="text-sm text-[#64756D]">Showing the first 200 contacts. Search to narrow the list.</p>
      )}
      <p className="text-xs text-[#64756D]">
        Saved contacts aren&apos;t user accounts. A contact only becomes a homeowner user when an administrator
        provisions portal access from the client record.
      </p>
    </section>
  )
}

function HomeownerItem({ row }: { row: HomeownerAccountRow }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-[#F8F7F3]/70 sm:flex-nowrap sm:px-5">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#F8F7F3] text-sm font-semibold text-[#174D32] ring-1 ring-inset ring-[#174D32]/12"
      >
        {initials(row.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-medium text-foreground">{row.name}</span>
          <SemanticBadge tone="info">Homeowner</SemanticBadge>
          {row.isLegacyInvite && <SemanticBadge tone="neutral">Invitation access</SemanticBadge>}
        </span>
        <span className="truncate text-sm text-[#64756D]">{row.email ?? 'No email on file'}</span>
        <span className="truncate text-xs text-[#64756D]">
          {`${row.relationship} · ${row.clientName}${row.clientNumber ? ` (#${row.clientNumber})` : ''}`}
          {row.permissions.length > 0 && ` · ${row.permissions.join(', ')}`}
        </span>
      </div>
      <div className="ml-14 flex shrink-0 flex-wrap items-center gap-3 sm:ml-0">
        <SemanticBadge tone={STATUS_TONE[row.status]}>{HOMEOWNER_STATUS_LABELS[row.status]}</SemanticBadge>
        {row.hasAccount && (
          <span className="flex items-center gap-1 text-sm text-[#64756D]">
            <FolderKanban className="size-4 text-[#174D32]/70" aria-hidden="true" />
            {row.projectCount === 1 ? '1 project' : `${row.projectCount} projects`}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          className="border-[#D6E0D5] bg-white text-[#174D32] hover:bg-[#F8F7F3] hover:text-[#103B27]"
          render={<Link href={`/clients/${row.clientId}#portal-access`} />}
          nativeButton={false}
        >
          Manage access
          <ArrowRight className="size-3.5" aria-hidden="true" />
          <span className="sr-only">{` for ${row.name}`}</span>
        </Button>
      </div>
    </li>
  )
}
