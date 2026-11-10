/**
 * Corner anchor of the shared bottom-right floating-action stack (components/app/floating-actions.tsx).
 * The AI Assistant owns the corner; secondary actions stack above it with a 12px gap and share its
 * right edge. Classes are literal so Tailwind can detect them.
 */
export const FLOATING_CORNER_RIGHT = 'right-[max(1.25rem,env(safe-area-inset-right))]'
export const FLOATING_CORNER_BOTTOM = 'bottom-[max(1.25rem,env(safe-area-inset-bottom))]'

/** In the tablet shell the stack sits 12px above the bottom navigation: 4.25rem of tabs and padding plus its 1px border. */
export const FLOATING_ABOVE_TABLET_NAV = 'tablet:bottom-[calc(env(safe-area-inset-bottom)+5rem+1px)]'
