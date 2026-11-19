
function strToBuffer(str) {
  const s = String(str == null ? '' : str)
  const bytes = []
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i)
    if (c < 0x80) {
      bytes.push(c)
    } else if (c < 0x800) {
      bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    } else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const c2 = s.charCodeAt(i + 1)
      if (c2 >= 0xdc00 && c2 <= 0xdfff) {
        i++
        const cp = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00)
        bytes.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        )
      } else {
        bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
      }
    } else if (c >= 0xd800 && c <= 0xdfff) {
      bytes.push(0x3f)
    } else {
      bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
    }
  }
  const u8 = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) u8[i] = bytes[i]
  return u8.buffer
}

function bufferToStr(buf) {
  if (!buf) return ''
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let out = ''
  let i = 0
  while (i < u8.length) {
    const b = u8[i++]
    let cp
    if (b < 0x80) {
      cp = b
    } else if ((b & 0xe0) === 0xc0) {
      cp = ((b & 0x1f) << 6) | (u8[i++] & 0x3f)
    } else if ((b & 0xf0) === 0xe0) {
      cp = ((b & 0x0f) << 12) | ((u8[i++] & 0x3f) << 6) | (u8[i++] & 0x3f)
    } else if ((b & 0xf8) === 0xf0) {
      cp =
        ((b & 0x07) << 18) |
        ((u8[i++] & 0x3f) << 12) |
        ((u8[i++] & 0x3f) << 6) |
        (u8[i++] & 0x3f)
      if (cp > 0xffff) {
        cp -= 0x10000
        out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
        continue
      }
    } else {
      cp = 0x3f
    }
    out += String.fromCharCode(cp)
  }
  return out
}

function utf8ToHex(str) {
  const u8 = new Uint8Array(strToBuffer(str))
  let out = ''
  for (let i = 0; i < u8.length; i++) {
    out += (u8[i] < 16 ? '0' : '') + u8[i].toString(16)
  }
  return out.toUpperCase()
}

function hexToUtf8(hex) {
  const s = String(hex || '').replace(/[^0-9a-fA-F]/g, '')
  if (!s || s.length % 2 !== 0) return ''
  const u8 = new Uint8Array(s.length / 2)
  for (let i = 0; i < u8.length; i++) u8[i] = parseInt(s.substr(i * 2, 2), 16)
  return bufferToStr(u8.buffer)
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms)
  })
}

function pad2(n) {
  return (n < 10 ? '0' : '') + n
}

function fmtTime(ts) {
  const d = new Date(ts || Date.now())
  return (
    d.getFullYear() +
    '-' +
    pad2(d.getMonth() + 1) +
    '-' +
    pad2(d.getDate()) +
    ' ' +
    pad2(d.getHours()) +
    ':' +
    pad2(d.getMinutes())
  )
}

function shortName(name, deviceId) {
  const n = (name || '').trim()
  if (n) return n
  const id = String(deviceId || '')
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id || '未命名设备'
}

module.exports = {
  strToBuffer: strToBuffer,
  bufferToStr: bufferToStr,
  utf8ToHex: utf8ToHex,
  hexToUtf8: hexToUtf8,
  sleep: sleep,
  fmtTime: fmtTime,
  shortName: shortName
}
