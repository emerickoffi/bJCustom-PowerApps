'use client'

import { useState } from 'react'
import { Palette as PaletteIcon, Trash2, Upload, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FormSection, TextField } from '@/components/shared/form-field'
import { DEFAULT_BRAND } from '@/lib/branding'

const HEX = /^#[0-9a-fA-F]{6}$/

function ColorField({
  name,
  label,
  value,
  onChange,
  error,
}: {
  name: string
  label: string
  value: string
  onChange: (v: string) => void
  error?: string
}) {
  const valid = HEX.test(value)
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`${label} picker`}
          value={valid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-card p-1"
        />
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${name}-error` : `${name}-hint`}
          className="h-10 font-mono uppercase"
          maxLength={7}
        />
      </div>
      {error ? (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          Hex, e.g. #174D32
        </p>
      )}
    </div>
  )
}

export function CompanyBrandingSection({
  defaults,
  displayName,
  errors,
}: {
  defaults: { logo_url?: string | null; primary_color?: string; secondary_color?: string }
  displayName: string
  errors: Record<string, string | undefined>
}) {
  const [logoUrl, setLogoUrl] = useState(defaults.logo_url ?? '')
  const [primary, setPrimary] = useState(defaults.primary_color ?? DEFAULT_BRAND.primaryColor)
  const [secondary, setSecondary] = useState(defaults.secondary_color ?? DEFAULT_BRAND.secondaryColor)
  const [logoFailed, setLogoFailed] = useState(false)

  const usingDefault = logoUrl.trim() === ''
  const previewLogo = usingDefault ? DEFAULT_BRAND.logoUrl : logoUrl.trim()
  const previewPrimary = HEX.test(primary) ? primary : DEFAULT_BRAND.primaryColor
  const previewSecondary = HEX.test(secondary) ? secondary : DEFAULT_BRAND.secondaryColor

  return (
    <FormSection
      icon={PaletteIcon}
      title="Company Branding"
      description="Your logo and colors appear in the app header, homeowner portal, and documents."
    >
      <div className="flex flex-col gap-4 sm:col-span-2 lg:flex-row">
        <div className="flex flex-1 flex-col gap-3">
          <span className="text-sm font-medium text-foreground">Logo preview</span>
          <div className="flex h-32 items-center justify-center rounded-lg border border-[#E2E8E2] bg-[#F8F7F3] p-4">
            {logoFailed && !usingDefault ? (
              <p className="text-center text-sm text-destructive">This logo URL could not be loaded.</p>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- logo may be any https URL configured by the admin
              <img
                key={previewLogo}
                src={previewLogo}
                alt={`${displayName} logo`}
                className="max-h-full max-w-full object-contain"
                onError={() => setLogoFailed(true)}
                onLoad={() => setLogoFailed(false)}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {usingDefault ? 'Using the default B & J Custom Homes logo.' : 'Using your custom logo.'}
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <span className="text-sm font-medium text-foreground">Branding preview</span>
          <div className="overflow-hidden rounded-lg border border-[#E2E8E2] bg-card">
            <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: previewSecondary }}>
              <span className="truncate font-serif text-sm font-semibold text-white">{displayName}</span>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <p className="text-sm text-muted-foreground">Buttons and highlights use your primary color.</p>
              <span
                className="w-fit rounded-md px-3 py-1.5 text-sm font-medium text-white"
                style={{ backgroundColor: previewPrimary }}
              >
                Primary action
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:col-span-2">
        <TextField
          name="logo_url"
          label="Logo URL"
          value={logoUrl}
          onChange={(e) => {
            setLogoUrl(e.target.value)
            setLogoFailed(false)
          }}
          error={errors.logo_url}
          placeholder={DEFAULT_BRAND.logoUrl}
          hint="An https:// URL or a site path. Leave blank to use the default logo."
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="button" variant="outline" disabled aria-describedby="logo-upload-unavailable">
            <Upload aria-hidden="true" />
            Upload / Replace Logo
          </Button>
          <Button type="button" variant="outline" disabled={usingDefault} onClick={() => setLogoUrl('')}>
            <Trash2 aria-hidden="true" />
            Remove Logo
          </Button>
        </div>
        <p id="logo-upload-unavailable" className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          File upload is not available yet because there is no secure storage location for company logos. Paste a
          hosted logo URL instead.
        </p>
      </div>

      <ColorField name="primary_color" label="Primary brand color" value={primary} onChange={setPrimary} error={errors.primary_color} />
      <ColorField name="secondary_color" label="Secondary color" value={secondary} onChange={setSecondary} error={errors.secondary_color} />
    </FormSection>
  )
}
