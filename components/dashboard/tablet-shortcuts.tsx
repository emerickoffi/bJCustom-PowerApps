import Link from 'next/link'
import { ClipboardPen, FolderOpen, type LucideIcon } from 'lucide-react'
import type { TabletShortcut, TabletShortcutKey } from '@/lib/tablet-home'
import { cn } from '@/lib/utils'

const TILE: Record<TabletShortcutKey, { icon: LucideIcon; tone: string }> = {
  daily_log: { icon: ClipboardPen, tone: 'bg-interactive-soft text-interactive-strong' },
  documents: { icon: FolderOpen, tone: 'bg-[#E8EEF5] text-info' },
}

export function TabletShortcuts({ shortcuts }: { shortcuts: TabletShortcut[] }) {
  if (shortcuts.length === 0) return null
  return (
    <nav aria-label="Quick access">
      <ul className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
        {shortcuts.map((s) => {
          const { icon: Icon, tone } = TILE[s.key]
          return (
            <li key={s.key} className="min-w-0">
              <Link
                href={s.href}
                className="group flex min-h-16 items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs transition-[background-color,border-color,transform] hover:border-interactive-border active:scale-[0.98] active:bg-interactive-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg', tone)} aria-hidden="true">
                  <Icon className="size-5" />
                </span>
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-sm font-semibold text-foreground">{s.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
