'use client'

import { useRef, useState, useTransition } from 'react'
import { Building2, ImageOff, Info, Loader2, Palette as PaletteIcon, Trash2, Upload } from 'lucide-react'
import { removeCompanyLogoAction, uploadCompanyLogoAction, type LogoActionResult } from '@/app/actions/organization'
import { LOGO_ACCEPT, LOGO_MIME_TYPES, MAX_LOGO_BYTES, logoSource } from '@/lib/company-logo'
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
          className="h-10 font-mono"
          maxLength={7}
        />
      </div>
      {error ? (
        <p id={`${name}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id={`${name}-hint`} className="text-xs text-muted-foreground">
          Hex, e.g. #174D38
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
  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [logoMessage, setLogoMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const previewLogo = logoUrl.trim()
  const hasLogo = previewLogo !== ''
  const source = logoSource(previewLogo, process.env.NEXT_PUBLIC_SUPABASE_URL)

  function applyResult(result: LogoActionResult) {
    if ('error' in result) {
      setLogoMessage({ tone: 'error', text: result.error })
      return
    }
    setLogoUrl(result.logoUrl ?? '')
    setLogoFailed(false)
    setLogoMessage({ tone: 'success', text: result.success })
  }

  function handleFile(file: File | undefined) {
    if (!file) return
    setConfirmingRemove(false)
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setLogoMessage({ tone: 'error', text: 'Use a PNG, JPG, or WebP image.' })
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoMessage({ tone: 'error', text: 'Logo must be 2 MB or smaller.' })
      return
    }
    const data = new FormData()
    data.set('logo', file)
    setLogoMessage(null)
    startTransition(async () => applyResult(await uploadCompanyLogoAction(data)))
  }

  function handleRemove() {
    setConfirmingRemove(false)
    setLogoMessage(null)
    startTransition(async () => applyResult(await removeCompanyLogoAction()))
  }
  const previewPrimary = HEX.test(primary) ? primary : DEFAULT_BRAND.primaryColor
  const previewSecondary = HEX.test(secondary) ? secondary : DEFAULT_BRAND.secondaryColor

  return (
    <FormSection
      icon={PaletteIcon}
      title="Company Branding"
      description="Your logo and colors appear in the homeowner portal and on documents."
    >
      <div className="flex flex-col gap-4 sm:col-span-2 lg:flex-row">
        <div className="flex flex-1 flex-col gap-3">
          <span className="text-sm font-medium text-foreground">Logo preview</span>
          <div className="flex h-32 items-center justify-center rounded-lg border border-[#D6DDE5] bg-[#F3F4F6] p-4">
            {!hasLogo ? (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Building2 className="size-8" aria-hidden="true" />
                <span className="text-sm">No company logo</span>
              </div>
            ) : logoFailed ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <ImageOff className="size-6 text-destructive" aria-hidden="true" />
                <p className="text-sm text-destructive">This logo could not be loaded. Check the URL or upload a file.</p>
              </div>
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
            {source === 'none'
              ? 'No logo yet. Customer-facing pages show your company name instead.'
              : source === 'uploaded'
                ? 'Using your uploaded logo.'
                : 'Using a hosted logo URL.'}
          </p>
        </div>

        <div className="flex flex-1 flex-col gap-3">
          <span className="text-sm font-medium text-foreground">Branding preview</span>
          <div className="overflow-hidden rounded-lg border border-[#D6DDE5] bg-card">
            <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: previewSecondary }}>
              <span className="flex h-8 w-16 shrink-0 items-center justify-center rounded bg-white p-1">
                {hasLogo && !logoFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- logo may be any https URL configured by the admin
                  <img src={previewLogo} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span className="truncate text-sm font-semibold text-white">{displayName}</span>
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
          placeholder="https://example.com/logo.png"
          hint="Optional. Uploading a file is preferred; a hosted https:// URL saved here replaces the uploaded logo."
        />
        <input
          ref={fileInput}
          type="file"
          accept={LOGO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            handleFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            aria-describedby="logo-upload-hint"
            onClick={() => fileInput.current?.click()}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Upload aria-hidden="true" />}
            {hasLogo ? 'Replace Logo' : 'Upload Logo'}
          </Button>
          {confirmingRemove ? (
            <div className="flex items-center gap-2" role="group" aria-label="Confirm logo removal">
              <span className="text-sm text-foreground">Remove the current logo?</span>
              <Button type="button" variant="destructive" size="sm" disabled={pending} onClick={handleRemove}>
                Remove
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingRemove(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={!hasLogo || pending}
              onClick={() => setConfirmingRemove(true)}
            >
              <Trash2 aria-hidden="true" />
              Remove Logo
            </Button>
          )}
        </div>
        <p id="logo-upload-hint" className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          PNG, JPG, or WebP up to 2 MB. Uploads and removals save immediately; colors are not affected.
        </p>
        {logoMessage ? (
          <p
            role={logoMessage.tone === 'error' ? 'alert' : 'status'}
            className={logoMessage.tone === 'error' ? 'text-sm text-destructive' : 'text-sm text-foreground'}
          >
            {logoMessage.text}
          </p>
        ) : null}
      </div>

      <ColorField name="primary_color" label="Primary brand color" value={primary} onChange={setPrimary} error={errors.primary_color} />
      <ColorField name="secondary_color" label="Secondary color" value={secondary} onChange={setSecondary} error={errors.secondary_color} />
    </FormSection>
  )
}
