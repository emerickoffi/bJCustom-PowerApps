/**
 * Default Builder Dashboard layout. Phase 1 renders this order statically;
 * the ids are the stable keys a future per-user layout feature will reference.
 */
export const DASHBOARD_SECTIONS = [
  { id: 'welcome', label: 'Welcome', row: 'welcome' },
  { id: 'kpis', label: 'Key figures', row: 'kpis' },
  { id: 'attention', label: 'Needs Your Attention', row: 'daily_operations' },
  { id: 'agenda', label: 'My Agenda', row: 'daily_operations' },
  { id: 'project_health', label: 'Project Health', row: 'project_health' },
  { id: 'project_portfolio', label: 'Project Portfolio', row: 'project_portfolio' },
  { id: 'recent_activity', label: 'Recent Activity', row: 'recent_activity', collapsedByDefault: true },
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]['id']
