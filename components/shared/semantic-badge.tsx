import { cn } from '@/lib/utils'

export type SemanticTone = 'neutral' | 'info' | 'success' | 'pending' | 'danger' | 'orange'

export const SEMANTIC_TONE: Record<SemanticTone, string> = {
  neutral: 'border-[#D8E0E8] bg-[#E9EDF2] text-[#526174]',
  info: 'border-[#C9DFFF] bg-[#E6F0FF] text-[#1D5FBD]',
  success: 'border-[#C2E4D0] bg-[#E2F3E9] text-[#187542]',
  pending: 'border-[#F3DDB0] bg-[#FFF2DA] text-[#96570E]',
  danger: 'border-[#F5C7C5] bg-[#FDE8E7] text-[#BD302B]',
  orange: 'border-[#F7D3B5] bg-[#FDEBDD] text-[#B3540F]',
}

const DOT: Record<SemanticTone, string> = {
  neutral: 'bg-[#526174]/60',
  info: 'bg-[#1D5FBD]',
  success: 'bg-[#187542]',
  pending: 'bg-[#C27A1A]',
  danger: 'bg-[#BD302B]',
  orange: 'bg-[#B3540F]',
}

export function SemanticBadge({
  tone,
  children,
  className,
}: {
  tone: SemanticTone
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium',
        SEMANTIC_TONE[tone],
        className,
      )}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', DOT[tone])} aria-hidden="true" />
      {children}
    </span>
  )
}
