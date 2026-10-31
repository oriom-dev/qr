import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wifiIcons } from './wifi-icons.js'
import { createQr } from './qr.js'

test('Wi-Fi icons are self-contained SVGs that can be embedded in QR codes', () => {
  assert.equal(wifiIcons.length, 3)
  for (const icon of wifiIcons) {
    assert.match(icon.src, /^data:image\/svg\+xml;base64,/)
    assert.match(Buffer.from(icon.src.split(',')[1], 'base64').toString(), /<svg[^>]+viewBox="0 0 64 64"/)
    assert.ok(createQr('WIFI:T:nopass;S:Guest;;', { image: icon.src }).includes(icon.src))
  }
})
