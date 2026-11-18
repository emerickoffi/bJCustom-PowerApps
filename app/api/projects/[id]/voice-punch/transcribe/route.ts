// Kept so clients loaded before the move to /voice/transcribe keep working during a deploy.
export { POST } from '../../voice/transcribe/route'

export const runtime = 'nodejs'
export const maxDuration = 60
