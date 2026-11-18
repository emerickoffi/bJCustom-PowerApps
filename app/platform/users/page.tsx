import type { Metadata } from 'next'
import Link from 'next/link'
import { UserSearch } from 'lucide-react'
import { requirePlatformAdmin, findPlatformUsers } from '@/lib/platform'
import { formatDate, formatDateTime } from '@/lib/format'
import { ROLE_LABELS } from '@/lib/domain'
import { PageHeader, pageLayout } from '@/components/shared/page-header'
import { StatusPill } from '@/components/shared/status-badge'
import { SearchInput } from '@/components/shared/search-input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Users' }

export default async function PlatformUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requirePlatformAdmin()
  const { q = '' } = await searchParams
  const query = q.trim().slice(0, 100)
  const users = query.length >= 2 ? await findPlatformUsers(query) : []

  return (
    <div className={pageLayout('form')}>
      <PageHeader icon={UserSearch} title="Users" />

      <Card>
        <CardHeader>
          <CardTitle>Find a person</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form action="/platform/users" method="get">
            <SearchInput id="user-search" label="Search users" placeholder="Email or name, at least 2 characters" defaultValue={query} />
          </form>

          {query.length < 2 ? (
            <p className="text-sm text-muted-foreground">Search by email or name to see which companies a person belongs to.</p>
          ) : users === null ? (
            <p className="text-sm text-muted-foreground">Search failed. Try again.</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground">{`No one matches "${query}".`}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-panel border border-border">
              {users.map((u) => (
                <li key={u.user_id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{u.full_name || u.email}</span>
                    {u.platform_admin && <StatusPill tone="info">Trefort owner</StatusPill>}
                    {u.blocked && <StatusPill tone="danger">Login blocked</StatusPill>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {u.full_name ? `${u.email} · ` : ''}
                    {`Joined ${formatDate(u.created_at)} · Last sign-in ${u.last_sign_in_at ? formatDateTime(u.last_sign_in_at) : 'never'}`}
                  </div>
                  {u.memberships.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Not a member of any company.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {u.memberships.map((m) => (
                        <li key={m.organization_id}>
                          <Link
                            href={`/platform/companies/${m.organization_id}`}
                            className="inline-flex items-center gap-1.5 rounded-badge border border-border px-2.5 py-1 text-xs hover:border-interactive hover:text-interactive"
                          >
                            <span className="font-medium">{m.organization_name}</span>
                            <span className="text-muted-foreground">
                              {`${ROLE_LABELS[m.role] ?? m.role}${m.status !== 'active' ? ` · ${m.status}` : ''}`}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
