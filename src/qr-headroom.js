import ECCode from 'qrcode/lib/core/error-correction-code.js'
import Utils from 'qrcode/lib/core/utils.js'

export function readability(headroom) {
  if (headroom.remaining < 0) return 0
  if (headroom.remaining / headroom.capacity <= 0.25) return 1
  if (headroom.remaining / headroom.capacity <= 0.5) return 2
  return 3
}

/** Estimate worst-case codeword errors; reserved overlaps are reported separately. */
export function estimateHeadroom(qr, covered) {
  const { modules, version, errorCorrectionLevel } = qr
  const total = Utils.getSymbolTotalCodewords(version)
  const blocks = ECCode.getBlocksCount(version, errorCorrectionLevel)
  const ecTotal = ECCode.getTotalCodewordsCount(version, errorCorrectionLevel)
  const ecPerBlock = ecTotal / blocks
  const shortData = Math.floor((total - ecTotal) / blocks)
  const shortBlocks = blocks - total % blocks
  const owners = []

  for (let i = 0; i <= shortData; i++) {
    for (let b = 0; b < blocks; b++) {
      if (i < shortData || b >= shortBlocks) owners.push(b)
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < blocks; b++) owners.push(b)
  }

  const errors = Array.from({ length: blocks }, () => new Set())
  let reserved = 0
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (modules.isReserved(row, col) && covered(row, col)) reserved++
    }
  }

  let bit = 0
  let row = modules.size - 1
  let direction = -1
  for (let col = modules.size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    while (row >= 0 && row < modules.size) {
      for (let offset = 0; offset < 2; offset++) {
        if (modules.isReserved(row, col - offset)) continue
        const word = Math.floor(bit++ / 8)
        if (word < total && covered(row, col - offset)) errors[owners[word]].add(word)
      }
      row += direction
    }
    direction = -direction
    row += direction
  }

  const capacity = Math.floor(ecPerBlock / 2)
  const affected = Math.max(...errors.map(block => block.size))
  return { remaining: capacity - affected, capacity, affected, reserved }
}
