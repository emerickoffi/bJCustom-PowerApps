import { test } from 'node:test'
import assert from 'node:assert/strict'
import { IDLE_GLOW_MAX_MS, IDLE_GLOW_MIN_MS, nextIdleGlowDelay, shouldSuppressIdleGlow } from './idle-glow.ts'

test('idle glow delay stays within 30–90 seconds', () => {
  assert.equal(nextIdleGlowDelay(() => 0), IDLE_GLOW_MIN_MS)
  assert.equal(nextIdleGlowDelay(() => 0.999999), IDLE_GLOW_MAX_MS)
  assert.equal(nextIdleGlowDelay(() => 0.5), 60_000)
  assert.equal(nextIdleGlowDelay(() => -1), IDLE_GLOW_MIN_MS)
  assert.equal(nextIdleGlowDelay(() => 5), IDLE_GLOW_MAX_MS)
  for (let i = 0; i < 200; i++) {
    const d = nextIdleGlowDelay()
    assert.ok(d >= IDLE_GLOW_MIN_MS && d <= IDLE_GLOW_MAX_MS)
  }
})

test('any active suppressor skips the glow', () => {
  const idle = { hidden: false, reducedMotion: false, hovered: false, editing: false, overlayOpen: false }
  assert.equal(shouldSuppressIdleGlow(idle), false)
  for (const key of Object.keys(idle) as (keyof typeof idle)[]) {
    assert.equal(shouldSuppressIdleGlow({ ...idle, [key]: true }), true, key)
  }
})
