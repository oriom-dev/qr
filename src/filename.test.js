import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrFilename } from './filename.js'

test('creates portable, bounded filenames from user input', () => {
  assert.equal(qrFilename('https://jisaku.dev', 'png'), 'qr_https_jisaku.dev.png')
  assert.equal(qrFilename('こんにちは 世界', 'svg'), 'qr_こんにちは 世界.svg')
  assert.equal(qrFilename('<>:"/\\|?*\n\u0000', 'png'), 'qr.png')
  assert.equal(qrFilename(' .hello. ', 'svg'), 'qr_hello.svg')
  assert.equal(qrFilename('😀'.repeat(60), 'png'), `qr_${'😀'.repeat(50)}.png`)
  assert.equal(qrFilename('CON', 'png'), 'qr_CON.png')
})
