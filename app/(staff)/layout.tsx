import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireStaff } from '@/lib/session'
import { QuickActionsProvider, QuickCreateMenu } from '@/components/app/quick-actions'
import { JobSwitcher, RouteBreadcrumbs } from '@/components/app/job-switcher'
import { buildGlobalQuickActions } from '@/lib/quick-actions'
import { dashboardKeyForRole } from '@/lib/dashboard-layout'
import type { ProjectFilterRoute } from '@/lib/route-job'
import { landingPathForRole, NAV_GROUPS_COOKIE, navForRole, parseClosedNavGroups } from '@/lib/navigation'
import { WorkspaceSwitcher } from '@/components/app/workspace-switcher'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { ROLE_LABELS } from '@/lib/domain'
import { CompanyLogo } from '@/components/brand/company-logo'
import { BrandStyle } from '@/components/brand/brand-style'
import { Sidebar } from '@/components/app/sidebar'
import { SIDEBAR_COOKIE, parseSidebarMode } from '@/lib/sidebar'
import { MobileNav } from '@/components/app/mobile-nav'
import { LayoutModeProvider } from '@/components/app/layout-mode'
import { TabletBottomNav } from '@/components/app/tablet-bottom-nav'
import { readLayoutPreference } from '@/lib/dashboard-prefs'
import { AssistantProvider } from '@/components/assistant/assistant-context'
import { AssistantLauncher } from '@/components/assistant/assistant-launcher'
import { FloatingCameraProvider } from '@/components/camera/floating-camera'
import { FloatingActionStack, FloatingActionsProvider } from '@/components/app/floating-actions'
import { DraftScopeProvider } from '@/components/shared/draft-scope'
import { NavigationGuard } from '@/components/app/navigation-guard'
import { getAssistantProviderConfig } from '@/lib/ai/assistant-provider'
import {
  HeaderSearch,
  NotificationBell,
  ProfileMenu,
  type HeaderNotification,
} from '@/components/app/top-bar'

/** The tabbed Home scopes every role's dashboard by `?project=`. */
const COMPANY_FILTER_ROUTES: ProjectFilterRoute[] = ['/schedule', '/estimates', '/documents']
const TABLET_FILTER_ROUTES: ProjectFilterRoute[] = [...COMPANY_FILTER_ROUTES, '/dashboard']

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

/**
 * `modal` is the single slot for every create/edit drawer. Because it lives at the staff level, a soft
 * navigation from any staff page (Dashboard, Quick Actions, a project's tabs) opens the drawer over that page.
 */
export default async function StaffLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  const session = await requireStaff()
  const [cookieStore, notifications, features] = await Promise.all([
    cookies(),
    loadNotifications(session.userId),
    getOrgFeatures(session.organizationId),
  ])
  // Only pages whose content really filters by `?project=` keep the selection there; elsewhere picking a
  // project opens it. The owner dashboard is portfolio-wide and has no per-project filter.
  const projectFilterRoutes: ProjectFilterRoute[] = [
    ...COMPANY_FILTER_ROUTES,
    ...(dashboardKeyForRole(session.role) === 'owner' ? [] : (['/dashboard'] as const)),
  ]
  const layoutPreference = await readLayoutPreference(session.userId, session.organizationId)
  const sidebarMode = parseSidebarMode(cookieStore.get(SIDEBAR_COOKIE)?.value)
  const closedGroups = parseClosedNavGroups(cookieStore.get(NAV_GROUPS_COOKIE)?.value)
  const items = navForRole(session.role, features)
  const logo = <CompanyLogo brand={session.brand} priority />
  const homeHref = landingPathForRole(session.role)
  const homeLabel = `${session.brand.displayName} ${homeHref === '/my-work' ? 'my work' : 'dashboard'}`
  const showAssistant = features.ai_assistant
  const globalQuickActions = buildGlobalQuickActions({ role: session.role, features })
  const workspaces = session.workspaces.map((w) => ({
    organizationId: w.organizationId,
    organizationName: w.organizationName,
    roleLabel: ROLE_LABELS[w.role],
    kind: w.kind,
  }))

  return (
    <BrandStyle brand={session.brand} applyToTheme={false}>
      <DraftScopeProvider userId={session.userId} orgId={session.organizationId}>
      <AssistantProvider>
      <QuickActionsProvider>
      <FloatingActionsProvider>
      <FloatingCameraProvider>
      <LayoutModeProvider preference={layoutPreference}>
      <NavigationGuard />
      <div data-staff-shell className="flex min-h-svh bg-background">
        <div className="contents tablet:hidden">
          <Sidebar
            items={items}
            logo={logo}
            homeLabel={homeLabel}
            homeHref={homeHref}
            defaultMode={sidebarMode}
            closedGroups={closedGroups}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <header data-app-header className="sticky top-0 z-30 border-b border-[#D6DDE5] bg-white pt-[env(safe-area-inset-top)] shadow-[0_1px_2px_rgba(23,77,50,0.04)]">
            <div className="flex h-14 min-w-0 items-center gap-2 pl-[max(var(--page-gutter-x),env(safe-area-inset-left))] pr-[max(var(--page-gutter-x),env(safe-area-inset-right))] sm:h-16 sm:gap-3">
              <div className="contents tablet:hidden">
                <MobileNav items={items} logo={logo} closedGroups={closedGroups} />
              </div>
              <Link
                href={homeHref}
                className="flex min-h-11 w-24 shrink-0 items-center sm:w-28 lg:hidden tablet:flex"
                aria-label={homeLabel}
              >
                {logo}
              </Link>
              <div className="hidden min-w-0 flex-1 lg:block tablet:hidden">
                <RouteBreadcrumbs
                  organizationId={session.organizationId}
                  filterRoutes={projectFilterRoutes}
                  rootHref="/dashboard"
                  rootLabel="Dashboard"
                />
              </div>
              <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">
                <div
                  role="group"
                  aria-label="Project navigation"
                  className="flex min-w-0 items-center gap-1.5 sm:gap-2 md:mr-2 md:rounded-surface md:bg-[#E8F3F5] md:p-1.5 lg:mr-3"
                >
                  <JobSwitcher
                    organizationId={session.organizationId}
                    filterRoutes={projectFilterRoutes}
                    tabletFilterRoutes={TABLET_FILTER_ROUTES}
                  />
                  <HeaderSearch />
                </div>
                <QuickCreateMenu globalActions={globalQuickActions} jobScope={null} />
                <WorkspaceSwitcher workspaces={workspaces} currentId={session.organizationId} />
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
          {/* The workspace always uses the full width beside the sidebar; pages narrow themselves via PageContainer.
              Bottom padding keeps the floating-action stack (two actions; globals.css extends it for a third) clear
              of the last controls. The tablet shell adds the bottom navigation the stack sits above. */}
          <main className="w-full min-w-0 flex-1 px-(--page-gutter-x) pt-(--page-gutter-top) pb-[calc(9rem+env(safe-area-inset-bottom))] tablet:pb-[calc(13rem+env(safe-area-inset-bottom))]">
            {children}
          </main>
        </div>
      </div>
      <TabletBottomNav items={items} homeHref={homeHref} closedGroups={closedGroups} />
      <FloatingActionStack>
        {showAssistant && <AssistantLauncher configured={getAssistantProviderConfig().configured} />}
      </FloatingActionStack>
      </LayoutModeProvider>
      {modal}
      </FloatingCameraProvider>
      </FloatingActionsProvider>
      </QuickActionsProvider>
      </AssistantProvider>
      </DraftScopeProvider>
    </BrandStyle>
  )
}
