import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_LOGO_BYTES,
  detectLogoMime,
  isAllowedLogoUrl,
  isUploadedLogo,
  logoResponseHeaders,
  logoSource,
  logoStoragePath,
  uploadedLogoUrl,
  validateLogoUpload,
} from './company-logo.ts'
import { DEFAULT_BRAND, brandFromOrganization, type OrganizationRow } from './branding.ts'

const ORG = '04f6899f-1111-4222-8333-444455556666'
const OTHER_ORG = '99999999-1111-4222-8333-444455556666'
const SUPABASE = 'https://abc.supabase.co'
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0])
const WEBP = new Uint8Array([...'RIFF'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0], [...'WEBP'].map((c) => c.charCodeAt(0))))
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

const row = (logo_url: string | null): OrganizationRow => ({
  id: ORG,
  display_name: 'Acme Builders',
  legal_name: null,
  logo_url,
  primary_color: '#112233',
  secondary_color: '#445566',
  address_line1: null,
  city: null,
  state: null,
  postal_code: null,
  phone: null,
  email: null,
  website: null,
})

describe('legacy default logo removal', () => {
  it('does not fall back to the BJ Custom Homes logo when a company has no logo', () => {
    const brand = brandFromOrganization(row(null))
    assert.equal(brand.logoUrl, '')
    assert.doesNotMatch(JSON.stringify(brand), /bj-custom-homes|B & J/i)
  })

  it('the no-organization default carries no customer branding', () => {
    assert.equal(DEFAULT_BRAND.logoUrl, '')
    assert.doesNotMatch(JSON.stringify(DEFAULT_BRAND), /bj-custom-homes|B & J/i)
  })

  it('keeps an existing hosted logo URL and saved colors unchanged', () => {
    const brand = brandFromOrganization(row('https://cdn.example.com/acme.png'))
    assert.equal(brand.logoUrl, 'https://cdn.example.com/acme.png')
    assert.equal(brand.primaryColor, '#112233')
    assert.equal(brand.secondaryColor, '#445566')
  })
})

describe('validateLogoUpload', () => {
  it('accepts PNG, JPEG, and WebP whose bytes match the declared type', () => {
    assert.deepEqual(validateLogoUpload({ size: 10, type: 'image/png', bytes: PNG }), { ok: true, mime: 'image/png' })
    assert.deepEqual(validateLogoUpload({ size: 10, type: 'image/jpeg', bytes: JPEG }), { ok: true, mime: 'image/jpeg' })
    assert.deepEqual(validateLogoUpload({ size: 10, type: 'image/webp', bytes: WEBP }), { ok: true, mime: 'image/webp' })
  })

  it('rejects SVG, empty, oversized, and mislabeled files', () => {
    assert.equal(validateLogoUpload({ size: SVG.length, type: 'image/svg+xml', bytes: SVG }).ok, false)
    assert.equal(validateLogoUpload({ size: 0, type: 'image/png', bytes: new Uint8Array() }).ok, false)
    assert.equal(validateLogoUpload({ size: MAX_LOGO_BYTES + 1, type: 'image/png', bytes: PNG }).ok, false)
    assert.equal(validateLogoUpload({ size: 10, type: 'image/png', bytes: JPEG }).ok, false)
    assert.equal(validateLogoUpload({ size: SVG.length, type: 'image/png', bytes: SVG }).ok, false)
  })

  it('detects formats from bytes only', () => {
    assert.equal(detectLogoMime(PNG), 'image/png')
    assert.equal(detectLogoMime(SVG), null)
  })
})

describe('storage paths and ownership', () => {
  it('uses one stable path per company and refuses non-uuid ids', () => {
    assert.equal(logoStoragePath(ORG), `${ORG}/logo`)
    assert.throws(() => logoStoragePath('../other/logo'))
  })

  it('stores uploads as a versioned same-origin route that names no company', () => {
    const url = uploadedLogoUrl(42)
    assert.equal(url, '/api/company-logo?v=42')
    assert.equal(url.includes(ORG), false)
    assert.equal(url.includes(OTHER_ORG), false)
  })

  it('treats only the logo route as an uploaded (removable) logo', () => {
    assert.equal(isUploadedLogo('/api/company-logo?v=1'), true)
    assert.equal(isUploadedLogo('/api/company-logo'), true)
    assert.equal(isUploadedLogo('/api/company-logo?v=1&org=' + OTHER_ORG), false)
    assert.equal(isUploadedLogo(`${SUPABASE}/storage/v1/object/public/company-logos/${ORG}/logo`), false)
    assert.equal(isUploadedLogo('https://cdn.example.com/acme.png'), false)
    assert.equal(isUploadedLogo('/branding/logo.png'), false)
    assert.equal(isUploadedLogo(null), false)
  })

  it('classifies the active logo source', () => {
    assert.equal(logoSource(''), 'none')
    assert.equal(logoSource('   '), 'none')
    assert.equal(logoSource(uploadedLogoUrl(1)), 'uploaded')
    assert.equal(logoSource('https://cdn.example.com/acme.png'), 'url')
  })

  it('serves stored logos with a byte-derived type and no sniffing or script execution', () => {
    const headers = logoResponseHeaders('image/png')
    assert.equal(headers['Content-Type'], 'image/png')
    assert.equal(headers['X-Content-Type-Options'], 'nosniff')
    assert.match(headers['Content-Security-Policy'], /default-src 'none'/)
    assert.match(headers['Cache-Control'], /^private/)
  })
})

describe('hosted logo URL field', () => {
  const accepts = isAllowedLogoUrl

  it('keeps hosted https URLs, site paths, the uploaded-logo route, and an empty value working', () => {
    assert.equal(accepts('https://cdn.example.com/acme.png'), true)
    assert.equal(accepts('/branding/logo.png'), true)
    assert.equal(accepts(uploadedLogoUrl(7)), true)
    assert.equal(accepts(null), true)
  })

  it('rejects protocol-relative and non-https URLs', () => {
    assert.equal(accepts('//evil.example.com/logo.png'), false)
    assert.equal(accepts('http://cdn.example.com/acme.png'), false)
    assert.equal(accepts('javascript:alert(1)'), false)
  })
})
