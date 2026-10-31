const svg = content => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">${content}</svg>`)}`

export const wifiIcons = [
  {
    name: 'スタンダード',
    src: svg('<g fill="none" stroke="#171717" stroke-width="6" stroke-linecap="round"><path d="M7 23a38 38 0 0 1 50 0"/><path d="M16 32a24 24 0 0 1 32 0"/><path d="M25 41a10 10 0 0 1 14 0"/></g><circle cx="32" cy="50" r="4" fill="#171717"/>'),
  },
  {
    name: 'サークル',
    src: svg('<circle cx="32" cy="32" r="30" fill="#171717"/><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"><path d="M12 25a31 31 0 0 1 40 0"/><path d="M19 33a20 20 0 0 1 26 0"/><path d="M26 41a9 9 0 0 1 12 0"/></g><circle cx="32" cy="48" r="3" fill="#fff"/>'),
  },
  {
    name: 'ブロック',
    src: svg('<rect x="2" y="2" width="60" height="60" rx="10" fill="#c7f15b"/><g fill="none" stroke="#171717" stroke-width="5" stroke-linecap="square"><path d="M12 24a31 31 0 0 1 40 0"/><path d="M19 32a20 20 0 0 1 26 0"/><path d="M26 40a9 9 0 0 1 12 0"/></g><rect x="29" y="46" width="6" height="6" fill="#171717"/>'),
  },
]
