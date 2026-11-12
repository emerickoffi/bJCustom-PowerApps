import { PRODUCT_BRAND } from './product-brand.ts'

export type ManifestIcon = { src: string; sizes: string; type: string; purpose?: 'any' | 'maskable' }

/** Install icons rendered from the official Trefort mark (app/icon.svg). Android requires 192 and 512 PNGs. */
export const PWA_ICONS: ManifestIcon[] = [
  { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
]

export function buildManifest() {
  return {
    id: '/',
    name: PRODUCT_BRAND.fullName,
    short_name: PRODUCT_BRAND.name,
    description: PRODUCT_BRAND.description,
    start_url: '/',
    scope: '/',
    display: 'standalone' as const,
    background_color: '#FFFFFF',
    theme_color: PRODUCT_BRAND.themeColor,
    icons: PWA_ICONS,
  }
}
