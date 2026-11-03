import Link from 'next/link'
import { ClipboardPen, FolderOpen, type LucideIcon } from 'lucide-react'
import type { TabletShortcut, TabletShortcutKey } from '@/lib/tablet-home'
import { cn } from '@/lib/utils'

const TILE: Record<TabletShortcutKey, { icon: LucideIcon; tone: string; surface: string }> = {
  daily_log: {
    icon: ClipboardPen,
    tone: 'bg-interactive text-white',
    surface: 'bg-[#F5FBFB] border-[#CDECEF] hover:border-interactive-border',
  },
  documents: {
    icon: FolderOpen,
    tone: 'bg-[#6B4FBB] text-white',
    surface: 'bg-[#F8F6FD] border-[#E2DBF5] hover:border-[#B9A8E6]',
  },
}

export function TabletShortcuts({ shortcuts }: { shortcuts: TabletShortcut[] }) {
  if (shortcuts.length === 0) return null
  return (
    <nav aria-label="Quick access">
      <ul className="grid grid-cols-2 gap-3 min-[900px]:grid-cols-4">
        {shortcuts.map((s) => {
          const { icon: Icon, tone, surface } = TILE[s.key]
          return (
            <li key={s.key} className="min-w-0">
              <Link
                href={s.href}
                className={cn(
                  'group flex min-h-16 items-center gap-3 rounded-xl border p-3 shadow-xs transition-[border-color,box-shadow,transform] hover:shadow-sm active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  surface,
                )}
              >
                <span
                  className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl shadow-xs', tone)}
                  aria-hidden="true"
                >
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
