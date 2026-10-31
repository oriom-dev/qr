import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { calendarPayload } from './calendar-payload.js'

const event = { title: 'Meeting', start: '2025-01-15T10:00', end: '2025-01-15T11:30' }

function inTimezone(tz, source) {
  const moduleUrl = new URL('./calendar-payload.js', import.meta.url).href
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `import { calendarPayload } from ${JSON.stringify(moduleUrl)}; ${source}`], {
    encoding: 'utf8', env: { ...process.env, TZ: tz },
  })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout
}

test('formats a complete calendar with escaped text and injected identity', () => {
  const output = inTimezone('UTC', `console.log(JSON.stringify(calendarPayload({
    title: '山田, A;\\\\\\nNext', start: '2025-01-15T10:00', end: '2025-01-15T11:30:45',
    location: 'Room; 1', description: 'One\\r\\nTwo\\rThree', uid: 'event@example.com', now: new Date('2024-01-02T03:04:05Z')
  })))`)
  assert.equal(JSON.parse(output), [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//QR Studio//Calendar Event//EN', 'BEGIN:VEVENT',
    'UID:event@example.com', 'DTSTAMP:20240102T030405Z', 'DTSTART:20250115T100000Z', 'DTEND:20250115T113045Z',
    'SUMMARY:山田\\, A\\;\\\\\\nNext', 'LOCATION:Room\\; 1', 'DESCRIPTION:One\\nTwo\\nThree',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n'))
})

test('uses deterministic defaults and omits empty optional properties', () => {
  const first = calendarPayload(event)
  assert.equal(first, calendarPayload(event))
  assert.match(first, /\r\nUID:[0-9a-f]{32}@qr-studio\r\nDTSTAMP:19700101T000000Z\r\n/)
  assert.doesNotMatch(first, /\r\n(?:LOCATION|DESCRIPTION):/)
  assert.notEqual(first.match(/UID:([^\r]+)/)[1], calendarPayload({ ...event, title: 'Other' }).match(/UID:([^\r]+)/)[1])
})

test('folds UTF-8 lines at 75 octets without splitting escaped sequences', () => {
  const title = 'x'.repeat(66) + ',;\\\n' + '😀日本'.repeat(40)
  const payload = calendarPayload({ ...event, title, description: 'é'.repeat(100), uid: 'u'.repeat(150) })
  for (const line of payload.split('\r\n')) {
    assert.ok(Buffer.byteLength(line) <= 75, `${Buffer.byteLength(line)} bytes`)
    assert.ok(!/(?<!\\)(?:\\\\)*\\$/.test(line), 'escape sequence split across lines')
  }
  const unfolded = payload.replace(/\r\n /g, '')
  assert.ok(unfolded.includes(`SUMMARY:${title.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')}\r\n`))
  assert.ok(unfolded.includes(`DESCRIPTION:${'é'.repeat(100)}\r\n`))
})

test('converts local times with DST and rejects nonexistent times', () => {
  const output = inTimezone('America/New_York', `
    const winter = calendarPayload({ title: 'A', start: '2025-01-15T10:00', end: '2025-01-15T11:00' });
    const summer = calendarPayload({ title: 'A', start: '2025-07-15T10:00', end: '2025-07-15T11:00' });
    let rejected = false;
    try { calendarPayload({ title: 'A', start: '2025-03-09T02:30', end: '2025-03-09T04:00' }) } catch (e) { rejected = e instanceof TypeError }
    console.log(JSON.stringify({ winter, summer, rejected }));
  `)
  const { winter, summer, rejected } = JSON.parse(output)
  assert.match(winter, /DTSTART:20250115T150000Z\r\nDTEND:20250115T160000Z/)
  assert.match(summer, /DTSTART:20250715T140000Z\r\nDTEND:20250715T150000Z/)
  assert.equal(rejected, true)
})

test('rejects invalid inputs and dates', () => {
  for (const changes of [
    { title: '' }, { title: 42 }, { title: 'bad\0text' }, { title: '\ud800' },
    { start: '2025-02-29T10:00' }, { start: '2025-13-01T10:00' }, { start: '2025-01-15T24:00' },
    { start: '2025-01-15T10:00Z' }, { start: '2025-01-15T10:00:00.1' }, { start: 123 },
    { end: '2025-01-15T10:00' }, { end: '2025-01-15T09:00' }, { end: 'invalid' },
    { location: 123 }, { description: '\x01' }, { uid: '' }, { uid: 'a\0b' }, { now: new Date(NaN) }, { now: '2025-01-01' },
  ]) assert.throws(() => calendarPayload({ ...event, ...changes }), TypeError, JSON.stringify(changes))
  assert.throws(() => calendarPayload(), TypeError)
  assert.throws(() => calendarPayload(null), TypeError)
})
