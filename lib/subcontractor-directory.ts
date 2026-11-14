/** Up to two initials for a company tile, e.g. "Hill Country Electric LLC" -> "HC". */
export function companyInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
    .split(/[\s&-]+/)
    .filter(Boolean)
  if (!words.length) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export type PrimaryContact = { name: string | null; role: string | null; email: string | null; phone: string | null }

/**
 * The one primary-contact rule shared by the table, the preview, and the detail page: the linked directory company's
 * active primary person wins; otherwise the subcontractor's own email and phone; otherwise nothing.
 */
export function resolvePrimaryContact(
  person: PrimaryContact | null | undefined,
  company: { email: string | null; phone: string | null },
): PrimaryContact | null {
  if (person) return person
  if (company.email || company.phone) return { name: null, role: null, email: company.email, phone: company.phone }
  return null
}

export type DirectorySummary = {
  total: number
  active: number
  /**
   * Companies with at least one current project assignment: not ended, on a project that is not completed,
   * cancelled, or archived (the detail page's "Current" list). Null when association storage is unavailable.
   */
  onProjects: number | null
}

/**
 * Directory metrics from already-loaded rows. Project association counts only companies that exist in the
 * provided list, so stale or cross-scope association rows can never inflate the number.
 */
export function summarizeDirectory(
  companies: readonly { id: string; status: string }[],
  projectsByCompany: Readonly<Record<string, readonly unknown[]>> | null,
): DirectorySummary {
  return {
    total: companies.length,
    active: companies.filter((c) => c.status === 'active').length,
    onProjects: projectsByCompany ? companies.filter((c) => (projectsByCompany[c.id]?.length ?? 0) > 0).length : null,
  }
}

export function projectCountLabel(count: number): string {
  return count === 0 ? 'No projects' : `${count} ${count === 1 ? 'project' : 'projects'}`
}
