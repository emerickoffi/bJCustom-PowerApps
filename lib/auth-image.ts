export type AuthImage = {
  /** Responsive sources, smallest first. Each entry is `[path, intrinsicWidth]`. */
  sources: ReadonlyArray<readonly [string, number]>
  /** CSS object-position keeping the subject in frame as the panel's aspect ratio changes. */
  focalPoint: string
}

/**
 * Login panel image. PLACEHOLDER: AI-generated stand-in, not a licensed photograph.
 * Replace the files in /public/images/auth/ with a licensed photo (and adjust focalPoint) before production.
 */
export const LOGIN_IMAGE: AuthImage = {
  sources: [
    ['/images/auth/login-architecture-960.webp', 960],
    ['/images/auth/login-architecture-1600.webp', 1600],
  ],
  focalPoint: '60% 70%',
}
