const MAX_SEGMENT_LENGTH = 60

function toFilenameSegment(value: string | null | undefined): string {
  return (value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-._]+|[-._]+$/g, '')
    .slice(0, MAX_SEGMENT_LENGTH)
    .replace(/[-._]+$/g, '')
}

/**
 * Builds `{ProjectNumber}_{ProjectName}_{EstimateNumber}` (without extension — browsers
 * append `.pdf` to the document title when saving). Revisions after the first get an
 * `-R{n}` suffix so re-issued estimates never collide with earlier exports.
 */
export function estimatePdfBaseName(input: {
  projectNumber: string | null | undefined
  projectName: string | null | undefined
  estimateNumber: string | null | undefined
  revision?: number | null
}): string {
  const estimate = toFilenameSegment(input.estimateNumber) || 'Estimate'
  const revision = input.revision && input.revision > 1 ? `-R${input.revision}` : ''
  const segments = [
    toFilenameSegment(input.projectNumber),
    toFilenameSegment(input.projectName),
    `${estimate}${revision}`,
  ].filter(Boolean)
  return segments.join('_')
}

export function estimatePdfFilename(input: Parameters<typeof estimatePdfBaseName>[0]): string {
  return `${estimatePdfBaseName(input)}.pdf`
}
