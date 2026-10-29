import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeUrlTransform } from './assistant-markdown-url.ts'

test('keeps internal paths and http(s)/mailto links', () => {
  assert.equal(safeUrlTransform('/projects/abc/schedule'), '/projects/abc/schedule')
  assert.equal(safeUrlTransform('https://example.com/a?b=1'), 'https://example.com/a?b=1')
  assert.equal(safeUrlTransform('mailto:office@example.com'), 'mailto:office@example.com')
})

test('drops script, data, and protocol-relative URLs', () => {
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>', 'vbscript:x', '//evil.com', '/\\evil.com', 'ftp://x']) {
    assert.equal(safeUrlTransform(bad), '', bad)
  }
})
