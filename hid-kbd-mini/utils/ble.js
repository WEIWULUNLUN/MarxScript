
const cfg = require('./config')
const util = require('./util')
const { createEmitter } = require('./event')

const em = createEmitter()
const ev = {
  on: em.on,
  emit: em.emit
}

const state = {
  adapterReady: false,
  bound: false,
  scanning: false,
  deviceId: '',
  serviceId: '',
  writeChar: '',
  notifyChar: '',
  statChar: '',
  writeType: 'write',
  connected: false,
  mtu: 23,
  chunk: 20,
  mtuKnown: false,
  mtuNote: '',
  lastWriteAt: 0,

  writeLog: [],

  wStat: { n: 0, sum: 0, max: 0, last: 0 }
}

const WTYPE_MEMO_KEY = 'kb_wtype_memo'

let foundHandlersBound = false
const foundSubs = []

const CHUNK_MEMO_KEY = 'kb_chunk_memo'

function normalizeUuid(u) {
  return String(u || '')
    .replace(/-/g, '')
    .toLowerCase()
}

function sameUuid(a, b) {
  return normalizeUuid(a) === normalizeUuid(b)
}

function pickWriteType(props) {
  const canNoRsp = !!(props && props.writeNoResponse)
  const canRsp = !!(props && props.write)
  let memo = ''
  try {
    memo = String(wx.getStorageSync(WTYPE_MEMO_KEY) || '')
  } catch (e) {}
  if (memo === 'write' && canRsp) return 'write'
  if (memo === 'writeNoResponse' && canNoRsp) return 'writeNoResponse'
  if (cfg.BLE.PREFER_NO_RSP && canNoRsp) return 'writeNoResponse'
  if (canRsp) return 'write'
  return canNoRsp ? 'writeNoResponse' : 'write'
}

function forceWriteType(t) {
  if (!t) return
  if (state.writeType === t) return
  state.writeType = t
  try {
    wx.setStorageSync(WTYPE_MEMO_KEY, t)
  } catch (e) {}
}

function recordWrite(ms) {
  const s = state.wStat
  s.n++
  s.sum += ms
  s.last = ms
  if (ms > s.max) s.max = ms
}

function resetWriteStats() {
  state.wStat = { n: 0, sum: 0, max: 0, last: 0 }
}

function getWriteStats() {
  const s = state.wStat
  return { n: s.n, last: s.last, max: s.max, avg: s.n ? Math.round(s.sum / s.n) : 0 }
}

function call(fn, opts) {
  return new Promise(function (resolve, reject) {
    fn(
      Object.assign({}, opts, {
        success: resolve,
        fail: function (err) {
          reject(err)
        }
      })
    )
  })
}

function friendlyError(err) {
  const code = err && (err.errCode || err.code)
  const map = {
    10000: '蓝牙未初始化，请重试',
    10001: '手机蓝牙未打开，请先打开蓝牙',
    10002: '未找到指定设备',
    10003: '连接失败，请靠近设备重试',
    10004: '未找到指定服务',
    10005: '未找到指定特征值',
    10006: '连接已断开',
    10007: '特征值不支持该操作',
    10008: '系统异常，请重开蓝牙',
    10009: '系统版本过低，不支持 BLE',
    10012: '连接超时，请靠近设备重试',
    10013: '设备 ID 为空'
  }
  const e = new Error(map[code] || (err && (err.errMsg || err.message)) || '蓝牙操作失败')
  e.errCode = code
  e.raw = err
  return e
}

function bindGlobalListeners() {
  if (state.bound) return
  state.bound = true

  wx.onBluetoothAdapterStateChange(function (res) {
    if (!res.available) state.adapterReady = false
    ev.emit('adapter', res)
  })

  wx.onBLEConnectionStateChange(function (res) {
    if (res.deviceId === state.deviceId && !res.connected) {
      state.connected = false
      ev.emit('disconnect', { deviceId: res.deviceId })
    }
  })

  wx.onBLECharacteristicValueChange(function (res) {
    if (state.deviceId && res.deviceId !== state.deviceId) return
    const raw = util.bufferToStr(res.value)

    const head = String(raw || '').replace(/[\u0000\s]+$/, '')
    if (/^S:[0-9]+:[0-9]+/.test(head)) {
      ev.emit('stat', head)
      return
    }
    ev.emit('data', raw)
  })
}

