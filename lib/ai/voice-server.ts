import 'server-only'

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { getOrgFeatures } from '@/lib/features'
import { createClient } from '@/lib/supabase/server'
import { isUuid } from '@/lib/subcontractor-projects'
import { getAssistantProviderConfig } from '@/lib/ai/assistant-provider'
import { VOICE_LIMITS } from '@/lib/voice'
import type { FeatureKey } from '@/lib/feature-registry'

export const NO_STORE = { 'Cache-Control': 'private, no-store' }

export function voiceFail(status: number, code: string, error: string) {
  return NextResponse.json({ code, error }, { status, headers: NO_STORE })
}

type Kind = 'transcribe' | 'extract'

type VoiceGateOptions = {
  /** A module that must be on besides the AI assistant, e.g. daily_logs. */
  feature?: FeatureKey
  /** Also require internal (staff) access to the project, the rule daily log pages use. */
  internalOnly?: boolean
}

/**
 * Shared gate for voice drafting: signed-in builder staff, AI enabled for the company, project
 * visible to this user under RLS, provider configured, and within per-user and per-company limits.
 * The project id comes from the URL and is re-checked here; client-supplied ids are never trusted.
 */
export async function authorizeVoiceRequest(projectId: string, kind: Kind, options: VoiceGateOptions = {}) {
  const session = await getSession()
  if (!session?.organizationId || !session.role) return { response: voiceFail(401, 'unauthenticated', 'Your session expired. Sign in again.') }
  if (session.role === 'client') return { response: voiceFail(403, 'forbidden', 'You do not have permission to use voice drafting.') }
  if (!isUuid(projectId)) return { response: voiceFail(404, 'not_found', 'That project is not available to you.') }

  const provider = getAssistantProviderConfig()
  if (!provider.configured) {
    return { response: voiceFail(503, 'not_configured', 'Voice drafting is not set up yet. An administrator needs to connect Vercel AI Gateway.') }
  }

  const features = await getOrgFeatures(session.organizationId)
  if (!features.ai_assistant) return { response: voiceFail(403, 'feature_off', 'AI features are turned off for your company. Type it instead.') }
  if (options.feature && !features[options.feature]) return { response: voiceFail(403, 'feature_off', 'This module is turned off for your company.') }

  const supabase = await createClient()
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('organization_id', session.organizationId)
    .maybeSingle()
  if (!project) return { response: voiceFail(404, 'not_found', 'That project is not available to you.') }
  if (options.internalOnly) {
    const { data: canView } = await supabase.rpc('can_view_project_internal', { p_project: projectId })
    if (!canView) return { response: voiceFail(404, 'not_found', 'That project is not available to you.') }
  }

  const { data: usage } = await supabase
    .rpc('ai_voice_usage', { p_org: session.organizationId, p_kind: kind })
    .maybeSingle<{ user_last_hour: number; org_last_day: number }>()
  if (!usage) return { response: voiceFail(503, 'unavailable', 'Voice drafting is not available right now. Type it instead.') }
  const perUser = kind === 'transcribe' ? VOICE_LIMITS.transcribePerUserPerHour : VOICE_LIMITS.extractPerUserPerHour
  const perOrg = kind === 'transcribe' ? VOICE_LIMITS.transcribePerOrgPerDay : VOICE_LIMITS.extractPerOrgPerDay
  if (usage.user_last_hour >= perUser) return { response: voiceFail(429, 'rate_limited', 'You have reached the hourly voice limit. Type it or try again later.') }
  if (usage.org_last_day >= perOrg) return { response: voiceFail(429, 'rate_limited', 'Your company has reached today’s voice limit. Type it instead.') }

  const { error: logError } = await supabase
    .from('ai_voice_requests')
    .insert({ organization_id: session.organizationId, user_id: session.userId, project_id: projectId, kind })
  if (logError) return { response: voiceFail(503, 'unavailable', 'Voice drafting is not available right now. Type it instead.') }

  return { session: { ...session, organizationId: session.organizationId }, provider }
}

export function isTimeout(error: unknown) {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
}
