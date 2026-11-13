export type OrganizationBrand = {
  id: string | null
  displayName: string
  legalName: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
  addressLine1: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  phone: string | null
  email: string | null
  website: string | null
}

/**
 * Neutral identity used before a user belongs to an organization. It intentionally carries no
 * customer branding: an empty `logoUrl` renders the neutral placeholder in CompanyLogo.
 */
export const DEFAULT_BRAND: OrganizationBrand = {
  id: null,
  displayName: 'Your company',
  legalName: 'Your company',
  logoUrl: '',
  primaryColor: '#174D32',
  secondaryColor: '#103B27',
  addressLine1: null,
  city: null,
  state: null,
  postalCode: null,
  phone: null,
  email: null,
  website: null,
}

/** Nominal dimensions for company logos; the rendered image keeps its own aspect ratio via object-contain. */
export const DEFAULT_LOGO_DIMENSIONS = { width: 2016, height: 780 }

export type OrganizationRow = {
  id: string
  display_name: string
  legal_name: string | null
  logo_url: string | null
  primary_color: string
  secondary_color: string
  address_line1: string | null
  city: string | null
  state: string | null
  postal_code: string | null
  phone: string | null
  email: string | null
  website: string | null
}

export function brandFromOrganization(org: OrganizationRow | null | undefined): OrganizationBrand {
  if (!org) return DEFAULT_BRAND
  return {
    id: org.id,
    displayName: org.display_name,
    legalName: org.legal_name || org.display_name,
    logoUrl: org.logo_url?.trim() ?? '',
    primaryColor: org.primary_color,
    secondaryColor: org.secondary_color,
    addressLine1: org.address_line1,
    city: org.city,
    state: org.state,
    postalCode: org.postal_code,
    phone: org.phone,
    email: org.email,
    website: org.website,
  }
}
