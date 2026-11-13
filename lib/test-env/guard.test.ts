import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRODUCTION_SUPABASE_PROJECT_ID as PROD,
  assertTestIsolation,
  checkTestIsolation,
  projectRefFromPostgres,
  projectRefFromPostgresUrl,
  projectRefFromSupabaseUrl,
} from './guard.ts'

const TEST = 'abcdefghijklmnopqrst'

function env(overrides: Record<string, string | undefined> = {}) {
  return {
    TREFORT_ENV: 'test',
    TREFORT_TEST_SUPABASE_PROJECT_ID: TEST,
    SUPABASE_URL: `https://${TEST}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_URL: `https://${TEST}.supabase.co`,
    POSTGRES_URL: `postgres://postgres.${TEST}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
    POSTGRES_URL_NON_POOLING: `postgres://postgres:pw@db.${TEST}.supabase.co:5432/postgres`,
    POSTGRES_HOST: `db.${TEST}.supabase.co`,
    POSTGRES_USER: 'postgres',
    ...overrides,
  }
}

test('ref parsing handles API URLs, direct hosts, and pooler users', () => {
  assert.equal(projectRefFromSupabaseUrl(`https://${TEST}.supabase.co`), TEST)
  assert.equal(projectRefFromSupabaseUrl('https://api.example.com'), null)
  assert.equal(projectRefFromPostgres(`db.${TEST}.supabase.co`), TEST)
  assert.equal(projectRefFromPostgres('aws-0-us-east-1.pooler.supabase.com', `postgres.${TEST}`), TEST)
  assert.equal(projectRefFromPostgresUrl(`postgres://postgres.${TEST}:x@aws-0.pooler.supabase.com:6543/postgres`), TEST)
})

test('a fully isolated test environment passes', () => {
  const result = checkTestIsolation(env())
  assert.deepEqual(result.problems, [])
  assert.equal(assertTestIsolation(env()), TEST)
})

test('the marker alone is not sufficient', () => {
  const result = checkTestIsolation({ TREFORT_ENV: 'test' })
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('TREFORT_TEST_SUPABASE_PROJECT_ID')))
})

test('fails closed without TREFORT_ENV=test', () => {
  assert.throws(() => assertTestIsolation(env({ TREFORT_ENV: 'production' })), /TREFORT_ENV/)
})

test('rejects the production project as the test target', () => {
  const prodUrl = `https://${PROD}.supabase.co`
  const result = checkTestIsolation(env({ TREFORT_TEST_SUPABASE_PROJECT_ID: PROD, SUPABASE_URL: prodUrl, NEXT_PUBLIC_SUPABASE_URL: prodUrl }))
  assert.equal(result.ok, false)
  assert.ok(result.problems.some((p) => p.includes('is the production project')))
})

test('rejects any single connection that still points at production', () => {
  for (const [key, value] of [
    ['NEXT_PUBLIC_SUPABASE_URL', `https://${PROD}.supabase.co`],
    ['POSTGRES_URL', `postgres://postgres.${PROD}:pw@aws-0.pooler.supabase.com:6543/postgres`],
    ['POSTGRES_URL_NON_POOLING', `postgres://postgres:pw@db.${PROD}.supabase.co:5432/postgres`],
    ['POSTGRES_HOST', `db.${PROD}.supabase.co`],
  ]) {
    const result = checkTestIsolation(env({ [key]: value }))
    assert.equal(result.ok, false, key)
    assert.ok(result.problems.some((p) => p.startsWith(key)), key)
  }
})

test('rejects connections split across two non-production projects', () => {
  const other = 'zyxwvutsrqponmlkjihg'
  const result = checkTestIsolation(env({ POSTGRES_HOST: `db.${other}.supabase.co` }))
  assert.ok(result.problems.some((p) => p.includes('different project')))
})

test('rejects unresolvable connection strings instead of trusting them', () => {
  const result = checkTestIsolation(env({ POSTGRES_URL: 'postgres://user:pw@db.internal:5432/postgres' }))
  assert.ok(result.problems.some((p) => p.startsWith('POSTGRES_URL ')))
})

test('external delivery safeguards are enforced', () => {
  assert.ok(checkTestIsolation(env({ DROPBOX_SIGN_TEST_MODE: 'false' })).problems.some((p) => p.includes('DROPBOX_SIGN_TEST_MODE')))
  assert.ok(checkTestIsolation(env({ EMAIL_DELIVERY: 'live' })).problems.some((p) => p.includes('EMAIL_ALLOWED_RECIPIENTS')))
  assert.equal(checkTestIsolation(env({ EMAIL_DELIVERY: 'live', EMAIL_ALLOWED_RECIPIENTS: '@example.test' })).ok, true)
  assert.ok(checkTestIsolation(env({ STRIPE_SECRET_KEY: 'sk_live_x' })).problems.some((p) => p.includes('STRIPE')))
  assert.equal(checkTestIsolation(env({ STRIPE_SECRET_KEY: 'sk_test_x' })).ok, true)
})