async function openAdapter() {
  if (state.adapterReady) return true
  bindGlobalListeners()
  try {
    await call(wx.openBluetoothAdapter)
    state.adapterReady = true
    return true
  } catch (err) {
    throw friendlyError(err)
  }
}

async function closeAdapter() {
  try {
    await call(wx.closeBluetoothAdapter)
  } catch (e) {}
  state.adapterReady = false

  state.bound = false
}

async function ensureScanPermission() {

  if (!wx.getSystemSetting) return true
  try {
    const s = wx.getSystemSetting()
    if (s.bluetoothEnabled === false) {
      const e = new Error('手机蓝牙未打开，请先打开蓝牙')
      e.needBluetooth = true
      throw e
    }
    if (s.locationEnabled === false && s.locationAuthorized === false) {
      const e = new Error('安卓扫描蓝牙需要开启系统定位权限')
      e.needLocation = true
      throw e
    }
    return true
  } catch (err) {
    throw err
  }
}

function onFound(handler) {
  if (typeof handler !== 'function') return function () {}
  foundSubs.push(handler)
  if (!foundHandlersBound) {
    foundHandlersBound = true
    wx.onBluetoothDeviceFound(function (res) {
      const list = (res && res.devices) || []
      list.forEach(function (d) {
        foundSubs.slice().forEach(function (fn) {
          try {
            fn(d)
          } catch (e) {
            console.error('[ble] found handler error', e)
          }
        })
      })
    })
  }
  return function off() {
    const i = foundSubs.indexOf(handler)
    if (i > -1) foundSubs.splice(i, 1)
  }
}

async function startScan() {
  await openAdapter()
  await ensureScanPermission()
  if (state.scanning) return true
  try {
    await call(wx.startBluetoothDevicesDiscovery, {
      allowDuplicatesKey: true,
      interval: 0,
      powerLevel: 'high'
    })
    state.scanning = true
    return true
  } catch (err) {
    throw friendlyError(err)
  }
}

async function stopScan() {
  if (!state.scanning) return
  try {
    await call(wx.stopBluetoothDevicesDiscovery)
  } catch (e) {}
  state.scanning = false
}

async function resetAdapter() {
  try {
    await call(wx.closeBluetoothAdapter)
  } catch (e) {}
  state.adapterReady = false
  state.scanning = false

  state.bound = false
  await util.sleep(300)
  await openAdapter()
}

async function connect(deviceId) {
  if (!deviceId) throw new Error('设备 ID 为空')
  await openAdapter()

  try {
    await call(wx.closeBLEConnection, { deviceId: deviceId })
  } catch (e) {}

  state.deviceId = deviceId
  state.connected = false

  state.serviceId = ''
  state.writeChar = ''
  state.notifyChar = ''
  state.statChar = ''
  state.statChar = ''
  state.writeType = 'write'

  await stopScan()

  await util.sleep(800)

  let lastErr = null
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt === 1) {

      await stopScan()
      try {
        await call(wx.closeBLEConnection, { deviceId: deviceId })
      } catch (e) {}
      await util.sleep(1200)
    } else if (attempt === 2) {

      await resetAdapter()
      try {
        await call(wx.closeBLEConnection, { deviceId: deviceId })
      } catch (e) {}
      await util.sleep(1600)
    }

    try {
      await call(wx.createBLEConnection, { deviceId: deviceId, timeout: 10000 })
      state.connected = true
      lastErr = null
      break
    } catch (err) {
      lastErr = err
      const code = err && err.errCode

      console.error('[ble] createBLEConnection fail', 'attempt=' + (attempt + 1), code, err && err.errMsg)
      const retryable = code === 10003 || code === 10012 || code === undefined
      if (!retryable) break
    }
  }

  await stopScan()

  if (lastErr) {
    const e = friendlyError(lastErr)
    if (e.errCode === 10003 || e.errCode === 10012) {
      e.message = '连接失败（' + e.errCode + '）：已自动重试 3 次仍未成功，请把手机靠近设备后再试'
    }
    throw e
  }

  try {
    await discover()
  } catch (err) {

    try {
      await call(wx.closeBLEConnection, { deviceId: deviceId })
    } catch (e) {}
    state.connected = false
    throw err
  }

  await negotiateMTU(deviceId)

  return { deviceId: deviceId, serviceId: state.serviceId, mtu: state.mtu, chunk: state.chunk }
}

