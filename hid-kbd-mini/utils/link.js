
const ble = require('./ble')
const gbk = require('./gbk')
const store = require('./store')
const proto = require('./protocol')
const util = require('./util')
const cfg = require('./config')
const screen = require('./screen')
const { createEmitter } = require('./event')

const ACK_TIMEOUT = 4000
const AUTH_TIMEOUT = 3500

const WIN_MEMO_KEY = 'kb_win_memo_v5'

const PACK_MEMO_KEY = 'kb_pack_memo_v1'

class Link {
  constructor() {
    this.em = createEmitter()
    this.state = 'idle'
    this.authOk = false
    this.device = null
    this.settings = store.getSettings()

    this.queue = []
    this.pumping = false
    this.pending = null
    this.aborting = false
    this._tid = 0

    this._bulk = null
    this._connectedAt = 0
    this._ackSeq = 0
    this._perChar = 200

    this._win = cfg.TUNE.WINDOW_FALLBACK
    this._cap = null
    this._bindDenied = false
    this._pongWaiter = null
    this._statWaiter = null
    this._autoScanning = false

    this.lineBuf = ''
    this.missed = 0
    this.hbTimer = null

    this.lastError = ''
    this._bindBle()
  }

  on(evt, fn) {
    return this.em.on(evt, fn)
  }

  emit(evt, payload) {
    this.em.emit(evt, payload)
  }

  _bindBle() {
    ble.on('data', (chunk) => this._onChunk(chunk))
    ble.on('disconnect', () => this._drop('设备已断开连接'))
    ble.on('adapter', (s) => {
      if (!s.available) this._drop('手机蓝牙已关闭')
    })

    ble.on('chunk', (c) => {
      this.emit('log', {
        level: 'warn',
        msg: '单包 ' + c.from + 'B 写入失败，自动降到 ' + c.to + 'B（已记住，下次连接沿用）'
      })
      this.emit('chunk', c)
    })
  }

  _setState(next, extra) {
    this.state = next
    this.lastError = (extra && extra.message) || ''
    this.emit(
      'state',
      Object.assign(
        {
          state: next,
          auth: this.authOk,
          device: this.device,
          deviceName: store.displayName(this.device),
          message: ''
        },
        extra || {}
      )
    )
  }

  snapshot() {
    return {
      state: this.state,
      auth: this.authOk,
      device: this.device,
      deviceName: store.displayName(this.device),
      queue: this.queue.length,
      mtu: ble.getMtu(),
      chunk: ble.getChunk(),
      mtuNote: ble.getMtuNote(),
      win: this._win,
      qcap: this._qcap || cfg.TUNE.QUEUE_MAX,
      pack: this._packItems(),
      wtype: ble.snapshot().writeType,
      wms: ble.getWriteStats().avg,
      message: this.lastError
    }
  }

  reloadSettings() {
    this.settings = store.getSettings()
    return this.settings
  }

  _packItems() {

    if (this._packN > 0) return this._packN
    let n = Math.max(cfg.PACK.MIN_ITEMS, Math.min(cfg.PACK.MAX_ITEMS, cfg.PACK.ITEMS))
    const fit = Math.floor((ble.getChunk() || 0) / 11)
    if (fit >= 1 && fit < n) n = fit
    try {
      const pm = Number(wx.getStorageSync(PACK_MEMO_KEY)) || 0
      if (pm > 0 && pm < n) n = Math.max(1, pm)
    } catch (e) {}
    return n
  }

  async connect(device) {
    if (!device || !device.deviceId) throw new Error('缺少设备信息')
    this.reloadSettings()
    this._stopHeartbeat()
    this._clearQueue('重新连接')
    this.device = device
    this.authOk = false
    this._bindDenied = false
    this._cap = null

    this._ackSeq = 0
    this._win = cfg.TUNE.WINDOW_FALLBACK
    this._setState('connecting')

    try {
      await ble.connect(device.deviceId)
    } catch (err) {
      this._setState('error', { message: err.message || '连接失败' })
      throw err
    }

    this._connectedAt = Date.now()
    store.saveDevice(device)
    store.setCurrentDeviceId(device.deviceId)
    store.touchDevice(device.deviceId)
    this._setState('connected')

    await util.sleep(120)
    try {
      await this.authenticate()
    } catch (err) {

      console.warn('[link] auth fail', err.message)
    }
    return this.snapshot()
  }

  async authenticate() {
    const key = String(this.settings.authKey || '').trim()
    if (!key) {
      this.authOk = false
      this._setState('authfail', { message: '未设置鉴权密钥，请到「设置」填写' })
      throw new Error('未设置鉴权密钥')
    }

    this.emit('log', { level: 'info', msg: '发送鉴权包' })
    const ack = await this._send({
      text: proto.CMD.auth(key),
      expect: ['OK', 'FAIL'],
      timeout: AUTH_TIMEOUT,
      retries: 1,
      waitAck: true
    })

    if (ack.type !== 'OK') {
      this.authOk = false
      this._setState('authfail', { message: '非授权设备，无法发送文字' })
      throw new Error('鉴权失败')
    }

    this.authOk = true
    await this._afterAuth()
    return true
  }

