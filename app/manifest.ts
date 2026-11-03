import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Bativo',
    short_name: 'Bativo',
    description: 'Client, project, and construction management for B & J Custom Homes, Inc.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    theme_color: '#174D38',
    background_color: '#F3F4F6',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