function chunkOf(mtu) {
  return clampChunk(cfg.BLE.CHUNK_TARGET, mtu)
}

function clampChunk(n, mtu) {
  const MIN = 11
  const m = Number(mtu) || state.mtu || 23
  const capMtu = m - 3
  const capChar = 200 - 8
  let cap = Math.min(cfg.BLE.CHUNK_TARGET, capMtu > 0 ? capMtu : 20, capChar)
  if (cap < MIN) cap = MIN
  let c = Math.floor(Number(n) || MIN)
  if (c > cap) c = cap
  if (c < MIN) c = MIN
  return c
}

function readChunkMemo() {
  try {
    const v = wx.getStorageSync(CHUNK_MEMO_KEY)
    if (v && typeof v === 'object') {
      if (Number(v.c) !== Number(cfg.BLE.CHUNK_TARGET)) return 0
      return Number(v.n) || 0
    }
    return 0
  } catch (e) {
    return 0
  }
}

function writeChunkMemo(n) {
  try {
    wx.setStorageSync(CHUNK_MEMO_KEY, { c: Number(cfg.BLE.CHUNK_TARGET) || 0, n: Number(n) || 0 })
  } catch (e) {}
}

function downgradeChunk() {
  const steps = cfg.BLE.CHUNK_STEPS || [44, 32, 22, 11]
  const cur = getChunk()
  let next = 11
  for (let i = 0; i < steps.length; i++) {
    if (steps[i] < cur) {
      next = steps[i]
      break
    }
  }
  state.chunk = clampChunk(next)
  writeChunkMemo(state.chunk)
  return state.chunk
}

function markChunkOk(n) {
  const v = clampChunk(Number(n) || getChunk())
  state.chunk = v
  writeChunkMemo(v)
  return v
}

function clearChunkMemo() {
  state.chunk = chunkOf(state.mtu)
  writeChunkMemo(0)
  return state.chunk
}

async function negotiateMTU(deviceId, ignoreMemo) {
  state.mtu = 23
  state.chunk = chunkOf(23)
  state.mtuKnown = false
  state.mtuNote = ''

  if (typeof wx.setBLEMTU !== 'function' || typeof wx.getBLEMTU !== 'function') {
    state.mtuNote = '微信版本不支持 MTU 协商'
    return
  }

  const tries = [cfg.BLE.MTU_REQUEST, 128, 100]
  for (let i = 0; i < tries.length; i++) {
    try {
      const r = await call(wx.setBLEMTU, { deviceId: deviceId, mtu: tries[i] })
      const got = r && typeof r.mtu === 'number' ? r.mtu : 0
      if (got >= 23) {
        state.mtu = got
        state.mtuKnown = true
        state.mtuNote = 'setBLEMTU(' + tries[i] + ') → ' + got
        break
      }
    } catch (e) {
      state.mtuNote = 'setBLEMTU(' + tries[i] + ') 失败 ' + ((e && e.errCode) || '')
      await util.sleep(80)
    }
  }

  try {
    const g = await call(wx.getBLEMTU, { deviceId: deviceId, writeType: state.writeType })
    if (g && typeof g.mtu === 'number') {
      state.mtuKnown = true
      if (g.mtu > state.mtu) {
        state.mtu = g.mtu
        state.mtuNote += ' / getBLEMTU → ' + g.mtu
      }
    }
  } catch (e) {

    if (!state.mtuKnown) state.mtuNote += ' / getBLEMTU 不可用，改由实测判定'
  }

  if (state.mtu < 23) state.mtu = 23
  state.chunk = chunkOf(state.mtu)

  const memo = ignoreMemo ? 0 : readChunkMemo()
  if (memo > 0 && memo < state.chunk) {
    state.chunk = clampChunk(memo)
    state.mtuNote += ' / 上次实测 ' + state.chunk + 'B'
  }
}

function setChunk(n) {
  state.chunk = clampChunk(n)
  return state.chunk
}

function getChunk() {
  return state.chunk || cfg.BLE.CHUNK
}

