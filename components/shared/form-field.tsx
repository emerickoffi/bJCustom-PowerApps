import { AlertCircle, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

type BaseProps = {
  name: string
  label: string
  error?: string
  hint?: string
  required?: boolean
  className?: string
}

function FieldShell({
  name,
  label,
  error,
  hint,
  required,
  className,
  children,
}: BaseProps & { children: React.ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <Label htmlFor={name} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <>
            <span className="text-destructive" aria-hidden="true">
              *
            </span>
            <span className="sr-only">(required)</span>
          </>
        )}
      </Label>
      {children}
      {error ? (
        <p id={`${name}-error`} className="flex items-start gap-1.5 text-xs leading-relaxed text-destructive">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${name}-hint`} className="text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type TextFieldProps = BaseProps & Omit<React.ComponentProps<'input'>, 'name' | 'className'>

export function TextField({ name, label, error, hint, required, className, ...inputProps }: TextFieldProps) {
  return (
    <FieldShell name={name} label={label} error={error} hint={hint} required={required} className={className}>
      <Input
        id={name}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        className="h-10 placeholder:text-muted-foreground/80"
        {...inputProps}
      />
    </FieldShell>
  )
}

type TextAreaFieldProps = BaseProps & Omit<React.ComponentProps<'textarea'>, 'name' | 'className'>

export function TextAreaField({ name, label, error, hint, required, className, ...props }: TextAreaFieldProps) {
  return (
    <FieldShell name={name} label={label} error={error} hint={hint} required={required} className={className}>
      <Textarea
        id={name}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${name}-error` : hint ? `${name}-hint` : undefined}
        className="min-h-28 placeholder:text-muted-foreground/80"
        {...props}
      />
    </FieldShell>
  )
}

type SelectFieldProps = BaseProps & {
  options: { value: string; label: string; disabled?: boolean }[]
  defaultValue?: string
  placeholder?: string
  disabled?: boolean
}

export function SelectField({
  name,
  label,
  error,
  hint,
  required,
  className,
  options,
  defaultValue,
  placeholder,
  disabled,
}: SelectFieldProps) {
  return (
    <FieldShell name={name} label={label} error={error} hint={hint} required={required} className={className}>
      <NativeSelect
        id={name}
        name={name}
        required={required}
        disabled={disabled}
        defaultValue={defaultValue ?? ''}
        aria-invalid={error ? true : undefined}
      >
        {placeholder !== undefined && (
          <option value="" disabled={required}>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </FieldShell>
  )
}

export function NativeSelect({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2.5 text-sm text-foreground outline-none transition-colors',
        'focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        'aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className,
      )}
      {...props}
    />
  )
}

export function FormSection({
  title,
  description,
  icon: Icon,
  flat = false,
  children,
}: {
  title: string
  description?: string
  icon?: LucideIcon
  /** Divider style instead of a card, for sections stacked inside a drawer. */
  flat?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={
        flat
          ? 'border-b border-border/60 py-5 last:border-b-0'
          : 'rounded-xl border border-border/80 bg-card p-5 shadow-xs sm:p-6'
      }
    >
      <header className={cn('flex items-start gap-3', flat ? 'mb-4' : 'mb-5 border-b border-border/60 pb-4')}>
        {Icon && (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-sage text-primary ring-1 ring-inset ring-primary/10">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        )}
        <div className="flex min-w-0 flex-col gap-0.5 pt-0.5">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {description && <p className="text-sm leading-relaxed text-pretty text-muted-foreground">{description}</p>}
        </div>
      </header>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

export function FormActions({
  message,
  note = 'Fields marked * are required.',
  children,
}: {
  message?: React.ReactNode
  note?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border/80 bg-card/70 p-4 sm:p-5">
      {message}
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">{note}</p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">{children}</div>
      </div>
    </div>
  )
}
