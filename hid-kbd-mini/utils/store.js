
const cfg = require('./config')

const KEY = {
  DEVICES: 'kb_devices',
  CURRENT: 'kb_current',
  PHRASES: 'kb_phrases',
  SETTINGS: 'kb_settings',
  LOGS: 'kb_logs',
  SEEDED: 'kb_seeded',
  CLIENT: 'kb_client_id',

  CHUNK_MEMO: 'kb_chunk_memo'
}

const DEFAULT_SETTINGS = {
  authKey: 'demo1234',

  speedId: 'std',
  delay: 22,
  gap: 22,
  ackTimeout: 4000,
  heartbeat: 20000,
  retries: 2
}

function read(key, def) {
  try {
    const v = wx.getStorageSync(key)
    if (v === '' || v === undefined || v === null) return def
    return v
  } catch (e) {
    return def
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value)
    return true
  } catch (e) {
    console.error('[store] write fail', key, e)
    return false
  }
}

function getClientId() {
  const id = read(KEY.CLIENT, '')
  if (typeof id === 'string' && /^[0-9a-f]{12,32}$/.test(id)) return id
  let s = ''
  for (let i = 0; i < 16; i++) s += Math.floor(Math.random() * 16).toString(16)
  write(KEY.CLIENT, s)
  return s
}

function normalizeSettings(s) {
  const out = Object.assign({}, DEFAULT_SETTINGS, s || {})
  const prof = (cfg.SPEED_PROFILES || []).filter(function (p) {
    return p.id === out.speedId
  })[0]
  if (typeof out.delay !== 'number') out.delay = prof ? prof.delay : DEFAULT_SETTINGS.delay
  if (typeof out.gap !== 'number') out.gap = prof ? prof.gap : DEFAULT_SETTINGS.gap
  delete out.window
  return out
}

function getSettings() {
  const saved = read(KEY.SETTINGS, {}) || {}
  return normalizeSettings(saved)
}

function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch || {})
  write(KEY.SETTINGS, next)
  return next
}

function getDevices() {
  const list = read(KEY.DEVICES, [])
  return Array.isArray(list) ? list : []
}

function findDevice(deviceId) {
  return getDevices().filter(function (d) {
    return d.deviceId === deviceId
  })[0]
}

function saveDevice(dev) {
  if (!dev || !dev.deviceId) return null
  const list = getDevices()
  const i = list.findIndex(function (d) {
    return d.deviceId === dev.deviceId
  })
  const record = {
    deviceId: dev.deviceId,
    name: dev.name || '',
    remark: dev.remark || (i > -1 ? list[i].remark : ''),
    addedAt: i > -1 ? list[i].addedAt : Date.now(),
    lastUsed: i > -1 ? list[i].lastUsed : 0
  }
  if (i > -1) list[i] = Object.assign({}, list[i], record)
  else list.push(record)
  write(KEY.DEVICES, list)
  return record
}

function renameDevice(deviceId, remark) {
  const list = getDevices()
  list.forEach(function (d) {
    if (d.deviceId === deviceId) d.remark = String(remark || '').trim()
  })
  write(KEY.DEVICES, list)
  return getDevices()
}

function removeDevice(deviceId) {
  write(
    KEY.DEVICES,
    getDevices().filter(function (d) {
      return d.deviceId !== deviceId
    })
  )
  if (getCurrentDeviceId() === deviceId) setCurrentDeviceId('')
  return getDevices()
}

function touchDevice(deviceId) {
  const list = getDevices()
  list.forEach(function (d) {
    if (d.deviceId === deviceId) d.lastUsed = Date.now()
  })
  write(KEY.DEVICES, list)
}

function getCurrentDeviceId() {
  return read(KEY.CURRENT, '')
}

function setCurrentDeviceId(deviceId) {
  write(KEY.CURRENT, deviceId || '')
}

function getCurrentDevice() {
  const id = getCurrentDeviceId()
  if (!id) return null
  return findDevice(id) || { deviceId: id, name: '', remark: '' }
}

