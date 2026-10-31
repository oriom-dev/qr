import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contactPayload, phonePayload, emailPayload } from './contact-payload.js'

test('formats a UTF-8 vCard with escaped text and optional fields', () => {
  assert.equal(contactPayload({
    name: '山田, 太郎;\\\n次の行',
    phone: '+81 (90) 1234-5678',
    email: 'taro+work@example.com',
    organization: '会社;東京\r\n営業部',
    website: 'https://example.com/日本?q=1,2;3',
  }), [
    'BEGIN:VCARD', 'VERSION:3.0',
    'N:山田\\, 太郎\\;\\\\\\n次の行;;;;',
    'FN:山田\\, 太郎\\;\\\\\\n次の行',
    'TEL:+819012345678', 'EMAIL:taro+work@example.com',
    'ORG:会社\\;東京\\n営業部',
    'URL:https://example.com/%E6%97%A5%E6%9C%AC?q=1,2;3',
    'END:VCARD', '',
  ].join('\r\n'))
  assert.equal(contactPayload({ name: 'Alice' }), 'BEGIN:VCARD\r\nVERSION:3.0\r\nN:Alice;;;;\r\nFN:Alice\r\nEND:VCARD\r\n')
  assert.throws(() => contactPayload({ name: '  ' }), /name/i)
})

test('normalizes phone numbers and rejects unsafe or invalid values', () => {
  assert.equal(phonePayload(' +1 (202) 555-0123 '), 'tel:+12025550123')
  assert.equal(phonePayload('03.1234.5678'), 'tel:0312345678')
  assert.equal(phonePayload(' '), '')
  assert.equal(phonePayload(undefined), '')
  for (const phone of ['+', '---', '12+34', '123;ext=5', '123\nTEL:456', '１２３', 123]) {
    assert.throws(() => phonePayload(phone))
    assert.throws(() => contactPayload({ name: 'A', phone }))
  }
})

test('formats mailto with encoded values and normalized body newlines', () => {
  assert.equal(emailPayload({ email: 'taro+work@example.com', subject: '日本 & test', body: '一\n二\r三\r\n四' }),
    'mailto:taro%2Bwork@example.com?subject=%E6%97%A5%E6%9C%AC%20%26%20test&body=%E4%B8%80%0D%0A%E4%BA%8C%0D%0A%E4%B8%89%0D%0A%E5%9B%9B')
  assert.equal(emailPayload({ email: 'a@example.com' }), 'mailto:a@example.com')
  assert.equal(emailPayload({ email: 'a@example.com', body: 'hello' }), 'mailto:a@example.com?body=hello')
  for (const email of ['', 'a@@example.com', 'a@example.com?bcc=x', 'a@example.com\r\nBcc: x', 'a@-example.com', 'a..b@example.com']) {
    assert.throws(() => emailPayload({ email }))
    if (email) assert.throws(() => contactPayload({ name: 'A', email }))
  }
  assert.throws(() => emailPayload({ email: 'a@example.com', subject: 'hi\r\nBcc: victim@example.com' }))
  assert.throws(() => emailPayload({ email: 'a@example.com', body: 'hello\0world' }))
})

test('prevents vCard line injection and rejects unsafe URLs', () => {
  const card = contactPayload({ name: 'A\r\nTEL:999', organization: 'Org\rEMAIL:evil@example.com' })
  assert.ok(card.includes('FN:A\\nTEL:999\r\n'))
  assert.ok(card.includes('ORG:Org\\nEMAIL:evil@example.com\r\n'))
  assert.throws(() => contactPayload({ name: 'A\0B' }))
  for (const website of ['javascript:alert(1)', 'ftp://example.com', 'not a url', 'https://example.com\r\nTEL:999', 'https://example.com\\evil', 'https://example.com\0']) {
    assert.throws(() => contactPayload({ name: 'A', website }))
  }
})
