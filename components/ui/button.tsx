import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-control border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // Bateevo orange primary action; disabled turns neutral so it never reads as an active orange button.
        default:
          'border-action-border bg-action font-semibold text-action-foreground shadow-[0_1px_2px_rgb(23_33_43/0.14)] hover:bg-action-hover active:bg-action-pressed aria-expanded:bg-action-pressed focus-visible:border-action-border focus-visible:ring-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 disabled:shadow-none data-disabled:border-border data-disabled:bg-muted data-disabled:text-muted-foreground data-disabled:opacity-100 data-disabled:shadow-none',
        outline:
          'border-input bg-card hover:border-primary/40 hover:bg-muted/60 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost:
          'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
        link: 'text-primary underline-offset-4 hover:underline',
        view: 'border-accent-blue bg-white text-accent-blue duration-150 ease-out hover:border-accent-blue hover:bg-accent-blue hover:text-white active:border-accent-blue active:bg-accent-blue active:text-white aria-expanded:bg-accent-blue aria-expanded:text-white focus-visible:border-accent-blue focus-visible:ring-accent-blue/40',
        action: 'border-interactive bg-interactive text-white hover:border-interactive-hover hover:bg-interactive-hover active:border-interactive-pressed active:bg-interactive-pressed focus-visible:border-interactive-pressed focus-visible:ring-interactive/40',
        edit: 'border-interactive-border bg-interactive-soft text-interactive-strong hover:bg-interactive-soft-hover hover:text-interactive-strong active:bg-interactive-soft-pressed aria-expanded:bg-interactive-soft-pressed focus-visible:border-interactive focus-visible:ring-interactive/40',
      },
      size: {
        default:
          'h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3',
        xs: "h-6 gap-1 rounded-control px-2 text-xs in-data-[slot=button-group]:rounded-control has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-control px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-control has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: 'h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3.5 has-data-[icon=inline-start]:pl-3.5',
        // Icon buttons keep their visual size; on touch screens an invisible ::after extends the hit area to 44px.
        icon: 'relative size-9 pointer-coarse:after:absolute pointer-coarse:after:-inset-1',
        'icon-xs':
          "relative size-6 rounded-control in-data-[slot=button-group]:rounded-control [&_svg:not([class*='size-'])]:size-3 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5",
        'icon-sm':
          'relative size-7 rounded-control in-data-[slot=button-group]:rounded-control pointer-coarse:after:absolute pointer-coarse:after:-inset-2',
        'icon-lg': 'relative size-9 pointer-coarse:after:absolute pointer-coarse:after:-inset-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
