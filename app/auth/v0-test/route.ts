import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return new NextResponse('Not found', { status: 404 })
  const file = join(process.cwd(), '.v0-session.json')
  if (!existsSync(file)) return new NextResponse('No session', { status: 404 })
  const { nonce, cookies } = JSON.parse(readFileSync(file, 'utf8')) as { nonce: string; cookies: [string, string][] }
  if (request.nextUrl.searchParams.get('n') !== nonce) return new NextResponse('Forbidden', { status: 403 })
  unlinkSync(file)
  const next = request.nextUrl.searchParams.get('next') ?? '/dashboard'
  const response = NextResponse.redirect(new URL(next.startsWith('/') ? next : '/dashboard', request.url))
  for (const [name, value] of cookies) {
    response.cookies.set(name, value, { path: '/', sameSite: 'none', secure: true, httpOnly: false })
  }
  return response
}
