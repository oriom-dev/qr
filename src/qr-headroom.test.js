import { test } from 'node:test'
import assert from 'node:assert/strict'
import QRCode from 'qrcode'
import { estimateHeadroom, readability } from './qr-headroom.js'

test('classifies conservative remaining correction capacity', () => {
  assert.equal(readability({ remaining: -1, capacity: 8 }), 0)
  assert.equal(readability({ remaining: 0, capacity: 8 }), 1)
  assert.equal(readability({ remaining: 2, capacity: 8 }), 1)
  assert.equal(readability({ remaining: 4, capacity: 8 }), 2)
  assert.equal(readability({ remaining: 8, capacity: 8 }), 3)
})

// Enumerate encoding-region cells by column pair, independently of their values.
function encodingCells(modules) {
  const cells = []
  let upwards = true
  for (let right = modules.size - 1; right > 0; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < modules.size; step++) {
      const row = upwards ? modules.size - 1 - step : step
      for (const col of [right, right - 1]) {
        if (!modules.isReserved(row, col)) cells.push([row, col])
      }
    }
    upwards = !upwards
  }
  return cells
}

function selected(cells) {
  const keys = new Set(cells.map(([row, col]) => `${row},${col}`))
  return (row, col) => keys.has(`${row},${col}`)
}

test('version 1-H has 26 codewords, 17 parity bytes, and capacity 8', () => {
  const qr = QRCode.create('hello', { version: 1, errorCorrectionLevel: 'H' })
  const cells = encodingCells(qr.modules)
  assert.deepEqual(cells.slice(0, 8), [[20, 20], [20, 19], [19, 20], [19, 19], [18, 20], [18, 19], [17, 20], [17, 19]])
  assert.equal(cells.length, 26 * 8)
  assert.deepEqual(estimateHeadroom(qr, () => false), { remaining: 8, capacity: 8, affected: 0, reserved: 0 })
  assert.deepEqual(estimateHeadroom(qr, selected(cells.slice(0, 8))), { remaining: 7, capacity: 8, affected: 1, reserved: 0 })
  assert.deepEqual(estimateHeadroom(qr, selected([cells[0], cells[8], [0, 0], [0, 1]])), { remaining: 6, capacity: 8, affected: 2, reserved: 2 })
  assert.deepEqual(estimateHeadroom(qr, () => true), { remaining: -18, capacity: 8, affected: 26, reserved: 233 })
})

test('maps every interleaved data and parity codeword to its block', () => {
  // Standard block layouts: [short block count, short data length, long block count, EC length].
  for (const [version, level, shortCount, shortLength, longCount, ecLength] of [
    [5, 'Q', 2, 15, 2, 18],
    [7, 'Q', 2, 14, 4, 18],
    [10, 'H', 6, 15, 2, 28],
  ]) {
    const qr = QRCode.create('hello', { version, errorCorrectionLevel: level })
    const cells = encodingCells(qr.modules)
    const count = shortCount + longCount
    const expectedOwners = []
    for (let n = 0; n < shortLength; n++) {
      for (let block = 0; block < count; block++) expectedOwners.push(block)
    }
    for (let block = shortCount; block < count; block++) expectedOwners.push(block)
    const dataWords = expectedOwners.length
    for (let n = 0; n < ecLength; n++) {
      for (let block = 0; block < count; block++) expectedOwners.push(block)
    }
    assert.equal(dataWords, shortCount * shortLength + longCount * (shortLength + 1))
    assert.ok(cells.length >= expectedOwners.length * 8)

    // Compare every word against an anchor in every block, not just totals.
    for (let word = 0; word < expectedOwners.length; word++) {
      for (let block = 0; block < count; block++) {
        const anchor = block === word ? block + count : block
        const result = estimateHeadroom(qr, selected([cells[word * 8], cells[anchor * 8]]))
        const sameBlock = expectedOwners[word] === block
        assert.equal(result.affected, sameBlock ? 2 : 1, `v${version}-${level} word ${word}, block ${block}`)
        assert.equal(result.remaining, Math.floor(ecLength / 2) - result.affected)
      }
    }
  }
})

test('ignores remainder bits and treats covered white cells as corrupted for every mask', () => {
  for (let maskPattern = 0; maskPattern < 8; maskPattern++) {
    const qr = QRCode.create('hello', { version: 2, errorCorrectionLevel: 'H', maskPattern })
    const cells = encodingCells(qr.modules)
    assert.equal(cells.length, 44 * 8 + 7)
    assert.deepEqual(estimateHeadroom(qr, selected(cells.slice(44 * 8))), { remaining: 14, capacity: 14, affected: 0, reserved: 0 })
    const white = cells.slice(0, 44 * 8).find(([row, col]) => qr.modules.get(row, col) === 0)
    assert.ok(white)
    assert.deepEqual(estimateHeadroom(qr, selected([white])), { remaining: 13, capacity: 14, affected: 1, reserved: 0 })
  }
})
