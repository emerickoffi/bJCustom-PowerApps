import { writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } })
const wantRole = process.argv[2] ?? 'org_admin'

const { data: rows, error: mErr } = await admin
  .from('organization_memberships')
  .select('user_id, role')
  .eq('status', 'active')
  .is('client_id', null)
  .eq('role', wantRole)
  .limit(1)
if (mErr || !rows?.length) throw new Error('no membership: ' + (mErr?.message ?? 'none'))
const { data: u } = await admin.auth.admin.getUserById(rows[0].user_id)
const { data: link, error: lErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: u.user.email })
if (lErr) throw lErr
const { data: v, error: vErr } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
if (vErr) throw vErr

const ref = new URL(url).hostname.split('.')[0]
const name = `sb-${ref}-auth-token`
const value = 'base64-' + Buffer.from(JSON.stringify(v.session)).toString('base64url')
const CHUNK = 3180
const cookies = value.length <= CHUNK
  ? [[name, value]]
  : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, i) => [`${name}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK)])
const nonce = randomBytes(12).toString('hex')
writeFileSync('.v0-session.json', JSON.stringify({ nonce, cookies }))
console.log('NONCE ' + nonce + ' ROLE ' + rows[0].role)
