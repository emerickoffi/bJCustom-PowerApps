import type { OrganizationBrand } from '@/lib/branding'

const HEX = /^#[0-9A-Fa-f]{6}$/

/** Applies the organization's brand colors as theme tokens for everything inside. */
export function BrandStyle({ brand, children }: { brand: OrganizationBrand; children: React.ReactNode }) {
  const primary = HEX.test(brand.primaryColor) ? brand.primaryColor : '#174D32'
  const secondary = HEX.test(brand.secondaryColor) ? brand.secondaryColor : '#103B27'
  const style = {
    '--primary': primary,
    '--ring': primary,
    '--sidebar-primary': primary,
    '--sidebar-ring': primary,
    '--sidebar-accent-foreground': primary,
    '--brand-secondary': secondary,
  } as React.CSSProperties

  return (
    <div style={style} className="contents">
      {children}
    </div>
  )
}
