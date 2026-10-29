type ClientIdentity = {
  first_name: string
  middle_name?: string | null
  last_name: string
  email?: string | null
  phone?: string | null
  alternate_phone?: string | null
  preferred_communication?: string | null
}

/**
 * The primary contact row every client must have. Portal flags match the
 * 20261027000001 backfill: they describe what the homeowner may do once a
 * portal login exists, and grant nothing on their own. They must be on because
 * linking a portal account to a disabled contact locks the homeowner out
 * (portal_contact_can), whereas an unlinked account has legacy full access.
 */
export function buildPrimaryContact(client: ClientIdentity) {
  const text = (v: string | null | undefined) => {
    const t = v?.trim()
    return t ? t : null
  }
  return {
    first_name: client.first_name.trim(),
    middle_name: text(client.middle_name),
    last_name: client.last_name.trim(),
    relationship: 'primary_owner' as const,
    email: text(client.email)?.toLowerCase() ?? null,
    phone: text(client.phone),
    alternate_phone: text(client.alternate_phone),
    preferred_communication: client.preferred_communication ?? 'email',
    is_primary: true,
    portal_enabled: true,
    portal_view_reports: true,
    portal_validate_issues: true,
    portal_acknowledge: true,
    portal_sign: true,
  }
}
