import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createQr, createQrWithAnalysis } from './qr.js'
import QRCode from 'qrcode'

test('creates compact self-contained SVGs with a four-module quiet zone', () => {
  const square = createQr('https://example.com', { rounded: false })
  const rounded = createQr('https://example.com', { rounded: true, transparent: true })
  assert.match(square, /transform="translate\(4 4\)"/)
  assert.match(square, /fill="white"/)
  assert.doesNotMatch(rounded, /fill="white"/)
  assert.match(rounded, /id="finder"/)
  assert.doesNotMatch(square, /id="finder"/)
})

test('defaults to automatic version and mask with a four-module margin', () => {
  const text = 'hello'
  const expected = QRCode.create(text, { errorCorrectionLevel: 'H' })
  const result = createQrWithAnalysis(text)
  assert.equal(result.version, expected.version)
  assert.equal(result.minimumVersion, expected.version)
  assert.equal(result.maskPattern, expected.maskPattern)
  assert.ok(result.headroom)
  assert.equal(result.svg, createQr(text, { version: undefined, maskPattern: undefined, margin: 4 }))
  assert.match(result.svg, new RegExp(`viewBox="0 0 ${expected.modules.size + 8} ${expected.modules.size + 8}"`))
  assert.match(result.svg, /transform="translate\(4 4\)"/)
})

test('uses selected versions, masks and margins without changing the encoded data', () => {
  const text = '  Exact data: https://example.com/?a=1&b=2  '
  const minimumVersion = QRCode.create(text, { errorCorrectionLevel: 'H' }).version
  for (const version of [minimumVersion, minimumVersion + 1, 40]) {
    for (let maskPattern = 0; maskPattern <= 7; maskPattern++) {
      const expected = QRCode.create(text, { errorCorrectionLevel: 'H', version, maskPattern })
      for (const margin of [0, 4]) {
        const result = createQrWithAnalysis(text, { version, maskPattern, margin, rounded: false })
        assert.equal(result.version, version)
        assert.equal(result.minimumVersion, minimumVersion)
        assert.equal(result.maskPattern, maskPattern)
        const total = expected.modules.size + 2 * margin
        assert.ok(result.svg.includes(`viewBox="0 0 ${total} ${total}" width="${total}" height="${total}"`))
        assert.ok(result.svg.includes(`transform="translate(${margin} ${margin})"`))
        const path = result.svg.match(/<path d="([^"]*)"/)[1]
        const cells = new Set([...path.matchAll(/M(\d+) (\d+)h1v1h-1z/g)].map(([, c, r]) => `${c},${r}`))
        for (let r = 0; r < expected.modules.size; r++) {
          for (let c = 0; c < expected.modules.size; c++) {
            assert.equal(cells.has(`${c},${r}`), expected.modules.get(r, c) === 1)
          }
        }
      }
    }
  }
  assert.notEqual(createQr(text, { rounded: false }), createQr(text.trim(), { rounded: false }))
})

test('validates advanced options and rejects versions too small for the data', () => {
  for (const version of [0, 41, -1, 1.5, NaN, Infinity, null, '1']) {
    assert.throws(() => createQr('hello', { version }), /version/i)
  }
  for (const maskPattern of [-1, 8, 0.5, NaN, Infinity, null, '0']) {
    assert.throws(() => createQr('hello', { maskPattern }), /mask/i)
  }
  for (const margin of [-1, 1, 3, 5, NaN, Infinity, null, '4']) {
    assert.throws(() => createQr('hello', { margin }), /margin/i)
  }
  assert.throws(() => createQr('This text is too long for version 1 at error correction level H', { version: 1 }))
})

test('omits modules under the image for both shapes and preserves transparency', () => {
  const text = 'https://example.com'
  const count = QRCode.create(text, { errorCorrectionLevel: 'H' }).modules.size
  const size = count * 0.2
  const x = Math.max(8, Math.min(count - 8 - size, (count - size) / 2 + 1))
  const y = Math.max(8, Math.min(count - 8 - size, (count - size) / 2 - 1))
  const image = 'data:image/png;base64,aGVsbG8='
  for (const rounded of [false, true]) {
    const svg = createQr(text, { rounded, transparent: true, image, imageX: 1, imageY: -1 })
    const path = svg.match(/<path d="([^"]*)"/)[1]
    const cells = [...path.matchAll(/M(\d+) (\d+(?:\.5)?)/g)]
    assert.ok(cells.length > 0)
    for (const [, col, row] of cells) {
      const c = Number(col), r = Math.floor(Number(row))
      assert.ok(!(c < x + size && c + 1 > x && r < y + size && r + 1 > y))
    }
    assert.doesNotMatch(svg, /fill="white"/)
    assert.ok(svg.includes(image))
  }
})

test('cuts out the actual rectangular image bounds', () => {
  const text = 'https://example.com'
  const modules = QRCode.create(text, { errorCorrectionLevel: 'H' }).modules
  const count = modules.size
  const size = count * 0.2
  const image = 'data:image/png;base64,aGVsbG8='
  for (const aspect of [2, 0.5]) {
    const width = size * Math.min(1, aspect)
    const height = size * Math.min(1, 1 / aspect)
    const x = (count - width) / 2
    const y = (count - height) / 2
    for (const rounded of [false, true]) {
      const svg = createQr(text, { image, imageAspect: aspect, rounded })
      const path = svg.match(/<path d="([^"]*)"/)[1]
      const cells = new Set([...path.matchAll(/M(\d+) (\d+(?:\.5)?)/g)].map(([, c, r]) => `${c},${Math.floor(Number(r))}`))
      for (let r = 8; r < count - 8; r++) {
        for (let c = 8; c < count - 8; c++) {
          const covered = c < x + width && c + 1 > x && r < y + height && r + 1 > y
          assert.equal(cells.has(`${c},${r}`), !covered && modules.get(r, c) === 1)
        }
      }
      assert.ok(svg.includes(`width="${width}" height="${height}"`))
    }
  }
  assert.throws(() => createQr(text, { image, imageAspect: 0 }))
})

test('allows image sizes up to 30 percent', () => {
  const text = 'https://example.com'
  const count = QRCode.create(text, { errorCorrectionLevel: 'H' }).modules.size
  const image = 'data:image/png;base64,aGVsbG8='
  const width = `width="${count * 0.3}"`
  assert.ok(createQr(text, { image, imageSize: 0.3 }).includes(width))
  assert.ok(createQr(text, { image, imageSize: 0.4 }).includes(width))
})

test('embeds only supported image data', () => {
  const image = 'data:image/png;base64,aGVsbG8='
  assert.ok(createQr('hello', { image }).includes(image))
  const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>').toString('base64')
  assert.ok(createQr('hello', { image: svg }).includes(svg))
  assert.throws(() => createQr('hello', { image: 'https://example.com/image.png' }))
  assert.throws(() => createQr(''))
})
