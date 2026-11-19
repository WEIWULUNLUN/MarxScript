
const MOD = { CTRL: 1, SHIFT: 2, ALT: 4, WIN: 8 }

const SPECIAL = [
  { name: '左Ctrl', usage: 0xe0 },
  { name: '左Shift', usage: 0xe1 },
  { name: '左Alt', usage: 0xe2 },
  { name: '左Win', usage: 0xe3 },
  { name: '右Ctrl', usage: 0xe4 },
  { name: '右Shift', usage: 0xe5 },
  { name: '右Alt', usage: 0xe6 },
  { name: '右Win', usage: 0xe7 },
  { name: 'Enter', usage: 0x28 },
  { name: 'Esc', usage: 0x29 },
  { name: 'Backspace', usage: 0x2a },
  { name: 'Tab', usage: 0x2b },
  { name: 'Space', usage: 0x2c },
  { name: 'CapsLock', usage: 0x39 },
  { name: 'Insert', usage: 0x49 },
  { name: 'Home', usage: 0x4a },
  { name: 'PageUp', usage: 0x4b },
  { name: 'Delete', usage: 0x4c },
  { name: 'End', usage: 0x4d },
  { name: 'PageDown', usage: 0x4e },
  { name: '→', usage: 0x4f },
  { name: '←', usage: 0x50 },
  { name: '↓', usage: 0x51 },
  { name: '↑', usage: 0x52 },
  { name: 'F1', usage: 0x3a },
  { name: 'F2', usage: 0x3b },
  { name: 'F3', usage: 0x3c },
  { name: 'F4', usage: 0x3d },
  { name: 'F5', usage: 0x3e },
  { name: 'F6', usage: 0x3f },
  { name: 'F7', usage: 0x40 },
  { name: 'F8', usage: 0x41 },
  { name: 'F9', usage: 0x42 },
  { name: 'F10', usage: 0x43 },
  { name: 'F11', usage: 0x44 },
  { name: 'F12', usage: 0x45 }
]

const PUNCT_USAGE = {
  '`': 0x35,
  '-': 0x2d,
  '=': 0x2e,
  '[': 0x2f,
  ']': 0x30,
  '\\': 0x31,
  ';': 0x33,
  "'": 0x34,
  ',': 0x36,
  '.': 0x37,
  '/': 0x38,
  ' ': 0x2c
}

function charUsage(ch) {
  if (!ch) return 0
  const c = ch.length === 1 ? ch : ch[0]
  const code = c.toUpperCase().charCodeAt(0)
  if (code >= 65 && code <= 90) return 0x04 + (code - 65)
  if (c >= '1' && c <= '9') return 0x1e + (Number(c) - 1)
  if (c === '0') return 0x27
  if (PUNCT_USAGE[c] !== undefined) return PUNCT_USAGE[c]
  return 0
}

function modText(mod) {
  const parts = []
  if (mod & MOD.CTRL) parts.push('Ctrl')
  if (mod & MOD.SHIFT) parts.push('Shift')
  if (mod & MOD.ALT) parts.push('Alt')
  if (mod & MOD.WIN) parts.push('Win')
  return parts.length ? parts.join('+') : ''
}

function usageName(usage) {
  const hit = SPECIAL.filter((k) => k.usage === usage)[0]
  if (hit) return hit.name
  for (let i = 0; i < 26; i++) {
    if (0x04 + i === usage) return String.fromCharCode(65 + i)
  }
  if (usage === 0x27) return '0'
  if (usage >= 0x1e && usage <= 0x26) return String(usage - 0x1e + 1)
  return '0x' + Number(usage).toString(16).toUpperCase()
}

module.exports = {
  MOD,
  SPECIAL,
  charUsage,
  modText,
  usageName
}
