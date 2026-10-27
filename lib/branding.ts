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
 * Initial tenant identity. Used only when an organization has not configured
 * its own logo or before a user belongs to an organization.
 */
export const DEFAULT_BRAND: OrganizationBrand = {
  id: null,
  displayName: 'B & J Custom Homes',
  legalName: 'B & J Custom Homes, Inc.',
  logoUrl: '/branding/bj-custom-homes-logo.png',
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

/** Intrinsic dimensions of the supplied logo asset, used to preserve aspect ratio. */
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
    logoUrl: org.logo_url || DEFAULT_BRAND.logoUrl,
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
