
const CMD = {
  auth: function (key) {
    return 'AUTH:' + String(key == null ? '' : key) + '\n'
  },
  delay: function (ms) {
    return 'SET:DELAY:' + (Number(ms) || 0) + '\n'
  },

  gap: function (ms) {
    return 'SET:GAP:' + (Number(ms) || 0) + '\n'
  },

  bind: function (id) {
    return 'BIND:' + String(id == null ? '' : id) + '\n'
  },

  cap: 'CAP\n',
  code: function (dec) {
    return 'CODE:' + (Number(dec) || 0) + '\n'
  },

  key: function (mod, usage) {
    return 'KEY:' + (Number(mod) || 0) + ':' + (Number(usage) || 0) + '\n'
  },

  keyDown: function (mod, usage) {
    return 'KD:' + (Number(mod) || 0) + ':' + (Number(usage) || 0) + '\n'
  },

  keyUp: function (mod, usage) {
    return 'KU:' + (Number(mod) || 0) + ':' + (Number(usage) || 0) + '\n'
  },

  wait: function (ms) {
    return 'W:' + (Number(ms) || 0) + '\n'
  },
  seqBegin: 'SEQ:BEGIN\n',
  seqEnd: 'SEQ:END\n',
  stop: 'STOP\n',
  ping: 'PING\n',
  ver: 'VER\n',
  macroGet: 'MACRO:GET\n',
  macroSet: function (index, type, hex) {
    return 'MACRO:SET:' + index + ':' + type + ':' + hex + '\n'
  },
  macroReset: 'MACRO:RESET\n'
}

const ACK_TYPES = { DONE: 1, OK: 1, PONG: 1, STOPPED: 1 }

function parseLine(raw) {
  const line = String(raw == null ? '' : raw).replace(/[\r\n]/g, '').trim()
  if (!line) return { type: 'EMPTY' }
  const up = line.toUpperCase()

  if (up === 'OK') return { type: 'OK' }
  if (up === 'DONE') return { type: 'DONE' }

  if (up.indexOf('DONE:') === 0) {
    const n = Number(line.slice(5))
    return { type: 'DONE', seq: isNaN(n) ? undefined : n }
  }
  if (up === 'STOPPED') return { type: 'STOPPED' }

  if (up.indexOf('STAT:') === 0) {
    const p = line.split(':')
    return { type: 'STAT', seq: Number(p[1]) || 0, queued: Number(p[2]) || 0 }
  }

  if (up.indexOf('S:') === 0) {
    const p = line.split(':')
    const sq = Number(p[1])
    const qu = Number(p[2])
    if (p.length >= 3 && String(sq) === p[1] && String(qu) === p[2]) {
      return { type: 'STAT', seq: sq, queued: qu }
    }
  }
  if (up === 'FAIL') return { type: 'FAIL' }
  if (up === 'PONG') return { type: 'PONG' }
  if (up.indexOf('ERR:') === 0) return { type: 'ERR', message: line.slice(4) }
  if (up.indexOf('INFO:') === 0) return { type: 'INFO', message: line.slice(5) }
  if (up.indexOf('VER:') === 0) return { type: 'VER', message: line.slice(4) }
  if (up.indexOf('BOUND:') === 0) {
    return { type: 'BOUND', result: line.slice(6).toUpperCase() }
  }
  if (up.indexOf('CAP:') === 0) {
    const p = line.split(':')
    return {
      type: 'CAP',
      maxWrite: Number(p[1]) || 0,
      queue: Number(p[2]) || 0,
      delay: Number(p[3]) || 0,
      gap: Number(p[4]) || 0
    }
  }
  if (up.indexOf('MACRO:') === 0) {
    const parts = line.split(':')
    return {
      type: 'MACRO',
      index: Number(parts[1]),
      macroType: String(parts[2] || 'T').toUpperCase(),
      payload: parts.slice(3).join(':')
    }
  }
  return { type: 'UNKNOWN', message: line }
}

module.exports = { CMD: CMD, parseLine: parseLine, ACK_TYPES: ACK_TYPES }