function getMtu() {
  return state.mtu || 23
}

function getMtuNote() {
  return state.mtuNote || ''
}

function isMtuKnown() {
  return !!state.mtuKnown
}

async function discover() {
  const deviceId = state.deviceId
  let services = []
  let lastErr = null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await call(wx.getBLEDeviceServices, { deviceId: deviceId })
      services = res.services || []
      lastErr = null
    } catch (err) {
      lastErr = err
      services = []
    }
    if (services.length > 0) break
    if (attempt < 2) await util.sleep(300 + attempt * 300)
  }

  if (services.length === 0) {
    if (lastErr) throw friendlyError(lastErr)
    throw new Error('未发现任何蓝牙服务（连接不稳定，请靠近设备重试）')
  }

  let target = services.filter(function (s) {
    return sameUuid(s.uuid, cfg.BLE.SERVICE_UUID)
  })[0]

  if (!target) {
    for (let i = 0; i < services.length; i++) {
      const s = services[i]
      if (s.isPrimary === false) continue
      try {
        const cRes = await call(wx.getBLEDeviceCharacteristics, {
          deviceId: deviceId,
          serviceId: s.uuid
        })
        const chars = cRes.characteristics || []
        const w = chars.filter(function (c) {
          return c.properties && (c.properties.write || c.properties.writeNoResponse)
        })[0]
        const n = chars.filter(function (c) {
          return c.properties && (c.properties.notify || c.properties.indicate)
        })[0]
        if (w && n) {
          target = s
          state.writeChar = w.uuid
          state.notifyChar = n.uuid
          state.writeType = pickWriteType(w.properties)
          break
        }
      } catch (e) {}
    }
  }

  if (!target) {
    throw new Error('未找到可用的蓝牙服务，请核对固件 UUID（utils/config.js）')
  }

  state.serviceId = target.uuid

  if (!state.writeChar || !state.notifyChar) {
    let chars = []
    try {
      const cRes = await call(wx.getBLEDeviceCharacteristics, {
        deviceId: deviceId,
        serviceId: target.uuid
      })
      chars = cRes.characteristics || []
    } catch (err) {
      throw friendlyError(err)
    }

    const w =
      chars.filter(function (c) {
        return sameUuid(c.uuid, cfg.BLE.WRITE_UUID)
      })[0] ||
      chars.filter(function (c) {
        return c.properties && (c.properties.write || c.properties.writeNoResponse)
      })[0]

    const n =
      chars.filter(function (c) {
        return sameUuid(c.uuid, cfg.BLE.NOTIFY_UUID)
      })[0] ||
      chars.filter(function (c) {
        return c.properties && (c.properties.notify || c.properties.indicate)
      })[0]

    const r =
      chars.filter(function (c) {
        return sameUuid(c.uuid, cfg.BLE.STAT_UUID) && c.properties && c.properties.read
      })[0] ||
      chars.filter(function (c) {
        return c.properties && c.properties.read && c.uuid !== n.uuid && c.uuid !== w.uuid
      })[0]

    if (!w || !n) throw new Error('未找到写入/通知特征值，请核对固件 UUID')
    state.writeChar = w.uuid
    state.notifyChar = n.uuid
    state.statChar = r ? r.uuid : ''
    state.writeType = pickWriteType(w.properties)
  }

  try {
    await call(wx.notifyBLECharacteristicValueChange, {
      state: true,
      deviceId: deviceId,
      serviceId: state.serviceId,
      characteristicId: state.notifyChar
    })
  } catch (err) {
    throw friendlyError(err)
  }
}

