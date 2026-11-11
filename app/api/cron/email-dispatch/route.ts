import { timingSafeEqual } from 'node:crypto'
import { runEmailDispatch } from '@/lib/email/worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const expected = Buffer.from(`Bearer ${secret}`)
  const actual = Buffer.from(request.headers.get('authorization') ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(request: Request) {
  if (!authorized(request)) return new Response('Unauthorized', { status: 401 })
  try {
    const summary = await runEmailDispatch()
    return Response.json(summary)
  } catch (error) {
    console.error('[email] cron dispatch failed', error instanceof Error ? error.message : error)
    return Response.json({ error: 'dispatch_failed' }, { status: 500 })
  }
}
