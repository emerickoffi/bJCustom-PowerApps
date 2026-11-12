import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildManifest } from './pwa-manifest.ts'

const root = join(import.meta.dirname, '..')

function pngSize(path: string): { width: number; height: number } {
  const buf = readFileSync(path)
  assert.equal(buf.subarray(1, 4).toString('ascii'), 'PNG', `${path} is not a PNG`)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

test('manifest has the installability fields browsers require', () => {
  const m = buildManifest()
  assert.equal(m.name, 'Trefort Construction Management')
  assert.equal(m.short_name, 'Trefort')
  assert.equal(m.start_url, '/')
  assert.equal(m.display, 'standalone')
  assert.match(m.theme_color, /^#[0-9A-F]{6}$/i)
  assert.match(m.background_color, /^#[0-9A-F]{6}$/i)
})

test('manifest PNG icons exist at their declared sizes, including 192 and 512', () => {
  const m = buildManifest()
  const pngs = m.icons.filter((i) => i.type === 'image/png')
  const sizes = new Set(pngs.map((i) => i.sizes))
  assert.ok(sizes.has('192x192'))
  assert.ok(sizes.has('512x512'))
  assert.ok(pngs.some((i) => i.purpose === 'maskable'))
  for (const icon of pngs) {
    const file = join(root, 'public', icon.src)
    assert.ok(existsSync(file), `${icon.src} is missing`)
    const [w, h] = icon.sizes.split('x').map(Number)
    assert.deepEqual(pngSize(file), { width: w, height: h }, `${icon.src} has the wrong size`)
  }
})

test('an opaque 180px Apple touch icon is provided for iOS home screens', () => {
  const file = join(root, 'app', 'apple-icon.png')
  assert.ok(existsSync(file))
  assert.deepEqual(pngSize(file), { width: 180, height: 180 })
})
