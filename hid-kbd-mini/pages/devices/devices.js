const ble = require('../../utils/ble')
const store = require('../../utils/store')
const cfg = require('../../utils/config')

function isOurs(name) {
  return String(name || '').indexOf(cfg.BLE.NAME_PREFIX) === 0
}

const STATE_TEXT = {
  idle: '未连接',
  connecting: '正在连接…',
  connected: '已连接，鉴权中…',
  authed: '已就绪 · 可以发送',
  authfail: '鉴权失败 · 非授权设备',
  error: '连接异常',
  offline: '连接已断开'
}

Page({
  data: {
    bound: [],
    scan: [],
    scanning: false,
    adapterTip: '',
    connectingId: '',

    currentId: '',
    connectedId: '',
    connected: false,
    authed: false,
    deviceName: '未选择设备',
    stateText: STATE_TEXT.idle,
    autoTip: ''
  },

  onLoad() {
    const app = getApp()
    this.link = app.link
    this._devMap = {}
    this._order = []
    this._flushTimer = null
    this._autoId = ''
    this._autoTried = false
    this._autoDeadline = 0
    this._silentTried = false

    this._offs = [app.bus.on('link:state', (s) => this.applyState(s))]
    this._offFound = ble.onFound((d) => this.handleFound(d))
    this._offAdapter = ble.on('adapter', () => this.refreshAdapterTip())

    this.applyState(this.link.snapshot())
  },

  onShow() {
    this.loadBound()
    this.refreshAdapterTip()
    this.trySilentReconnect()
  },

  onUnload() {
    this.stopScan()
    if (this._offFound) this._offFound()
    if (this._offAdapter) this._offAdapter()
    ;(this._offs || []).forEach((off) => off && off())
    this._offs = []
    if (this._flushTimer) clearTimeout(this._flushTimer)

    ble.stopScan()
  },

  applyState(s) {
    if (!s) return
    const st = s.state || 'idle'
    this.setData({
      stateText: STATE_TEXT[st] || st,
      connectedId: s.device && s.device.deviceId ? s.device.deviceId : '',
      connected: st === 'connected' || st === 'authed' || st === 'authfail',
      authed: st === 'authed',
      deviceName: s.deviceName || store.displayName(this.link.device),
      currentId: store.getCurrentDeviceId()
    })
  },

  loadBound() {
    const list = store.getDevices().map((d) => {
      return Object.assign({}, d, {
        shortId: String(d.deviceId || '').slice(0, 8).toUpperCase()
      })
    })
    list.sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0))
    this.setData({ bound: list, currentId: store.getCurrentDeviceId() })
  },

  async trySilentReconnect() {
    if (this._silentTried) return
    const st = this.link.state
    if (st === 'authed' || st === 'connecting' || st === 'connected') return

    if (st === 'authfail' && /绑定/.test(this.link.lastError || '')) {
      this.setData({ autoTip: this.link.lastError })
      return
    }

    const id = store.getCurrentDeviceId()
    if (!id) return
    const dev = store.findDevice(id)
    if (!dev || !isOurs(dev.name)) return

    this._silentTried = true
    this.setData({ autoTip: '正在自动回连 ' + store.displayName(dev) + '…' })
    const ok = await this.link.autoReconnect()
    if (ok) {
      this.setData({ autoTip: '' })
      this.loadBound()
      return
    }

    const ok2 = await this.reconnectByName(dev)
    this.setData({
      autoTip: ok2 ? '' : '自动回连未成功，点下面「我的设备」里的连接重试'
    })
    if (ok2) this.loadBound()
  },

  async reconnectByName(dev) {
    const name = String((dev && dev.name) || '')
    if (!isOurs(name)) return false

    this.setData({ autoTip: '直连失败，正在按名称搜索 ' + name + '…' })
    let hit = null
    const off = ble.onFound((d) => {
      const n = d.name || d.localName || ''
      if (!hit && n === name) hit = d
    })

    try {
      await ble.startScan()
    } catch (e) {
      off()
      return false
    }

    const deadline = Date.now() + 8000
    while (!hit && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 200))
    }
    await ble.stopScan()
    off()

    if (!hit) {
      this.setData({ autoTip: '没搜到 ' + name + '，请靠近开发板后手动连接' })
      return false
    }

    try {
      await this.link.connect({ deviceId: hit.deviceId, name: hit.name })
      store.saveDevice({ deviceId: hit.deviceId, name: hit.name })
      store.setCurrentDeviceId(hit.deviceId)
      if (this.link.state === 'authed') return true
      if (this.link.state === 'authfail') {
        this.setData({ autoTip: this.link.lastError || '设备拒绝了这台手机' })
      }
      return false
    } catch (e) {
      return false
    }
  },

  async toggleScan() {
    if (this.data.scanning) {
      await this.stopScan()
      return
    }
    this._devMap = {}
    this._order = []

    const cur = store.findDevice(store.getCurrentDeviceId() || '') || null
    this._autoId = store.getCurrentDeviceId() || ''
    this._autoName = (cur && cur.name) || ''
    this._autoTried = false
    this._autoDeadline = Date.now() + 12000

    this.setData({ scan: [], scanning: true, adapterTip: '', autoTip: '' })

    this._boundIds = {}
    store.getDevices().forEach((d) => {
      this._boundIds[d.deviceId] = true
    })
    try {
      await ble.startScan()
    } catch (err) {
      this.setData({ scanning: false })
      this.showScanError(err)
    }
  },

  async stopScan() {
    await ble.stopScan()
    this.setData({ scanning: false })
  },

  showScanError(err) {
    const msg = (err && err.message) || '扫描启动失败'
    this.setData({ adapterTip: msg })
    if (err && err.needBluetooth) return
    if (err && err.needLocation) return
    wx.showModal({
      title: '扫描失败',
      content: msg + '\n\n常见原因：手机蓝牙未开启 / 未授予定位权限 / 小程序未获得蓝牙权限。',
      showCancel: false
    })
  },

  handleFound(d) {
    if (!d || !d.deviceId) return
    const id = d.deviceId
    const name = d.name || d.localName || ''
    const rssi = typeof d.RSSI === 'number' ? d.RSSI : -99
    const prev = this._devMap[id]
    if (!prev) this._order.push(id)

    this._devMap[id] = {
      deviceId: id,
      name: name || (prev && prev.name) || '',
      rssi: rssi,
      bound: !!(this._boundIds && this._boundIds[id]),
      mine: isOurs(name || (prev && prev.name))
    }

    this.maybeAutoConnect(id, this._devMap[id])

    if (this._flushTimer) return
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null
      this.flushScan()
    }, 400)
  },

  maybeAutoConnect(id, dev) {
    if (this._autoTried || this.data.connectingId) return
    const byId = this._autoId && id === this._autoId
    const byName = this._autoName && (dev && dev.name) === this._autoName
    if (!byId && !byName) return
    if (this.link.state === 'authed') return
    if (Date.now() > this._autoDeadline) return
    this._autoTried = true
    this.setData({ autoTip: '发现已绑定设备，正在自动连接…' })
    setTimeout(() => {
      this.doConnect({ deviceId: id, name: (dev && dev.name) || '' })
    }, 300)
  },

  flushScan() {
    if (!this.data.scanning) return
    const all = this._order
      .map((k) => this._devMap[k])
      .filter(Boolean)

      .filter((d) => d.name || d.bound)

    this.setData({ scan: all })
  },

  async doConnect(dev) {
    if (this.data.connectingId) return
    this.setData({ connectingId: dev.deviceId })
    wx.showLoading({ title: '连接中…', mask: true })

    try {

      await this.link.connect(dev)
      this.setData({ scanning: false })
      store.saveDevice(dev)
      wx.hideLoading()

      const st = this.link.state
      if (st === 'authed') {
        wx.showToast({ title: '已连接', icon: 'success' })
      } else if (st === 'authfail') {
        const denied = /绑定/.test(this.link.lastError || '')
        wx.showModal({
          title: denied ? '设备已被占用' : '鉴权未通过',
          content: denied
            ? this.link.lastError
            : '这台设备没有通过密钥校验，无法发送文字。请核对「设置 - 鉴权密钥」与固件是否一致。',
          showCancel: !denied,
          confirmText: denied ? '知道了' : '去设置',
          success: (r) => {
            if (!denied && r.confirm) wx.switchTab({ url: '/pages/settings/settings' })
          }
        })
      }
    } catch (err) {
      wx.hideLoading()
      wx.showModal({
        title: '连接失败',
        content: (err && err.message) || '请靠近设备后重试',
        showCancel: false
      })
    } finally {
      this.setData({ connectingId: '' })
      this.loadBound()
    }
  },

  onConnectBound(e) {
    const i = Number(e.currentTarget.dataset.index)
    const dev = this.data.bound[i]
    if (dev) this.doConnect(dev)
  },

  onConnectScan(e) {
    const i = Number(e.currentTarget.dataset.index)
    const dev = this.data.scan[i]
    if (!dev) return
    this.doConnect({ deviceId: dev.deviceId, name: dev.name })
  },

  onBindOnly(e) {
    const i = Number(e.currentTarget.dataset.index)
    const dev = this.data.scan[i]
    if (!dev) return
    store.saveDevice({ deviceId: dev.deviceId, name: dev.name })
    this.loadBound()
    wx.showToast({ title: '已保存', icon: 'success' })
  },

  onDisconnect() {
    wx.showModal({
      title: '断开连接',
      content: '断开后可随时重新连接。',
      success: async (r) => {
        if (!r.confirm) return
        await this.link.disconnect()
        this.loadBound()
      }
    })
  },

  onRename(e) {
    const i = Number(e.currentTarget.dataset.index)
    const dev = this.data.bound[i]
    if (!dev) return
    wx.showModal({
      title: '给设备起个名字',
      editable: true,
      placeholderText: '例如：医生工作站 1',
      content: dev.remark || dev.name || '',
      success: (r) => {
        if (!r.confirm) return
        store.renameDevice(dev.deviceId, (r.content || '').trim())
        this.loadBound()
        this.applyState(this.link.snapshot())
      }
    })
  },

  onDelete(e) {
    const i = Number(e.currentTarget.dataset.index)
    const dev = this.data.bound[i]
    if (!dev) return
    wx.showModal({
      title: '删除设备',
      content: '只删除本地绑定记录，不影响设备本身。确定删除「' + (dev.remark || dev.name || dev.shortId) + '」？',
      confirmColor: '#E0454A',
      success: (r) => {
        if (!r.confirm) return
        store.removeDevice(dev.deviceId)
        this.loadBound()
        wx.showToast({ title: '已删除', icon: 'none' })
      }
    })
  },

  refreshAdapterTip() {
    if (!wx.getSystemSetting) {
      this.setData({ adapterTip: '' })
      return
    }
    try {
      const s = wx.getSystemSetting()
      if (s.bluetoothEnabled === false) {
        this.setData({ adapterTip: '手机蓝牙未打开' })
      } else if (s.locationEnabled === false) {
        this.setData({ adapterTip: '系统定位服务未打开（安卓扫描需开启）' })
      } else {
        this.setData({ adapterTip: '' })
      }
    } catch (e) {
      this.setData({ adapterTip: '' })
    }
  },

  openBluetoothSetting() {
    if (wx.openSystemBluetoothSetting) {
      wx.openSystemBluetoothSetting({ fail: () => this.fallbackTip('请在手机系统设置中打开蓝牙') })
    } else {
      this.fallbackTip('请在手机系统设置中打开蓝牙')
    }
  },

  openAppSetting() {
    if (wx.openAppAuthorizeSetting) {
      wx.openAppAuthorizeSetting({
        fail: () => this.fallbackTip('请在小程序右上角「…」-「设置」中开启蓝牙/位置权限')
      })
    } else {
      this.fallbackTip('请在小程序右上角「…」-「设置」中开启蓝牙/位置权限')
    }
  },

  fallbackTip(text) {
    wx.showModal({ title: '需要手动设置', content: text, showCancel: false })
  }
})
