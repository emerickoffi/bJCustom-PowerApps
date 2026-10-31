/**
 * Shared bottom-right floating-action stack. The AI Assistant owns the corner slot
 * (56px, `size-14`); secondary actions sit in the slot above it with a 12px gap and
 * are horizontally centred on it. Classes are literal so Tailwind can detect them.
 */
export const FLOATING_CORNER_RIGHT = 'right-[max(1.25rem,env(safe-area-inset-right))]'
export const FLOATING_CORNER_BOTTOM = 'bottom-[max(1.25rem,env(safe-area-inset-bottom))]'

/** Secondary 44px action stacked directly above the 56px assistant button. */
export const FLOATING_ABOVE_ASSISTANT = 'bottom-[calc(max(1.25rem,env(safe-area-inset-bottom))+4.25rem)] right-[calc(max(1.25rem,env(safe-area-inset-right))+0.375rem)]'

/** Secondary 44px action in the corner slot when no assistant is rendered. */
export const FLOATING_CORNER_SECONDARY = 'bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))]'

export type FloatingPlacement = 'above-assistant' | 'corner'
