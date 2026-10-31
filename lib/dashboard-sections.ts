/**
 * Dashboard section registry. Layouts render statically today; the ids are the stable keys a future
 * per-user layout feature will reference. Existing ids are kept so the team layout and any future
 * saved preferences continue to resolve.
 */
export const DASHBOARD_SECTIONS = [
  { id: 'welcome', label: 'Welcome', row: 'welcome' },
  { id: 'kpis', label: 'Key figures', row: 'kpis' },
  { id: 'attention', label: 'Action Center', row: 'main' },
  { id: 'priority_jobs', label: 'Priority Jobs', row: 'main', replaces: 'project_portfolio' },
  { id: 'coming_up', label: 'Coming Up', row: 'rail', replaces: 'agenda' },
  { id: 'warranty', label: 'Warranty', row: 'rail' },
  { id: 'recent_activity', label: 'Recent Activity', row: 'rail' },
  { id: 'pipeline', label: 'Construction Pipeline', row: 'bottom' },
  { id: 'agenda', label: 'My Agenda', row: 'daily_operations' },
  { id: 'project_health', label: 'Project Health', row: 'project_health' },
  { id: 'project_portfolio', label: 'Project Portfolio', row: 'project_portfolio' },
] as const

export type DashboardSectionId = (typeof DASHBOARD_SECTIONS)[number]['id']