function displayName(dev) {
  if (!dev) return '未选择设备'
  if (dev.remark) return dev.remark
  if (dev.name) return dev.name
  const id = String(dev.deviceId || '')
  return id.length > 8 ? id.slice(0, 8).toUpperCase() : id || '未命名设备'
}

const SEED_PHRASES = [
  {
    title: '一般情况',
    content: '患者一般情况可，神志清楚，精神尚可，饮食睡眠正常，大小便如常，体重无明显变化。'
  },
  { title: '查体阴性', content: '心肺腹查体未见明显异常，双下肢无水肿，病理征阴性。' },
  { title: '告知复诊', content: '已向患者及家属交代病情及注意事项，如有不适及时复诊。' }
]

function getPhrases() {
  const list = read(KEY.PHRASES, null)
  if (!Array.isArray(list)) return SEED_PHRASES.map(makePhrase)
  return list
}

function makePhrase(p) {
  return {
    id: p.id || 'p' + Date.now() + Math.floor(Math.random() * 1000),
    title: p.title || '',
    content: p.content || ''
  }
}

function savePhrases(list) {
  write(KEY.PHRASES, list)
  return list
}

function addPhrase(title, content) {
  const list = getPhrases()
  if (list.length >= cfg.LIMITS.MAX_PHRASES) {
    throw new Error('短语数量上限 ' + cfg.LIMITS.MAX_PHRASES + ' 条')
  }
  const item = makePhrase({ title: title, content: content })
  list.push(item)
  savePhrases(list)
  return item
}

function updatePhrase(id, patch) {
  const list = getPhrases().map(function (p) {
    return p.id === id ? Object.assign({}, p, patch) : p
  })
  savePhrases(list)
  return list
}

function removePhrase(id) {
  const list = getPhrases().filter(function (p) {
    return p.id !== id
  })
  savePhrases(list)
  return list
}

function movePhrase(id, dir) {
  const list = getPhrases()
  const i = list.findIndex(function (p) {
    return p.id === id
  })
  if (i < 0) return list
  const j = i + (dir > 0 ? 1 : -1)
  if (j < 0 || j >= list.length) return list
  const tmp = list[i]
  list[i] = list[j]
  list[j] = tmp
  savePhrases(list)
  return list
}

function getLogs() {
  const list = read(KEY.LOGS, [])
  return Array.isArray(list) ? list : []
}

function addLog(entry) {
  const list = getLogs()
  list.unshift({
    ts: Date.now(),
    text: String(entry.text || '').slice(0, 200),
    ok: !!entry.ok,
    count: entry.count || 0
  })
  write(KEY.LOGS, list.slice(0, 30))
}

function init() {
  const seeded = read(KEY.SEEDED, false)
  if (!seeded) {
    if (!Array.isArray(read(KEY.PHRASES, null))) savePhrases(SEED_PHRASES.map(makePhrase))
    write(KEY.SEEDED, true)
  }

  saveSettings({})
}

function clearBusiness() {

  write(KEY.PHRASES, [])
  write(KEY.DEVICES, [])
  write(KEY.CURRENT, '')
  write(KEY.LOGS, [])
}

function clearAll() {
  Object.keys(KEY).forEach(function (k) {

    if (k === 'CLIENT') return
    try {
      wx.removeStorageSync(KEY[k])
    } catch (e) {}
  })
}

module.exports = {
  init: init,
  getClientId: getClientId,
  getSettings: getSettings,
  saveSettings: saveSettings,
  DEFAULT_SETTINGS: DEFAULT_SETTINGS,
  getDevices: getDevices,
  findDevice: findDevice,
  saveDevice: saveDevice,
  renameDevice: renameDevice,
  removeDevice: removeDevice,
  touchDevice: touchDevice,
  getCurrentDevice: getCurrentDevice,
  getCurrentDeviceId: getCurrentDeviceId,
  setCurrentDeviceId: setCurrentDeviceId,
  displayName: displayName,
  getPhrases: getPhrases,
  savePhrases: savePhrases,
  addPhrase: addPhrase,
  updatePhrase: updatePhrase,
  removePhrase: removePhrase,
  movePhrase: movePhrase,
  getLogs: getLogs,
  addLog: addLog,
  clearBusiness: clearBusiness,
  clearAll: clearAll
}
