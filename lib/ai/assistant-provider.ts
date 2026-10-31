import 'server-only'

export const ASSISTANT_LIMITS = {
  perUserPerHour: 30,
  perOrgPerDay: 500,
  maxMessages: 12,
  maxMessageChars: 2000,
  /** Raised from 1,200 for multi-record analysis; simple answers stay short through the instructions. */
  maxOutputTokens: 1600,
  timeoutMs: 45_000,
} as const

const DEFAULT_MODEL = 'openai/gpt-5.4-mini'

/**
 * The assistant runs through Vercel AI Gateway. Deployments on Vercel authenticate
 * automatically (OIDC); elsewhere an AI_GATEWAY_API_KEY is required.
 */
export function getAssistantProviderConfig() {
  const configured = Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim() || process.env.VERCEL === '1',
  )
  return { configured, model: process.env.AI_ASSISTANT_MODEL?.trim() || DEFAULT_MODEL }
}
