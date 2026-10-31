import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeHex } from './color.js'

test('normalizes three- and six-digit hex colors', () => {
  assert.equal(normalizeHex('#aBc'), '#AABBCC')
  assert.equal(normalizeHex('abc'), '#AABBCC')
  assert.equal(normalizeHex('#12aB34'), '#12AB34')
  assert.equal(normalizeHex('12ab34'), '#12AB34')
  for (const invalid of ['', '#12', '#1234', '#12345678', '#ggg', 'red', '##123']) {
    assert.equal(normalizeHex(invalid), null)
  }
})
