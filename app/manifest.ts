import type { MetadataRoute } from 'next'
import { PRODUCT_BRAND } from '@/lib/product-brand'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUCT_BRAND.fullName,
    short_name: PRODUCT_BRAND.name,
    description: PRODUCT_BRAND.description,
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: PRODUCT_BRAND.themeColor,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  }
}
