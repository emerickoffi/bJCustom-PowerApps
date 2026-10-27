export type WarrantyStage = 'monitoring' | 'completed' | 'ready_to_archive' | 'archived'

export const WARRANTY_STAGE_LABELS: Record<WarrantyStage, string> = {
  monitoring: 'Monitoring',
  completed: 'Warranty complete, claims open',
  ready_to_archive: 'Ready to archive',
  archived: 'Archived',
}

export function daysUntil(isoDate: string): number {
  const [y, m, d] = isoDate.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d)
  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((target - today) / 86_400_000)
}
