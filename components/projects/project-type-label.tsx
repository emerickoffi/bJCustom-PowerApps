import { House } from 'lucide-react'
import { PROJECT_TYPE_LABELS } from '@/lib/domain'
import { cn } from '@/lib/utils'

export function projectTypeLabel(type: string | null | undefined): string | null {
  return type ? (PROJECT_TYPE_LABELS[type] ?? null) : null
}

export function ProjectTypeLabel({ type, className }: { type: string | null | undefined; className?: string }) {
  const label = projectTypeLabel(type)
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1 text-xs',
        label ? 'text-muted-foreground' : 'italic text-muted-foreground/80',
        className,
      )}
    >
      <House className="size-3 shrink-0" aria-hidden="true" />
      <span className="sr-only">Project type: </span>
      <span className="truncate">{label ?? 'Type not specified'}</span>
    </span>
  )
}
