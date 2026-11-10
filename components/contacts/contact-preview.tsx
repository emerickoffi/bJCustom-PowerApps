'use client'

import Link from 'next/link'
import { ArrowRight, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ContactStatusBadge } from '@/components/contacts/contact-status-button'
import { useOverlayHref } from '@/components/contacts/contact-overlays'
import { ActiveStatusBadge, SemanticBadge } from '@/components/shared/semantic-badge'
import {
  PREVIEW_LINK_CLASS,
  PreviewDetail,
  PreviewDetails,
  PreviewEmail,
  PreviewEmpty,
  PreviewList,
  PreviewNotes,
  PreviewPhone,
  PreviewRecordLink,
  PreviewSection,
  PreviewSectionError,
  PreviewShortcuts,
  RecordPreviewBody,
  RecordPreviewHeader,
} from '@/components/shared/record-preview'
import {
  COMPANY_PREVIEW_PARAM,
  CONTACT_PREVIEW_PARAM,
  PREVIEW_LIST_LIMIT,
  companyPreviewApiPath,
  companyProjectDetail,
  personPreviewApiPath,
  recordPreviewErrorState,
  withPreviewParam,
  type CompanyPreview,
  type PersonAccess,
  type PersonPreview,
} from '@/lib/record-preview'

export type ContactPreviewRecord = { id: string; name: string; kind: 'person' | 'company' }

const joined = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(' · ')

/** The preview for one directory record: a person or a company, with the same content in the column and the drawer. */
export function ContactPreview({ record }: { record: ContactPreviewRecord }) {
  const overlayHref = useOverlayHref()
  const person = record.kind === 'person'
  const openHref = person ? `/contacts/people/${record.id}` : `/contacts/companies/${record.id}`
  const editHref = withPreviewParam(
    overlayHref(person ? { edit: record.id } : { editCompany: record.id }),
    person ? CONTACT_PREVIEW_PARAM : COMPANY_PREVIEW_PARAM,
    record.id,
  )

  return (
    <>
      <RecordPreviewHeader
        title={record.name}
        closeLabel={person ? 'Close contact preview' : 'Close company preview'}
        meta={<span className="text-xs text-muted-foreground">{person ? 'Person' : 'Company'}</span>}
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              render={<Link href={editHref} scroll={false} replace />}
              nativeButton={false}
            >
              <Pencil data-icon="inline-start" />
              Edit
            </Button>
            <Button variant="view" size="sm" render={<Link href={openHref} />} nativeButton={false}>
              {person ? 'Open contact' : 'Open company'}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </>
        }
      />
      {person ? (
        <RecordPreviewBody<PersonPreview>
          url={personPreviewApiPath(record.id)}
          recordId={record.id}
          loadingLabel="Loading contact details"
          errorState={(status) => recordPreviewErrorState(status, 'contact')}
        >
          {(preview) => <PersonDetails name={record.name} preview={preview} />}
        </RecordPreviewBody>
      ) : (
        <RecordPreviewBody<CompanyPreview>
          url={companyPreviewApiPath(record.id)}
          recordId={record.id}
          loadingLabel="Loading company details"
          errorState={(status) => recordPreviewErrorState(status, 'company')}
        >
          {(preview) => <CompanyDetails name={record.name} preview={preview} />}
        </RecordPreviewBody>
      )}
    </>
  )
}

function Shortcuts({ name, phone, email }: { name: string; phone: string | null; email: string | null }) {
  if (!phone && !email) return null
  return (
    <div className="-my-1 flex shrink-0 items-center gap-0.5">
      <PreviewShortcuts name={name} phone={phone} email={email} />
    </div>
  )
}

