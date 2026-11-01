import { AREA_LABELS, labelOf, type DashboardSettings, type LayoutArea } from '@/lib/dashboard-visibility'
import { cn } from '@/lib/utils'

/** Schematic of the Command Center arrangement. Shows order only; real cards size to their content. */
export function DashboardLayoutPreview({ settings }: { settings: DashboardSettings }) {
  const { layout, visibility } = settings

  const chips = (area: LayoutArea, direction: 'row' | 'col') => {
    const ids = layout[area]
    if (!ids.length) return <p className="text-xs text-muted-foreground">Empty</p>
    return (
      <ol className={cn('flex gap-2', direction === 'row' ? 'flex-wrap' : 'flex-col')}>
        {ids.map((id, index) => {
          const enabled = visibility[id].enabled
          return (
            <li
              key={id}
              className={cn(
                'flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs',
                direction === 'row' && 'flex-1 basis-32',
                enabled ? 'bg-card text-foreground' : 'border-dashed bg-transparent text-muted-foreground',
              )}
            >
              <span className="font-mono text-[11px] text-muted-foreground">{index + 1}</span>
              <span className={cn('truncate', !enabled && 'line-through')}>{labelOf(id)}</span>
              {!enabled && <span className="ml-auto shrink-0 text-[11px]">Off</span>}
            </li>
          )
        })}
      </ol>
    )
  }

  const zone = (area: LayoutArea, direction: 'row' | 'col', className?: string) => (
    <div className={cn('flex min-w-0 flex-col gap-2 rounded-lg bg-muted/50 p-3', className)}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{AREA_LABELS[area]}</p>
      {chips(area, direction)}
    </div>
  )

  return (
    <section aria-labelledby="layout-preview-heading" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="layout-preview-heading" className="font-serif text-lg font-semibold text-foreground">
          Layout preview
        </h2>
        <p className="text-sm text-muted-foreground">
          Shows the order of cards on desktop. Hidden items keep their position and leave no gap on the dashboard. On
          tablets and phones everything stacks in this order: summary row, above, main column, side column, below.
        </p>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:p-4">
        {zone('summary', 'row')}
        {layout.above.length > 0 && zone('above', 'col')}
        <div className="grid gap-3 md:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
          {zone('main', 'col')}
          {zone('side', 'col')}
        </div>
        {zone('below', 'col')}
      </div>
    </section>
  )
}
