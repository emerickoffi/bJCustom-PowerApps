/**
 * Trefort software identity. Builder/tenant identity (company name, legal name, logo used on
 * invoices, the homeowner portal, and documents) lives separately in `lib/branding.ts`.
 */
export const PRODUCT_BRAND = {
  name: 'Trefort',
  fullName: 'Trefort Construction Management',
  tagline: 'Construction management',
  description: 'Client, project, and construction management for residential builders.',
  themeColor: '#00788D',
  assistant: {
    name: 'Trefort AI Assistant',
    subtitle: 'Your construction copilot',
  },
  logo: { src: '/branding/trefort-logo.png', width: 1196, height: 319 },
  mark: { src: '/branding/trefort-mark.png', width: 151, height: 186 },
} as const
