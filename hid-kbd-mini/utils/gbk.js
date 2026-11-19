
const table = require('./gbk-table')
const GBK_TABLE = table.GBK_TABLE

let UNI2SLOT = null

function buildIndex() {
  if (UNI2SLOT) return UNI2SLOT
  const map = new Map()
  const len = GBK_TABLE.length
  for (let i = 0; i < len; i++) {
    const ch = GBK_TABLE[i]
    if (ch === '\u0000') continue

    if (!map.has(ch)) map.set(ch, i)
  }
  UNI2SLOT = map
  return map
}

function slotToCode(i) {
  const lead = 0x81 + Math.floor(i / 190)
  const t = i % 190
  const trail = t < 63 ? t + 0x40 : t + 0x41
  return (lead << 8) | trail
}

function codeToHex(code) {
  return ('0000' + code.toString(16).toUpperCase()).slice(-4)
}

function encode(text) {
  const map = buildIndex()
  const items = []
  const unsupported = []
  const s = String(text == null ? '' : text)

  for (const ch of s) {
    const cp = ch.codePointAt(0)

    if (cp === 0x0a || cp === 0x0d) {
      items.push({ ch: '\n', code: 13, kind: 'enter' })
      continue
    }

    if (cp >= 0x20 && cp < 0x7f) {
      items.push({ ch: ch, code: cp, kind: 'ascii' })
      continue
    }
    if (cp === 0x09) {
      items.push({ ch: '\t', code: 9, kind: 'tab' })
      continue
    }
    const slot = map.get(ch)
    if (slot === undefined) {
      unsupported.push(ch)
      items.push({ ch: ch, code: 63, kind: 'fallback' })
    } else {
      items.push({ ch: ch, code: slotToCode(slot), kind: 'gbk' })
    }
  }
  return { items: items, unsupported: unsupported }
}

function check(text) {
  const r = encode(text)
  return {
    total: r.items.length,
    unsupported: r.unsupported,
    gbkCount: r.items.filter(function (i) { return i.kind === 'gbk' }).length
  }
}

function codeToChar(code) {
  const n = Number(code) || 0
  if (n < 0x80) return String.fromCharCode(n)
  const lead = n >> 8
  const trail = n & 0xff
  if (lead < 0x81 || lead > 0xfe) return ''
  let t
  if (trail >= 0x40 && trail <= 0x7e) t = trail - 0x40
  else if (trail >= 0x80 && trail <= 0xfe) t = trail - 0x41
  else return ''
  const i = (lead - 0x81) * 190 + t
  const ch = GBK_TABLE[i]
  return ch === '\u0000' ? '' : ch
}

module.exports = {
  encode: encode,
  check: check,
  codeToChar: codeToChar,
  codeToHex: codeToHex,
  ready: function () {
    buildIndex()
    return true
  }
}
