import type { OrganizationBrand } from '@/lib/branding'

const HEX = /^#[0-9A-Fa-f]{6}$/

/**
 * Exposes the organization's brand colors. With `applyToTheme` (customer-facing portals), they also drive the
 * theme tokens; the staff app passes `applyToTheme={false}` so the product theme stays separate from tenant branding.
 */
export function BrandStyle({
  brand,
  applyToTheme = true,
  children,
}: {
  brand: OrganizationBrand
  applyToTheme?: boolean
  children: React.ReactNode
}) {
  const primary = HEX.test(brand.primaryColor) ? brand.primaryColor : '#174D32'
  const secondary = HEX.test(brand.secondaryColor) ? brand.secondaryColor : '#103B27'
  const style = (
    applyToTheme
      ? {
          '--primary': primary,
          '--ring': primary,
          '--sidebar-primary': primary,
          '--sidebar-ring': primary,
          '--sidebar-accent-foreground': primary,
          '--brand-primary': primary,
          '--brand-secondary': secondary,
        }
      : { '--brand-primary': primary, '--brand-secondary': secondary }
  ) as Record<string, string> as React.CSSProperties

  return (
    <div style={style} className="contents">
      {children}
    </div>
  )
}