function PersonDetails({ name, preview }: { name: string; preview: PersonPreview }) {
  const { companies, projects } = preview
  const hasDetails = Boolean(
    preview.specialty || preview.email || preview.primaryPhone || preview.secondaryPhone || preview.status === 'inactive',
  )

  return (
    <>
      <PreviewSection
        title="Contact details"
        action={<Shortcuts name={name} phone={preview.primaryPhone ?? preview.secondaryPhone} email={preview.email} />}
      >
        {hasDetails ? (
          <PreviewDetails>
            {preview.status === 'inactive' && (
              <PreviewDetail label="Status">
                <ContactStatusBadge status="inactive" />
              </PreviewDetail>
            )}
            {preview.specialty && <PreviewDetail label="Profession / trade">{preview.specialty}</PreviewDetail>}
            {preview.primaryPhone && (
              <PreviewDetail label="Primary phone">
                <PreviewPhone value={preview.primaryPhone} />
              </PreviewDetail>
            )}
            {preview.secondaryPhone && (
              <PreviewDetail label="Secondary phone">
                <PreviewPhone value={preview.secondaryPhone} />
              </PreviewDetail>
            )}
            {preview.email && (
              <PreviewDetail label="Email">
                <PreviewEmail value={preview.email} />
              </PreviewDetail>
            )}
          </PreviewDetails>
        ) : (
          <PreviewEmpty>No phone, email, or trade on file.</PreviewEmpty>
        )}
      </PreviewSection>

      <PreviewSection title="Company affiliation" count={companies?.length}>
        {companies === null ? (
          <PreviewSectionError>Company affiliations could not be loaded.</PreviewSectionError>
        ) : companies.length === 0 ? (
          <PreviewEmpty>Independent. Not affiliated with a company.</PreviewEmpty>
        ) : (
          <PreviewList items={companies} limit={PREVIEW_LIST_LIMIT} itemKey={(c) => c.id}>
            {(c) => <PreviewRecordLink href={c.href} name={c.name} detail={joined(c.role, c.primary && 'Primary contact')} />}
          </PreviewList>
        )}
      </PreviewSection>

      <PreviewSection title="Assigned projects" count={projects?.length}>
        {projects === null ? (
          <PreviewSectionError>Project assignments could not be loaded.</PreviewSectionError>
        ) : projects.length === 0 ? (
          <PreviewEmpty>Not assigned to a project.</PreviewEmpty>
        ) : (
          <PreviewList items={projects} limit={PREVIEW_LIST_LIMIT} itemKey={(p) => p.id}>
            {(p) => <PreviewRecordLink href={p.href} name={p.name} detail={joined(p.number, p.role)} />}
          </PreviewList>
        )}
      </PreviewSection>

      <PersonAccessSection access={preview.access} />
      <PreviewNotes notes={preview.notes} />
    </>
  )
}

/** Portal access is reported on its own: being in the directory, at a company, or on a project grants none. */
function PersonAccessSection({ access }: { access: PersonAccess }) {
  if (access.state === 'error') {
    return (
      <PreviewSection title="Portal access">
        <PreviewSectionError>Portal access could not be loaded.</PreviewSectionError>
      </PreviewSection>
    )
  }
  const { status, company, manageHref } = access
  const detail = !company
    ? 'Directory contacts do not have their own sign-in.'
    : status === 'active'
      ? `Signs in to the subcontractor portal for ${company}.`
      : status === 'revoked'
        ? `Their subcontractor portal login for ${company} has been revoked.`
        : `No subcontractor portal login for ${company} uses this contact's email.`

  return (
    <PreviewSection
      title="Portal access"
      action={
        manageHref && (
          <Link href={manageHref} className={PREVIEW_LINK_CLASS}>
            Manage access
          </Link>
        )
      }
    >
      <div className="flex flex-col items-start gap-1.5">
        {status === 'active' ? (
          <ActiveStatusBadge />
        ) : (
          <SemanticBadge tone={status === 'revoked' ? 'danger' : 'neutral'}>
            {status === 'revoked' ? 'Access revoked' : 'No portal login'}
          </SemanticBadge>
        )}
        <p className="text-sm text-muted-foreground">{detail}</p>
      </div>
    </PreviewSection>
  )
}

function websiteHref(website: string) {
  return /^https?:\/\//i.test(website) ? website : `https://${website}`
}