async function writeText(text, size) {
  if (!state.connected) throw new Error('设备未连接')
  if (!state.writeChar) throw new Error('特征值未就绪')

  const buf = util.strToBuffer(text)
  const view = new Uint8Array(buf)
  const fixed = Number(size) > 0
  let step = fixed ? Number(size) : getChunk()
  let offset = 0

  await pace()

  while (offset < view.length) {
    const end = Math.min(offset + step, view.length)
    const slice = view.slice(offset, end)
    const tWrite = Date.now()
    try {
      await call(wx.writeBLECharacteristicValue, {
        deviceId: state.deviceId,
        serviceId: state.serviceId,
        characteristicId: state.writeChar,
        value: slice.buffer,
        writeType: state.writeType
      })

      recordWrite(Date.now() - tWrite)
      state.lastWriteAt = Date.now()
      state.writeLog.push(end - offset)
      if (cfg.DEBUG) console.log('[KBD] W ' + (end - offset) + 'B 累计' + offset + '->' + end)
      offset = end
    } catch (err) {

      state.writeLog.failAt = offset
      if (!fixed) {
        const from = step
        const next = downgradeChunk()
        if (next < from) {
          ev.emit('chunk', { from: from, to: next, message: (err && err.message) || '' })
        }
      }
      const e = friendlyError(err)
      e.sentBytes = offset
      throw e
    }
    if (offset < view.length) await util.sleep(cfg.BLE.CHUNK_GAP)
  }
}

async function pace() {
  const gap = Number(cfg.BLE.CHUNK_GAP) || 0
  if (!gap) return
  const dt = Date.now() - (state.lastWriteAt || 0)
  if (dt < gap) await util.sleep(gap - dt)
}

async function disconnect() {
  if (!state.deviceId) return
  try {
    await call(wx.closeBLEConnection, { deviceId: state.deviceId })
  } catch (e) {}
  state.connected = false
  state.deviceId = ''
  state.serviceId = ''
  state.writeChar = ''
  state.notifyChar = ''
  state.mtu = 23
  state.chunk = chunkOf(23)
}

function snapshot() {
  return {
    adapterReady: state.adapterReady,
    scanning: state.scanning,
    connected: state.connected,
    deviceId: state.deviceId,
    serviceId: state.serviceId,
    writeChar: state.writeChar,
    notifyChar: state.notifyChar,
    statChar: state.statChar,
    writeType: state.writeType,
    mtu: state.mtu,
    chunk: state.chunk,
    mtuNote: state.mtuNote
  }
}

function readStatus(timeoutMs) {
  return new Promise(function (resolve, reject) {
    if (!state.connected) return reject(new Error('设备未连接'))
    if (!state.statChar) return reject(new Error('固件不支持状态回读'))
    let done = false
    let off = function () {}
    let timer = null
    function finish(err, val) {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      off()
      if (err) reject(err)
      else resolve(val)
    }
    timer = setTimeout(function () { finish(new Error('读状态超时')) }, timeoutMs || 800)

    off = ev.on('stat', function (str) {
      const m = /^S:([0-9]+):([0-9]+)/.exec(String(str || ''))
      if (m) finish(null, { seq: Number(m[1]), queued: Number(m[2]) })
    })

    wx.readBLECharacteristicValue({
      deviceId: state.deviceId,
      serviceId: state.serviceId,
      characteristicId: state.statChar,
      success: function (res) {

        if (done || !res || !res.value) return
        let str = ''
        try {
          str = String(util.bufferToStr(res.value)).replace(/[\u0000\s]+$/, '')
        } catch (e) {}
        const m = /^S:(\d+):(\d+)/.exec(str)
        if (m) finish(null, { seq: Number(m[1]), queued: Number(m[2]) })
      },
      fail: function (err) { finish(friendlyError(err)) }
    })
  })
}

module.exports = {
  on: ev.on,
  emit: ev.emit,
  openAdapter: openAdapter,
  closeAdapter: closeAdapter,
  startScan: startScan,
  stopScan: stopScan,
  onFound: onFound,
  connect: connect,
  disconnect: disconnect,
  negotiateMTU: negotiateMTU,
  writeText: writeText,
  readStatus: readStatus,
  getChunk: getChunk,
  setChunk: setChunk,
  downgradeChunk: downgradeChunk,
  markChunkOk: markChunkOk,
  clearChunkMemo: clearChunkMemo,
  getMtu: getMtu,
  getMtuNote: getMtuNote,
  isMtuKnown: isMtuKnown,
  snapshot: snapshot,
  sameUuid: sameUuid,
  resetWriteLog: resetWriteLog,
  getWriteLog: getWriteLog,
  getWriteStats: getWriteStats,
  resetWriteStats: resetWriteStats,
  forceWriteType: forceWriteType
}

function resetWriteLog() {
  state.writeLog = []
}

function getWriteLog() {
  return state.writeLog.slice()
}