  async _afterAuth() {
    await this._bind()
    await this._queryCap()
    await this._probeChunk()

    const snap = ble.snapshot()
    console.log(
      '[KBD] ready mtu=' +
        snap.mtu +
        ' chunk=' +
        ble.getChunk() +
        'B type=' +
        snap.writeType +
        ' stat=' +
        (snap.statChar ? '可读' : '不可用') +
        ' 协商=' +
        snap.mtuNote
    )

    this._setState('authed')
    await this._pushTiming()
    this._startHeartbeat()

    this._send({ text: proto.CMD.ver, expect: ['VER', 'OK'], timeout: 1200, retries: 0 }).catch(
      () => {}
    )
  }

  async _bind() {
    const id = store.getClientId()
    const ack = await this._send({
      text: proto.CMD.bind(id),
      expect: ['BOUND', 'OK', 'FAIL'],
      timeout: 2500,
      retries: 1,
      waitAck: true
    }).catch((err) => {

      this.emit('log', { level: 'warn', msg: 'BIND 未生效：' + err.message })
      return null
    })

    if (ack && ack.type === 'BOUND' && ack.result === 'OTHER') {
      this._bindDenied = true
      this.authOk = false
      const msg = '这台开发板已绑定另一部手机：请给板子断电重启或按一下 RST，再回来连接'
      this._setState('authfail', { message: msg })
      throw new Error(msg)
    }
    return ack
  }

  async _queryCap() {
    const ack = await this._send({
      text: proto.CMD.cap,
      expect: ['CAP', 'OK'],
      timeout: 1500,
      retries: 0
    }).catch(() => null)

    if (!ack || ack.type !== 'CAP') return null

    this._cap = ack

    const q = Number(ack.queue) || 24
    const perPack = Math.max(1, cfg.PACK.ITEMS)
    const capByQueue = Math.floor(q / perPack)

    let w = Math.max(2, Math.min(cfg.TUNE.WINDOW_MAX, capByQueue))

    try {
      const memo = Number(wx.getStorageSync(WIN_MEMO_KEY)) || 0
      if (memo > 0 && memo < w) w = Math.max(2, memo)
    } catch (e) {}
    this._win = w
    this.emit('log', {
      level: 'info',
      msg:
        'CAP 单包上限=' + ack.maxWrite + 'B 队列=' + q + ' 在途=' + this._win + ' 包（每包 ' + perPack + ' 条）'
    })
    return ack
  }

  _fallbackPipe() {

    const MIN_WIN = 2
    if ((this._win || 0) <= MIN_WIN) {
      this._win = MIN_WIN
      return
    }
    this._win = MIN_WIN
    try {
      wx.setStorageSync(WIN_MEMO_KEY, MIN_WIN)
    } catch (e) {}
    this.emit('log', {
      level: 'warn',
      msg: '在途水位退回 ' + MIN_WIN + ' 包（已记住，下次连接直接用保守值）'
    })
  }

  async _probeChunk() {
    let n = ble.getChunk()
    let triedWrite = false
    for (let i = 0; i < 5; i++) {
      if (await this._probeOne(n)) {
        ble.markChunkOk(n)
        this.emit('log', { level: 'info', msg: '实测单包 ' + n + ' B' })
        return n
      }

      if (!triedWrite && ble.snapshot().writeType === 'writeNoResponse') {
        triedWrite = true
        ble.forceWriteType('write')
        this.emit('log', { level: 'warn', msg: '无应答写没送到，改用有应答写重试' })
        continue
      }
      if (n <= 20) break
      n = ble.downgradeChunk()
      this.emit('log', { level: 'warn', msg: '单包降级到 ' + n + ' B' })
    }
    ble.setChunk(20)
    return 20
  }

  async _probeOne(n) {
    const pad = Math.max(0, n - 5)
    const text = 'PING' + new Array(pad + 1).join(' ') + '\n'
    const pong = new Promise((resolve) => {
      this._pongWaiter = resolve
    })
    try {
      await ble.writeText(text, n)
    } catch (e) {
      this._pongWaiter = null
      return false
    }
    const ok = await Promise.race([pong.then(() => true), util.sleep(800).then(() => false)])
    this._pongWaiter = null
    return !!ok
  }

  async _pushTiming() {
    const d = Math.max(0, Math.min(500, Number(this.settings.delay) || 0))
    const g = Math.max(0, Math.min(500, Number(this.settings.gap) || 0))
    try {
      await this._send({ text: proto.CMD.delay(d), expect: ['OK'], timeout: 1200, retries: 0 })
      await this._send({ text: proto.CMD.gap(g), expect: ['OK'], timeout: 1200, retries: 0 })
    } catch (e) {
      this.emit('log', { level: 'warn', msg: '下发速度参数失败：' + e.message })
    }
  }

  applyTiming(delay, gap) {
    this.reloadSettings()
    const d = Math.max(0, Math.min(500, Number(delay) || 0))
    const g = Math.max(0, Math.min(500, Number(gap) || 0))
    return this._send({ text: proto.CMD.delay(d), expect: ['OK'], timeout: 1200, retries: 0 })
      .then(() => this._send({ text: proto.CMD.gap(g), expect: ['OK'], timeout: 1200, retries: 0 }))
  }

