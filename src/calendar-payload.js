function text(value, field, required = false) {
  if (value == null && !required) return ''
  if (typeof value !== 'string' || (required && !value.trim())) throw new TypeError(`${field} must be a nonempty string`)
  if (/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(value) || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value)) throw new TypeError(`Invalid ${field}`)
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function localDate(value, field) {
  if (typeof value !== 'string') throw new TypeError(`Invalid ${field}`)
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) throw new TypeError(`Invalid ${field}`)
  const [, y, m, d, h, min, s = '00'] = match
  const parts = [y, m, d, h, min, s].map(Number)
  if (parts[0] === 0 || parts[1] < 1 || parts[1] > 12 || parts[2] < 1 || parts[2] > 31 || parts[3] > 23 || parts[4] > 59 || parts[5] > 59) throw new TypeError(`Invalid ${field}`)
  const date = new Date(parts[0] < 100 ? parts[0] + 400 : parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5])
  if (parts[0] < 100) date.setFullYear(parts[0])
  if ([date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes(), date.getSeconds()].some((part, i) => part !== parts[i])) throw new TypeError(`Invalid ${field}`)
  return date
}

function utc(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime()) || date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) throw new TypeError('Invalid UTC date')
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function fold(line) {
  const encoder = new TextEncoder()
  let result = ''
  let bytes = 0
  const chars = Array.from(line)
  for (let i = 0; i < chars.length; i++) {
    const token = chars[i] === '\\' && i + 1 < chars.length ? chars[i] + chars[++i] : chars[i]
    const size = encoder.encode(token).length
    if (bytes + size > 75) {
      result += '\r\n '
      bytes = 1
    }
    result += token
    bytes += size
  }
  return result
}

// Stable across calls without depending on a clock, random source, or network.
function eventUid(event) {
  let hash = 0x6c62272e07bb014262b821756295c58dn
  for (const byte of new TextEncoder().encode(JSON.stringify(event))) {
    hash = BigInt.asUintN(128, (hash ^ BigInt(byte)) * 0x1000000000000000000013bn)
  }
  return `${hash.toString(16).padStart(32, '0')}@qr-studio`
}

export function calendarPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Event must be an object')
  const { title, start, end, location, description, now, uid } = input
  const summary = text(title, 'Title', true)
  const place = text(location, 'Location')
  const details = text(description, 'Description')
  const startDate = localDate(start, 'start')
  const endDate = localDate(end, 'end')
  if (endDate <= startDate) throw new TypeError('End must be after start')
  const startUtc = utc(startDate)
  const endUtc = utc(endDate)
  const identifier = uid === undefined ? eventUid([summary, startUtc, endUtc, place, details]) : text(uid, 'UID', true)
  const stamp = utc(now === undefined ? new Date(0) : now)
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QR Studio//Calendar Event//EN',
    'BEGIN:VEVENT', `UID:${identifier}`, `DTSTAMP:${stamp}`, `DTSTART:${startUtc}`, `DTEND:${endUtc}`, `SUMMARY:${summary}`,
  ]
  if (place) lines.push(`LOCATION:${place}`)
  if (details) lines.push(`DESCRIPTION:${details}`)
  lines.push('END:VEVENT', 'END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
