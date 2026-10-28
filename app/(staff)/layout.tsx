import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireStaff } from '@/lib/session'
import { navForRole } from '@/lib/navigation'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS } from '@/lib/domain'
import { CompanyLogo } from '@/components/brand/company-logo'
import { BrandStyle } from '@/components/brand/brand-style'
import { Sidebar, SIDEBAR_COOKIE } from '@/components/app/sidebar'
import { MobileNav } from '@/components/app/mobile-nav'
import { AssistantProvider } from '@/components/assistant/assistant-context'
import { AssistantLauncher } from '@/components/assistant/assistant-launcher'
import {
  Breadcrumbs,
  HeaderSearch,
  NotificationBell,
  ProfileMenu,
  type HeaderNotification,
} from '@/components/app/top-bar'

function monogramFor(name: string) {
  const letters = name.match(/[A-Z]/g)
  return letters && letters.length >= 2 ? `${letters[0]}${letters[1]}` : name.slice(0, 2)
}

type ProjectRef = { name: string } | { name: string }[] | null
const projectName = (p: ProjectRef) => (Array.isArray(p) ? p[0]?.name : p?.name) ?? 'Project'

async function loadNotifications(userId: string): Promise<HeaderNotification[]> {
  const supabase = await createClient()
  const [unread, delayed] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, title, body, link, action_required')
      .eq('user_id', userId)
      .is('read_at', null)
      .order('action_required', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('schedule_activities')
      .select('id, project_id, name, projects(name)')
      .eq('status', 'delayed')
      .order('updated_at', { ascending: false })
      .limit(5),
  ])
  const items: HeaderNotification[] = (unread.data ?? []).map((n) => ({
    id: `n-${n.id}`,
    title: n.title,
    detail: n.body ?? '',
    href: n.link ?? '/dashboard',
    notificationId: n.id,
    actionRequired: n.action_required,
  }))
  for (const a of delayed.data ?? []) {
    items.push({
      id: `a-${a.id}`,
      title: `${a.name} is delayed`,
      detail: projectName(a.projects as ProjectRef),
      href: `/projects/${a.project_id}/schedule`,
    })
  }
  return items
}

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const session = await requireStaff()
  const [cookieStore, notifications, features] = await Promise.all([
    cookies(),
    loadNotifications(session.userId),
    getOrgFeatures(session.organizationId),
  ])
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === '1'
  const items = navForRole(session.role, features)
  const logo = <CompanyLogo brand={session.brand} priority />
  const homeLabel = `${session.brand.displayName} dashboard`
  // Locked off in production until the feature is registered server-side; preview builds show the UI for review.
  const showAssistant = features.ai_assistant || process.env.VERCEL_ENV !== 'production'

  return (
    <BrandStyle brand={session.brand}>
      <AssistantProvider>
      <div className="flex min-h-svh bg-background">
        <Sidebar
          items={items}
          logo={logo}
          monogram={monogramFor(session.brand.displayName)}
          homeLabel={homeLabel}
          defaultCollapsed={collapsed}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b bg-background pt-[env(safe-area-inset-top)]">
            <div className="flex h-14 items-center gap-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:h-16 sm:gap-3 sm:px-6 lg:px-10">
              <MobileNav items={items} logo={logo} />
              <Link href="/dashboard" className="flex min-h-11 w-24 shrink-0 items-center sm:w-28 lg:hidden" aria-label={homeLabel}>
                {logo}
              </Link>
              <div className="hidden min-w-0 flex-1 lg:block">
                <Breadcrumbs rootHref="/dashboard" rootLabel="Dashboard" />
              </div>
              <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
                <HeaderSearch />
                <NotificationBell items={notifications} emptyHref="/dashboard" />
                <span className="mx-1 hidden h-6 w-px bg-border sm:block" aria-hidden="true" />
                <ProfileMenu
                  name={session.fullName}
                  email={session.email}
                  roleLabel={ROLE_LABELS[session.role]}
                  profileHref="/profile"
                />
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[90rem] flex-1 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</main>
        </div>
      </div>
      {showAssistant && <AssistantLauncher configured={false} />}
      </AssistantProvider>
    </BrandStyle>
  )
}