  async retestLink() {
    if (this.state !== 'authed' && this.state !== 'connected') {
      throw new Error('请先连接设备')
    }
    if (!this.device || !this.device.deviceId) throw new Error('没有已连接的设备')
    if (this._bulk) throw new Error('正在发送文字，请先终止')

    await ble.negotiateMTU(this.device.deviceId, true)
    const n = await this._probeChunk()

    try {
      wx.removeStorageSync(PACK_MEMO_KEY)
    } catch (e) {}
    const pack = this._packItems()
    this.emit('log', {
      level: 'info',
      msg: '重测完成：可写上限 ' + n + 'B / 每包 ' + pack + ' 条 / MTU ' + ble.getMtu()
    })
    return {
      chunk: n,
      mtu: ble.getMtu(),
      note: ble.getMtuNote(),
      win: this._win,
      qcap: this._qcap || cfg.TUNE.QUEUE_MAX,
      pack: pack
    }
  }

  async autoReconnect(opts) {
    if (this.state === 'authed' || this.state === 'connecting') return false
    const dev = store.getCurrentDevice()
    if (!dev) return false

    if (dev.deviceId) {
      try {
        await this.connect(dev)
        if (this.state === 'authed') return true
      } catch (e) {

        if (this.state === 'error') this._setState('idle')
      }
    }

    if (!dev.name) return false
    return this._scanConnect(dev.name, (opts && opts.scanMs) || 6000)
  }

  _scanConnect(name, ms) {
    if (this._autoScanning) return Promise.resolve(false)
    this._autoScanning = true

    return new Promise((resolve) => {
      let done = false
      let timer = null
      let off = null
      const finish = (ok) => {
        if (done) return
        done = true
        if (timer) clearTimeout(timer)
        try {
          off && off()
        } catch (e) {}
        ble.stopScan().catch(() => {})
        this._autoScanning = false
        resolve(ok)
      }

      const base = (s) => String(s || '').split('#')[0].trim()
      const want = base(name)

      off = ble.onFound(async (d) => {
        if (done || !d) return
        const nm = base(d.name || d.localName)
        if (!nm) return

        const hit = nm === want || nm.indexOf(want) === 0 || want.indexOf(nm) === 0
        if (!hit) return
        finish(true)
        try {
          await this.connect({ deviceId: d.deviceId, name: d.name || nm })
        } catch (e) {}
      })

      timer = setTimeout(() => finish(false), ms)
      ble.startScan().catch(() => finish(false))
    })
  }

  async disconnect() {
    this.abort()
    this._stopHeartbeat()
    await ble.disconnect()
    this.device = null
    this.authOk = false
    this._setState('idle')
  }

  _drop(message) {
    this._stopHeartbeat()
    this._clearQueue(message)
    if (this._bulk) {
      this._bulk.err = new Error(message)
      this._bulk = null
    }
    this.authOk = false

    let msg = message
    if (this._bindDenied) {
      msg = '这台开发板已绑定另一部手机：请给板子断电重启或按一下 RST，再回来连接'
      this._bindDenied = false
    }
    this._setState('offline', { message: msg })

    screen.releaseAll()
    this.emit('notice', { type: 'OFFLINE', message: msg })
  }

  _onChunk(chunk) {
    this.lineBuf += chunk

    if (this.lineBuf.length > 4096) this.lineBuf = ''
    let idx = this.lineBuf.indexOf('\n')
    while (idx >= 0) {
      const line = this.lineBuf.slice(0, idx)
      this.lineBuf = this.lineBuf.slice(idx + 1)
      if (line.trim()) this._onLine(line)
      idx = this.lineBuf.indexOf('\n')
    }
  }

  _onLine(line) {
    const p = proto.parseLine(line)
    this.emit('rx', { raw: line, packet: p })

    if (p.type === 'DONE' && typeof p.seq === 'number') this._ackSeq = p.seq

    if (p.type === 'PONG') {
      this.missed = 0
      this.emit('alive')
      if (this._pongWaiter) {
        const w = this._pongWaiter
        this._pongWaiter = null
        w()
      }

      const hb = this.pending
      if (hb && hb.expect.indexOf('PONG') >= 0) {
        this.pending = null
        clearTimeout(hb.timer)
        hb.resolve(p)
      }
      return
    }

    if (p.type === 'STAT') {
      this._ackSeq = p.seq

      if (this._bulk) this._bulkSeq(p.seq)
      const w = this._statWaiter
      this._statWaiter = null
      if (w) {
        clearTimeout(w.timer)
        w.resolve(p)
      }
      return
    }

    if (this._bulk) {
      const b = this._bulk
      if (p.type === 'DONE' && typeof p.seq === 'number') {
        b.readHits = 0
        this._bulkSeq(p.seq)
        return
      }

      if (proto.ACK_TYPES[p.type] && p.type !== 'PONG') {
        this._bulk.acked++
        this._doneTick(this._bulk)
        if (cfg.DEBUG) console.log('[KBD] DONE ' + this._bulk.acked + '/' + this._bulk.total + ' (' + p.type + ')')
        this._bulkEmit()
        return
      }
      if (p.type === 'ERR' || p.type === 'FAIL') {

        if (/QUEUE_FULL/i.test(line)) {
          b.lost++

          b.penalty = Math.min(Math.floor(b.qcap / 2), (b.penalty || 0) + 8)
          this.emit('log', {
            level: 'warn',
            msg: '固件队列满，1 个字被拒；水位收到 ' + (b.qcap - b.penalty) + ' 条后继续'
          })
          this._bulkEmit()
          return
        }
        b.err = new Error(p.message || '设备返回失败')
        return
      }

      return
    }

    if (this.pending && this.pending.expect.indexOf(p.type) >= 0) {
      const t = this.pending
      this.pending = null
      clearTimeout(t.timer)
      if (p.type === 'FAIL' || p.type === 'ERR') {
        const err = new Error(p.message || '设备返回失败')
        err.noRetry = true
        t.reject(err)
      } else {
        t.resolve(p)
      }
      return
    }

    if (p.type === 'FAIL' || p.type === 'ERR' || p.type === 'UNKNOWN') {
      this.emit('notice', { type: p.type, message: p.message || '设备返回：' + line })
    }
  }

