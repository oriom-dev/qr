export function normalizeHex(value) {
  if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return null
  const hex = value.replace(/^#/, '').toUpperCase()
  return `#${hex.length === 3 ? [...hex].map(char => char + char).join('') : hex}`
}
