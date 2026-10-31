export function qrFilename(text, extension) {
  const safe = [...text.normalize('NFC').replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, '_').replace(/_+/g, '_').replace(/\s+/gu, ' ').trim()]
    .slice(0, 50).join('').replace(/^[. _]+|[. _]+$/g, '')
  return `qr${safe ? `_${safe}` : ''}.${extension}`
}
