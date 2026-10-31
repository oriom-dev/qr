function optionalString(value, field) {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new TypeError(`${field} must be a string`)
  return value
}

function text(value, field) {
  value = optionalString(value, field)
  if (/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw new TypeError(`${field} contains control characters`)
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')
}

function address(value) {
  value = optionalString(value, 'Email')
  if (/[\x00-\x1f\x7f]/.test(value)) throw new TypeError('Invalid email address')
  value = value.trim()
  if (value && !/^[a-zA-Z0-9!#$&'*+\-/=?^_`{|}~.]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(value)) throw new TypeError('Invalid email address')
  if (value && (value.split('@')[0].startsWith('.') || value.split('@')[0].endsWith('.') || value.includes('..') || value.split('@')[1].split('.').some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)))) throw new TypeError('Invalid email address')
  return value
}

export function phonePayload(phone) {
  phone = optionalString(phone, 'Phone')
  if (!phone.trim()) return ''
  if (!/^\+?[0-9 ()\-.]+$/.test(phone.trim())) throw new TypeError('Invalid phone number')
  const normalized = phone.trim().replace(/[ ()\-.]/g, '')
  if (!/^\+?\d+$/.test(normalized)) throw new TypeError('Invalid phone number')
  return `tel:${normalized}`
}

export function emailPayload({ email, subject, body }) {
  const recipient = address(email)
  if (!recipient) throw new TypeError('Email address is required')
  subject = optionalString(subject, 'Subject')
  body = optionalString(body, 'Body')
  if (/[\x00-\x1f\x7f]/.test(subject)) throw new TypeError('Invalid email subject')
  if (/[\x00-\x09\x0b\x0c\x0e-\x1f\x7f]/.test(body)) throw new TypeError('Invalid email body')
  const params = []
  if (subject) params.push(`subject=${encodeURIComponent(subject)}`)
  if (body) params.push(`body=${encodeURIComponent(body.replace(/\r\n|\r|\n/g, '\r\n'))}`)
  return `mailto:${encodeURIComponent(recipient).replace(/%40/i, '@')}${params.length ? `?${params.join('&')}` : ''}`
}

export function contactPayload({ name, phone, email, organization, website }) {
  name = optionalString(name, 'Name')
  if (!name.trim()) throw new TypeError('Name is required')
  const escapedName = text(name, 'Name')
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${escapedName};;;;`, `FN:${escapedName}`]
  const tel = phonePayload(phone)
  if (tel) lines.push(`TEL:${tel.slice(4)}`)
  const recipient = address(email)
  if (recipient) lines.push(`EMAIL:${text(recipient, 'Email')}`)
  organization = optionalString(organization, 'Organization')
  if (organization.trim()) lines.push(`ORG:${text(organization, 'Organization')}`)
  website = optionalString(website, 'Website')
  if (/[\x00-\x1f\x7f\\]/.test(website)) throw new TypeError('Invalid website URL')
  if (website.trim()) {
    let url
    try { url = new URL(website.trim()) } catch { throw new TypeError('Invalid website URL') }
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new TypeError('Invalid website URL')
    lines.push(`URL:${url.href}`)
  }
  lines.push('END:VCARD')
  return lines.join('\r\n') + '\r\n'
}
