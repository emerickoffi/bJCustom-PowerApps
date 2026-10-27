import { cn } from '@/lib/utils'

function clamp(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))
}

export function ProgressBar({
  value,
  label,
  className,
  size = 'md',
  tone = 'primary',
}: {
  value: number
  label: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
  tone?: 'primary' | 'light'
}) {
  const v = clamp(value)
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn(
        'overflow-hidden rounded-full',
        tone === 'light' ? 'bg-white/20' : 'bg-sage',
        size === 'sm' && 'h-1.5',
        size === 'md' && 'h-2',
        size === 'lg' && 'h-2.5',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-700 ease-out',
          tone === 'light' ? 'bg-white' : 'bg-primary',
        )}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}

export function ProgressRing({
  value,
  label,
  size = 120,
  stroke = 10,
  className,
  tone = 'primary',
}: {
  value: number
  label: string
  size?: number
  stroke?: number
  className?: string
  tone?: 'primary' | 'light'
}) {
  const v = clamp(value)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className={tone === 'light' ? 'stroke-white/15' : 'stroke-sage'}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className={cn('transition-[stroke-dashoffset] duration-700 ease-out', tone === 'light' ? 'stroke-champagne' : 'stroke-primary')}
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span
          className={cn(
            'tabular font-serif font-semibold',
            tone === 'light' ? 'text-white' : 'text-foreground',
          )}
          style={{ fontSize: size * 0.24 }}
        >
          {`${Math.round(v)}%`}
        </span>
        <span
          className={cn('mt-1 text-[0.7rem] font-medium', tone === 'light' ? 'text-white/70' : 'text-muted-foreground')}
        >
          complete
        </span>
      </span>
    </div>
  )
}
