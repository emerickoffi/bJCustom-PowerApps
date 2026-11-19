/**
 * Facts shared by the Terms of Service and Privacy Policy. Change them here, not in the pages.
 * Bump LEGAL_EFFECTIVE_DATE whenever the text of either page changes materially.
 */
export const LEGAL = {
  operator: 'Neovel Technologies Group LLC',
  product: 'Trefort',
  website: 'https://trefortpro.com',
  appUrl: 'https://app.trefortpro.com',
  contactEmail: 'support@trefortpro.com',
  privacyEmail: 'privacy@trefortpro.com',
  effectiveDate: 'November 19, 2026',
} as const

/** Service providers that process data for Trefort. Listed on the Privacy Policy. */
export const SUBPROCESSORS = [
  { name: 'Supabase', purpose: 'Database, sign-in and file storage', location: 'United States' },
  { name: 'Vercel', purpose: 'Application hosting, AI request routing and privacy-friendly usage analytics', location: 'United States' },
  { name: 'Stripe', purpose: 'Subscription billing and payment processing', location: 'United States' },
  { name: 'Resend', purpose: 'Transactional email (invitations, notifications, password resets)', location: 'United States' },
  { name: 'Dropbox Sign', purpose: 'Electronic signatures on estimates and documents, when a company uses e-signing', location: 'United States' },
  { name: 'OpenAI (through Vercel AI Gateway)', purpose: 'AI assistant features, when a company uses them', location: 'United States' },
] as const