  _send(item) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        text: item.text,
        expect: item.expect || ['DONE', 'OK'],
        timeout: item.timeout || ACK_TIMEOUT,
        retries: item.retries === undefined ? Number(this.settings.retries) || 0 : item.retries,
        waitAck: item.waitAck === undefined ? true : !!item.waitAck,
        resolve: resolve,
        reject: reject
      })
      this._pump()
    })
  }

  async _pump() {
    if (this.pumping) return
    this.pumping = true

    while (this.queue.length) {
      const item = this.queue[0]
      const attempts = Math.max(0, item.retries) + 1
      let ok = false
      let lastErr = null

      for (let a = 0; a < attempts; a++) {
        try {
          const ack = await this._transmit(item)
          item.resolve(ack)
          ok = true
          break
        } catch (err) {
          lastErr = err
          if (err && err.noRetry) break
          if (a < attempts - 1) await util.sleep(60)
        }
      }

      if (!ok) item.reject(lastErr || new Error('发送失败'))
      this.queue.shift()
    }

    this.pumping = false
  }

  _transmit(item) {
    const self = this
    return new Promise(function (resolve, reject) {
      const tid = ++self._tid
      const token = { id: tid, expect: item.expect, timer: null, resolve: resolve, reject: reject }

      if (!item.waitAck) {
        ble.writeText(item.text).then(
          function () {
            resolve({ type: 'NONE' })
          },
          function (err) {
            reject(err)
          }
        )
        return
      }

      token.timer = setTimeout(function () {
        if (self.pending && self.pending.id === tid) {
          self.pending = null
          reject(new Error('等待 DONE 超时（' + item.timeout + 'ms）'))
        }
      }, item.timeout)

      self.pending = token

      ble.writeText(item.text).catch(function (err) {
        if (self.pending && self.pending.id === tid) {
          self.pending = null
          clearTimeout(token.timer)
          reject(err)
        }
      })
    })
  }

  _clearQueue(reason) {
    if (this.pending) {
      clearTimeout(this.pending.timer)
      try {
        this.pending.reject(new Error(reason || '中断'))
      } catch (e) {}
      this.pending = null
    }
    const rest = this.queue.splice(0)
    rest.forEach(function (i) {
      try {
        i.reject(new Error(reason || '中断'))
      } catch (e) {}
    })
  }

  abort() {
    this.aborting = true
    if (this.state === 'authed' || this.state === 'connected') {
      ble.writeText(proto.CMD.stop).catch(() => {})
    }
    this._clearQueue('已终止')
    this.emit('log', { level: 'info', msg: '用户终止发送' })
  }

  get busy() {
    return this.pumping || this.queue.length > 0 || !!this.pending || !!this._bulk
  }

  estimate(text) {
    const s = this.settings || store.getSettings()
    const r = gbk.encode(text || '')
    if (!r.items.length) return { ms: 0, items: 0, unsupported: 0 }

    const perChar = this._perCharMs()

    let ms = 0
    r.items.forEach((it) => {
      ms += it.kind === 'enter' || it.kind === 'tab' ? Math.round(perChar * 0.6) : perChar
    })

    const packN = Math.max(1, this._packN || cfg.PACK.ITEMS)
    const packs = Math.ceil(r.items.length / packN)
    const wAvg = (ble.getWriteStats() || {}).avg || 300
    ms = Math.max(ms, packs * wAvg + 80)
    return { ms: ms, items: r.items.length, unsupported: r.unsupported.length }
  }

  async sendText(text) {
    if (this.state !== 'authed') throw new Error('设备未连接或鉴权未通过')

    if (this._bulk) throw new Error('正在发送文字，请先终止或等待完成')
    this.reloadSettings()

    const result = gbk.encode(text)
    if (!result.items.length) throw new Error('没有可发送的内容')

    this.aborting = false
    ble.resetWriteLog()
    ble.resetWriteStats()

    try {
      if (this._tapChunk) {
        ble.setChunk(this._tapChunk)
      } else {
        const cur = ble.getChunk()
        const steps = (cfg.BLE.CHUNK_STEPS || []).slice().sort((a, b) => a - b)
        let next = cur
        for (let i = 0; i < steps.length; i++) {
          if (steps[i] > cur) { next = steps[i]; break }
        }
        if (next > cur) ble.setChunk(next)
      }
    } catch (e) {}

    screen.hold('send')
    const total = result.items.length

    const win = Math.max(1, Math.min(cfg.TUNE.WINDOW_MAX, this._win || cfg.TUNE.WINDOW_FALLBACK))

    this._perChar = this._perCharMs()

    const fit = Math.floor(ble.getChunk() / 11)
    let packN = Math.max(cfg.PACK.MIN_ITEMS, Math.min(cfg.PACK.MAX_ITEMS, cfg.PACK.ITEMS))
    if (fit >= 1 && fit < packN) packN = fit

    const prevAvg = this._lastWriteAvg || 0
    if (prevAvg > 0) {
      const need = Math.round((prevAvg * 2.4) / Math.max(20, this._perChar))
      let want = Math.max(6, Math.min(cfg.PACK.MAX_ITEMS, need))
      if (fit >= 1 && fit < want) want = fit
      packN = Math.max(1, want)
    }

    try {
      const pm = Number(wx.getStorageSync(PACK_MEMO_KEY)) || 0
      if (pm > 0 && pm < packN) packN = Math.max(1, pm)
    } catch (e) {}
    this._packN = packN

    const qcap = Math.max(
      packN * 2,
      Math.min(cfg.TUNE.QUEUE_MAX, Math.floor(((this._cap && this._cap.queue) || 32) * 0.75))
    )
    this._qcap = qcap
    const cmds = result.items.map((it) => {
      if (it.kind === 'enter') return proto.CMD.key(0, 0x28)
      if (it.kind === 'tab') return proto.CMD.key(0, 0x2b)
      return proto.CMD.code(it.code)
    })

    let base = this._ackSeq
    try {
      const st = await this._queryStat(800)
      if (st && typeof st.seq === 'number') {
        base = st.seq
        this._ackSeq = st.seq
      }
    } catch (e) {

    }

    const t0 = Date.now()
    this._bulk = {
      total: total,
      acked: 0,
      err: null,
      lastEmit: 0,
      base: base,
      seqMode: false,
      qcap: qcap,
      penalty: 0,
      lost: 0,

      sent: 0,
      phLast: 0,
      phAt: 0,
      readHits: 0,
      settleSeq: -1,
      settleAt: 0,
      t0: t0,
      packN: packN,
      win: win,
      packs: 0
    }

    const trace = []
    this._trace = trace
    if (cfg.DEBUG)
      console.log(
        '[KBD] start total=' +
          total +
          ' pack=' +
          packN +
          '条/' +
          packN * 11 +
          'B win=' +
          win +
          '包 mtu=' +
          ble.getMtu() +
          ' type=' +
          ble.snapshot().writeType
    )
    this.emit('batch', {
      phase: 'start',
      total: total,
      done: 0,
      percent: 0,
      unsupported: result.unsupported
    })

    let sent = 0
    let aborted = false
    let packs = 0
    const packLog = []
    this._packLog = packLog

    try {
      while (sent < total) {
        if (this.aborting) {
          aborted = true
          break
        }
        if (this.state !== 'authed') throw new Error('发送中连接断开')
        if (this._bulk.err) throw this._bulk.err

        const n = Math.min(packN, total - sent)

        const qnow = Math.max(n, qcap - (this._bulk.penalty || 0))

        const lost = this._bulk.lost || 0
        const inflight = sent - lost - this._bulk.acked
        const room = qnow - inflight
        if (room < n) {
          await this._waitAckResilient(sent - lost - (qnow - n))
        }

        const packet = cmds.slice(sent, sent + n).join('')

        trace.push({ t: Date.now() - t0, ev: 'w', n: n, b: packet.length })
        await ble.writeText(packet, packet.length)
        packLog.push(packet.length)
        packs++
        sent += n

        if (this._bulk) {
          this._bulk.packs = packs
          this._bulk.sent = sent
        }
      }

      if (aborted) {
        const doneAb = this._bulk ? this._bulk.acked : 0
        this._bulk = null
        screen.release('send')
        this.emit('batch', { phase: 'aborted', total: total, done: doneAb })
        return { total: total, done: doneAb, unsupported: result.unsupported, aborted: true }
      }

      if (this._bulk && this._bulk.acked < this._bulk.total - this._bulk.lost) {
        await this._waitAckResilient(this._bulk.total - this._bulk.lost)
      }
    } catch (err) {

      screen.release('send')
      const doneCount = this._bulk ? this._bulk.acked : 0

      const statDiag = this._bulk
        ? '｜状态回读 ' + (this._bulk.readHits ? this._bulk.readHits + ' 次' : '不可用') +
          '，跳过 ' + (this._bulk.lost || 0) + ' 字'
        : ''
      this._doneStats = this._packDoneStats()
      this._lastWriteAvg = ble.getWriteStats().avg
      const wasAbort = this.aborting || /已终止|已取消/.test(String((err && err.message) || ''))
      this._bulk = null
      if (wasAbort) {
        this.emit('batch', { phase: 'aborted', total: total, done: doneCount })
        return {
          total: total,
          done: doneCount,
          unsupported: result.unsupported,
          aborted: true
        }
      }
      this.emit('batch', {
        phase: 'error',
        total: total,
        done: doneCount,
        percent: 0,
        message: err.message,
        trace: this._summarizeTrace(trace, ble.getWriteStats())
      })
      store.addLog({ text: text, ok: false, count: doneCount })

      try {
        await ble.writeText(proto.CMD.stop)
      } catch (e) {}

      if (/打字中断|回执中断|超时/.test(String((err && err.message) || ''))) this._fallbackPipe()

      if (
        /打字中断|回执中断|超时/.test(String((err && err.message) || '')) &&
        ble.snapshot().writeType === 'writeNoResponse'
      ) {
        ble.forceWriteType('write')
        this.emit('log', {
          level: 'warn',
          msg: '无应答写丢数据，已退回「有应答写」（已记住）'
        })
      }

      if (err && err.sentBytes !== undefined && packN > 1) {
        const next = Math.max(1, packN - 1)
        try {
          wx.setStorageSync(PACK_MEMO_KEY, next)
        } catch (e) {}
        this.emit('log', {
          level: 'warn',
          msg: '一包 ' + packN + ' 条（' + packN * 11 + 'B）写入失败，下次改 ' + next + ' 条/包（已记住）'
        })
      }

      const wl = packLog

      const tail = wl.slice(-6).join('+')
      const diag = wl.length
        ? '｜已发 ' + wl.length + ' 包，末包 ' + wl[wl.length - 1] + 'B' +
          (wl.length > 6 ? '（末 6 包 ' + tail + '）' : '')
        : '｜一包都没发出去'
      const e2 = new Error(String((err && err.message) || err) + diag + statDiag)
      e2.original = err
      e2.doneCount = doneCount
      e2.totalCount = total
      throw e2
    }

    const doneCount = this._bulk ? this._bulk.acked : total
    const lostCount = (this._bulk && this._bulk.lost) || 0
    this._doneStats = this._packDoneStats()
    this._bulk = null
    screen.release('send')

    this._lastWriteAvg = ble.getWriteStats().avg
    const summary = this._summarizeTrace(trace, ble.getWriteStats())
    this.emit('batch', {
      phase: 'done',
      total: total,
      done: doneCount,
      lost: lostCount,
      percent: 100,
      trace: summary
    })
    store.addLog({ text: text, ok: true, count: doneCount })
    return {
      total: total,
      done: doneCount,
      lost: lostCount,
      unsupported: result.unsupported,
      aborted: false
    }
  }

  _summarizeTrace(trace, ws) {
    const wTail = ws && ws.n ? '｜写 均' + ws.avg + ' 最大' + ws.max + 'ms' : ''

    const ds = this._doneStats
    const dTail =
      ds && ds.n > 1 ? '｜回执 均' + ds.avg + ' 最大' + ds.max + 'ms' : ''
    if (!trace || trace.length < 2) return (wTail + dTail).replace(/^\｜/, '')
    let batches = 0
    let lastAck = -1
    let lastW = -1
    let handSum = 0
    let handN = 0
    let handMax = 0
    let cycSum = 0
    let cycN = 0
    let cycMax = 0

    trace.forEach((e) => {
      if (e.ev === 'w') {
        batches++
        if (lastAck >= 0) {
          const d = e.t - lastAck
          handSum += d
          handN++
          if (d > handMax) handMax = d
        }
        if (lastW >= 0) {
          const c = e.t - lastW
          cycSum += c
          cycN++
          if (c > cycMax) cycMax = c
        }
        lastW = e.t
      } else if (e.ev === 'a') {
        lastAck = e.t
      }
    })

    const avg = (s, n) => (n ? Math.round(s / n) : 0)
    return (
      '包' +
      batches +
      '｜交接 均' + avg(handSum, handN) + ' 最大' + handMax + 'ms' +
      '｜周期 均' + avg(cycSum, cycN) + ' 最大' + cycMax + 'ms' +
      wTail +
      dTail
    )
  }

  _packDoneStats() {
    const b = this._bulk
    if (!b || !b.dN) return null
    return { avg: Math.round(b.dSum / b.dN), max: b.dMax || 0, n: b.dN }
  }

  _doneTick(b) {
    if (!b) return
    const nowMs = Date.now()
    if (b.lastDoneAt) {
      const dt = nowMs - b.lastDoneAt

      if (dt > 0 && dt < 5000) {
        b.dSum = (b.dSum || 0) + dt
        b.dN = (b.dN || 0) + 1
        if (dt > (b.dMax || 0)) b.dMax = dt
      }
    }
    b.lastDoneAt = nowMs
  }

  _bulkSeq(seq) {
    const b = this._bulk
    if (!b) return
    b.seqMode = true

    const d = (seq - b.base) & 0xffff

    if (d > 0x8000) {
      b.base = seq
      b.acked = 0
      this.emit('log', { level: 'warn', msg: '固件序号归零（重启/重连），进度重新对齐' })
      return
    }

    const goal = b.total - (b.lost || 0)
    if (d > goal) {
      if (b.acked < goal) {
        b.acked = goal
        this._bulkEmit()
      }
      return
    }
    if (d > b.acked) {

      this._doneTick(b)

      if (d - b.acked > 1) {
        this.emit('log', {
          level: 'warn',
          msg: '丢了 ' + (d - b.acked - 1) + ' 条回执，已按序号补齐'
        })
      }
      b.acked = d
      if (cfg.DEBUG) console.log('[KBD] DONE ' + d + '/' + b.total + ' (seq ' + seq + ')')

      const pack = b.packN || 1
      if (Math.floor(d / pack) > Math.floor((d - 1) / pack) && this._trace) {
        this._trace.push({ t: Date.now() - (b.t0 || Date.now()), ev: 'a', n: pack })
      }
      this._bulkEmit()
    }
  }

  _perCharMs() {
    const s = this.settings || store.getSettings()
    const d = Math.max(4, Number(s.delay) || 0)
    const g = Math.max(0, Number(s.gap) || 0)
    return Math.round(5 * (d * 0.625 + 2) + 12.5 + g * 0.625)
  }

  async _queryStat(timeoutMs) {
    try {
      const r = await ble.readStatus(Math.min(700, timeoutMs || 800))
      if (r && typeof r.seq === 'number') {
        if (cfg.DEBUG) console.log('[KBD] read seq=' + r.seq + ' queued=' + r.queued)

        if (this._bulk) {
          this._bulkSeq(r.seq)
          this._bulk.readHits = (this._bulk.readHits || 0) + 1
        }
        return r
      }
    } catch (e) {

    }
    return this._queryStatNotify(timeoutMs)
  }

  _queryStatNotify(timeoutMs) {
    return new Promise((resolve, reject) => {
      if (this._statWaiter) {
        reject(new Error('上一次 STAT 还没回'))
        return
      }
      const timer = setTimeout(() => {
        this._statWaiter = null
        reject(new Error('STAT 超时'))
      }, timeoutMs || 900)
      this._statWaiter = { resolve, reject, timer }
      ble.writeText('STAT\n').catch((e) => {
        if (this._statWaiter) {
          clearTimeout(this._statWaiter.timer)
          this._statWaiter = null
        }
        reject(e)
      })
    })
  }

  async _waitAck(target) {
    const perChar = this._perChar || 70
    const probeAfter = Math.max(300, Math.round(perChar * 3))

    const noProgressLimit = Number(cfg.TUNE.NO_PROGRESS_MS) || 45000

    const lost0 = this._bulk ? this._bulk.lost || 0 : 0
    let last = this._bulk ? this._bulk.acked : 0
    let lastLost = lost0
    let lastAt = Date.now()
    let progressAt = Date.now()
    let probeGap = probeAfter

    const stallError = (b) =>
      new Error(
        '打字中断：已输入 ' +
          b.acked +
          '/' +
          b.total +
          ' 字（已发 ' +
          (b.sent || 0) +
          '），' +
          ((Date.now() - progressAt) / 1000).toFixed(1) +
          ' 秒无新进展（每包 ' +
          (b.packN || 1) +
          ' 条，在途 ' +
          (b.win || this._win || 0) +
          ' 包' +
          (b.lost ? '，已跳过 ' + b.lost + ' 字' : '') +
          '）'
      )

    for (;;) {
      if (this.aborting) throw new Error('已终止')
      const b = this._bulk
      if (!b) throw new Error('发送已中断')
      if (b.err) throw b.err

      const goal = () =>
        Math.max(0, Math.min(target, b.total - (b.lost || 0)) - ((b.lost || 0) - lost0))
      if (b.acked >= goal()) return
      if (this.state !== 'authed') throw new Error('发送中连接断开')

      if (b.acked > last || (b.lost || 0) > lastLost) {
        last = b.acked
        lastLost = b.lost || 0
        progressAt = Date.now()
      }
      if (Date.now() - progressAt > noProgressLimit) throw stallError(b)

      const quiet = Date.now() - lastAt
      if (quiet >= probeGap) {
        let st = null
        try {
          st = await this._queryStat(600)
        } catch (e) {

        }
        if (st) {

          if (typeof st.seq === 'number') this._bulkSeq(st.seq)
          this._reconcileByStat(b, st)
          if (this._trySettle(b, st)) return
        }

        const idleMs = Date.now() - progressAt
        if (idleMs > 2500) {
          const nowD = Date.now()
          if (nowD - (b.lastDiagAt || 0) > 2800) {
            b.lastDiagAt = nowD
            this.emit('log', {
              level: 'warn',
              msg: '进度静止 ' + (idleMs / 1000).toFixed(1) + 's｜sent=' + (b.sent || 0) +
                ' acked=' + b.acked + ' lost=' + (b.lost || 0) +
                ' seq=' + (st && st.seq) + ' queued=' + (st && st.queued)
            })
          }
          if (nowD - (b.lastKickAt || 0) > 3000) {
            b.lastKickAt = nowD
            ble.writeText(proto.CMD.ping).catch(function () {})
          }
        }
        lastAt = Date.now()
        if (b.acked >= goal()) return
        if (b.acked > last || (b.lost || 0) > lastLost) {
          last = b.acked
          lastLost = b.lost || 0
          progressAt = Date.now()

          probeGap = (b.readHits || 0) > 1 ? 150 : probeAfter
        } else {
          probeGap = Math.min(700, Math.round(probeGap * 1.5))
        }
        continue
      }
      await util.sleep(4)
    }
  }

  _trySettle(b, st) {
    if (!b || !st || typeof st.seq !== 'number') return false
    if ((b.sent || 0) < b.total) return false
    const goal = b.total - (b.lost || 0)
    const gap = goal - b.acked
    if (gap < 1) return false

    if (typeof st.queued === 'number' && st.queued > 0) return false
    const now = Date.now()
    if (b.settleSeq !== st.seq) {
      b.settleSeq = st.seq
      b.settleAt = now
      return false
    }

    const limit = Number(cfg.TUNE.NO_PROGRESS_MS) || 45000
    const need = gap > 2
      ? Math.min(8000, Math.max(3000, Math.round(limit * 0.35)))
      : Math.max(250, (this._perChar || 70) * 3)
    if (now - (b.settleAt || 0) < need) return false
    b.lost = (b.lost || 0) + gap
    this.emit('log', {
      level: 'warn',
      msg: '尾部 ' + gap + ' 字无回执且固件队列已空，按完成收尾（少 ' + gap + ' 字）'
    })
    this._bulkEmit()
    return true
  }

  _reconcileByStat(b, st) {
    if (!b || !st || typeof st.queued !== 'number') return false
    const ph = (b.sent || 0) - (b.lost || 0) - b.acked - st.queued

    b.phLast = ph > 0 ? ph : 0
    return false
  }

  async _waitAckResilient(target) {
    let fails = 0

    let bestAck = this._bulk ? this._bulk.acked : -1
    const t0 = Date.now()
    for (;;) {

      if (Date.now() - t0 > 90000) {
        throw new Error('打字中断：已输入 ' + ((this._bulk && this._bulk.acked) || 0) + ' 字，设备长时间无响应')
      }
      try {
        return await this._waitAck(target)
      } catch (e) {
        const b = this._bulk
        const msg = String((e && e.message) || '')

        if (!b || this.aborting || !/打字中断/.test(msg)) throw e
        const beforeAck = b.acked
        const beforeLost = b.lost || 0
        let st = null
        try {
          st = await this._queryStat(1200)
        } catch (e2) {

        }
        if (st && this._bulk) this._bulkSeq(st.seq)
        if (b.acked >= b.total - (b.lost || 0)) return

        const fixed = this._reconcileByStat(b, st)
        const moved = b.acked > beforeAck || (b.lost || 0) > beforeLost || fixed
        if (b.acked > bestAck) {
          bestAck = b.acked
          fails = 0
        } else if (!moved) {
          fails++
        }
        if (moved || b.acked > bestAck) {

          if (cfg.DEBUG) console.log('[KBD] 自愈：acked=' + b.acked + ' lost=' + b.lost + ' queued=' + (st && st.queued))
          continue
        }

        if (fails >= 1 || Date.now() - t0 > 60000) throw e
      }
    }
  }

  _bulkEmit() {
    if (!this._bulk) return
    const now = Date.now()
    const b = this._bulk

    if (now - b.lastEmit < 250 && b.acked < b.total) return
    b.lastEmit = now

    const goal = Math.max(1, b.total - (b.lost || 0))
    this.emit('batch', {
      phase: 'sending',
      total: b.total,
      done: b.acked,
      lost: b.lost || 0,
      percent: Math.min(100, Math.round((b.acked * 100) / goal))
    })
  }

  async sendKey(mod, usage) {
    if (this.state !== 'authed') throw new Error('设备未就绪')
    if (this._bulk) throw new Error('正在发送文字，请先终止')
    return this._send({
      text: proto.CMD.key(mod, usage),
      expect: ['DONE', 'OK'],

      timeout: 1200,
      retries: 0
    })
  }

  async sendChar(code) {
    if (this.state !== 'authed') throw new Error('设备未就绪')
    if (this._bulk) throw new Error('正在发送文字，请先终止')
    return this._send({
      text: proto.CMD.code(code),
      expect: ['DONE', 'OK'],
      timeout: 1200,
      retries: 0
    })
  }

  _startHeartbeat() {
    this._stopHeartbeat()
    const gap = Math.max(5000, Number(this.settings.heartbeat) || 20000)
    this.hbTimer = setInterval(() => {
      if (this.state !== 'authed') return

      if (this.busy || this._bulk) return
      this._send({ text: proto.CMD.ping, expect: ['PONG', 'OK'], timeout: 1500, retries: 0 })
        .then(() => {
          this.missed = 0
        })
        .catch(() => {
          this.missed++
          if (this.missed >= 2) {
            this._drop('设备无响应，可能已离线')
            ble.disconnect()
          }
        })
    }, gap)
  }

  restartHeartbeat() {
    this.reloadSettings()
    if (this.state === 'authed') this._startHeartbeat()
    else this._stopHeartbeat()
  }

  _stopHeartbeat() {
    if (this.hbTimer) {
      clearInterval(this.hbTimer)
      this.hbTimer = null
    }
    this.missed = 0
  }
}

module.exports = { Link: Link }
