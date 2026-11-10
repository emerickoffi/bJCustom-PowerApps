'use client'

import { createContext, useContext, useMemo, useState, type ComponentProps, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { FLOATING_ABOVE_TABLET_NAV, FLOATING_CORNER_BOTTOM, FLOATING_CORNER_RIGHT } from '@/lib/floating-actions'

type Stack = { node: HTMLElement | null; setNode: (node: HTMLElement | null) => void }

const FloatingActionsContext = createContext<Stack | null>(null)

/** Top-to-bottom order of the secondary actions. The AI Assistant always keeps the corner below them. */
const SLOT_ORDER = { camera: 'order-1', assign: 'order-2' } as const

export function FloatingActionsProvider({ children }: { children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const stack = useMemo(() => ({ node, setNode }), [node])
  return <FloatingActionsContext.Provider value={stack}>{children}</FloatingActionsContext.Provider>
}

/**
 * The one bottom-right container for floating actions. Its children (the AI Assistant) take the corner;
 * secondary actions join above them through `FloatingActionSlot`, 12px apart with right edges aligned,
 * so floating actions can never overlap each other. Render it inside the layout-mode wrapper so the
 * whole stack lifts above the tablet bottom navigation.
 */
export function FloatingActionStack({ children }: { children?: ReactNode }) {
  const stack = useContext(FloatingActionsContext)
  return (
    <div
      ref={stack?.setNode}
      data-floating-stack
      className={cn(
        'fixed z-40 flex flex-col items-end gap-3 print:hidden',
        FLOATING_CORNER_BOTTOM,
        FLOATING_CORNER_RIGHT,
        FLOATING_ABOVE_TABLET_NAV,
      )}
    >
      {children}
    </div>
  )
}

/**
 * Places a secondary action in the shared stack. In a shell without a stack (the subcontractor portal)
 * the action takes the corner itself.
 */
export function FloatingActionSlot({
  slot,
  className,
  children,
  ...props
}: { slot: keyof typeof SLOT_ORDER } & ComponentProps<'div'>) {
  const stack = useContext(FloatingActionsContext)
  const control = (
    <div
      data-floating-control
      {...props}
      className={cn(
        'group print:hidden',
        stack ? cn('relative', SLOT_ORDER[slot]) : cn('fixed z-40', FLOATING_CORNER_BOTTOM, FLOATING_CORNER_RIGHT),
        className,
      )}
    >
      {children}
    </div>
  )
  if (!stack) return control
  return stack.node ? createPortal(control, stack.node) : null
}