function CompanyDetails({ name, preview }: { name: string; preview: CompanyPreview }) {
  const { contacts, projects, subcontractor } = preview
  const hasDetails = Boolean(
    preview.email || preview.phone || preview.secondaryPhone || preview.website || preview.address || subcontractor || preview.status === 'inactive',
  )
  const hasCategories = Boolean(subcontractor?.trade || preview.categories.length || preview.productCategories.length)

  return (
    <>
      <PreviewSection title="Company details" action={<Shortcuts name={name} phone={preview.phone ?? preview.secondaryPhone} email={preview.email} />}>
        {hasDetails ? (
          <PreviewDetails>
            {preview.status === 'inactive' && (
              <PreviewDetail label="Status">
                <ContactStatusBadge status="inactive" />
              </PreviewDetail>
            )}
            {preview.phone && (
              <PreviewDetail label="Phone">
                <PreviewPhone value={preview.phone} />
              </PreviewDetail>
            )}
            {preview.secondaryPhone && (
              <PreviewDetail label="Secondary phone">
                <PreviewPhone value={preview.secondaryPhone} />
              </PreviewDetail>
            )}
            {preview.email && (
              <PreviewDetail label="Email">
                <PreviewEmail value={preview.email} />
              </PreviewDetail>
            )}
            {preview.website && (
              <PreviewDetail label="Website">
                <a
                  href={websiteHref(preview.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all rounded-sm underline-offset-4 outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {preview.website}
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </PreviewDetail>
            )}
            {preview.address && <PreviewDetail label="Address">{preview.address}</PreviewDetail>}
            {subcontractor && (
              <PreviewDetail label="Subcontractor">
                {subcontractor.href ? (
                  <Link
                    href={subcontractor.href}
                    className="rounded-sm text-link underline-offset-4 outline-none hover:text-link-hover hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Open subcontractor record
                  </Link>
                ) : (
                  'Linked subcontractor'
                )}
              </PreviewDetail>
            )}
          </PreviewDetails>
        ) : (
          <PreviewEmpty>No contact details or address on file.</PreviewEmpty>
        )}
      </PreviewSection>

      <PreviewSection title="Contact people" count={contacts?.length}>
        {contacts === null ? (
          <PreviewSectionError>Contact people could not be loaded.</PreviewSectionError>
        ) : contacts.length === 0 ? (
          <PreviewEmpty>No contact people linked to this company.</PreviewEmpty>
        ) : (
          <PreviewList items={contacts} limit={PREVIEW_LIST_LIMIT} itemKey={(c) => c.id}>
            {(c) => (
              <>
                <PreviewRecordLink href={c.href} name={c.name} detail={joined(c.primary && 'Primary contact', c.role)} />
                <PreviewShortcuts name={c.name} phone={c.phone} email={c.email} />
              </>
            )}
          </PreviewList>
        )}
      </PreviewSection>

      <PreviewSection title="Assigned projects" count={projects?.length}>
        {projects === null ? (
          <PreviewSectionError>Project assignments could not be loaded.</PreviewSectionError>
        ) : projects.length === 0 ? (
          <PreviewEmpty>Not assigned to a project.</PreviewEmpty>
        ) : (
          <>
            <PreviewList items={projects} limit={PREVIEW_LIST_LIMIT} itemKey={(p) => p.id}>
              {(p) => <PreviewRecordLink href={p.href} name={p.name} detail={joined(p.number, companyProjectDetail(p))} />}
            </PreviewList>
            <p className="text-xs text-muted-foreground">Assigning a company does not assign its people. Each person is assigned individually.</p>
          </>
        )}
      </PreviewSection>

      {hasCategories && (
        <PreviewSection title="Trade and categories">
          <PreviewDetails>
            {subcontractor?.trade && <PreviewDetail label="Trade">{subcontractor.trade}</PreviewDetail>}
            {preview.categories.length > 0 && <PreviewDetail label="Category">{preview.categories.join(', ')}</PreviewDetail>}
            {preview.productCategories.length > 0 && <PreviewDetail label="Products">{preview.productCategories.join(', ')}</PreviewDetail>}
          </PreviewDetails>
        </PreviewSection>
      )}

      <PreviewNotes notes={preview.notes} />
    </>
  )
}
