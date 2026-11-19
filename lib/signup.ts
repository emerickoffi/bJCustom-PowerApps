import 'server-only'

/**
 * Self sign-up (a new builder creates their own company with a 14-day Business trial) is off unless
 * TREFORT_SELF_SIGNUP=open is set in the environment, so it can be switched on for beta testers without a deploy.
 */
export function selfSignupOpen(): boolean {
  return process.env.TREFORT_SELF_SIGNUP === 'open'
}
