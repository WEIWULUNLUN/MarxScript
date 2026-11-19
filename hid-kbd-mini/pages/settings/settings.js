const store = require('../../utils/store')
const cfg = require('../../utils/config')
const util = require('../../utils/util')
const gbkTable = require('../../utils/gbk-table')

const HELP_TEXT =
  '1. 设备页扫描并连接 MarxScript 键盘，鉴权通过后状态条变绿。\n' +
  '2. 把电脑光标点到要输入的地方（记事本 / HIS 输入框）。\n' +
  '3. 首页输入文字，点「发送到电脑」，按钮上会显示预计耗时。\n' +
  '4. 发送中想停就再点一下（变成红色「终止发送」），板子会立刻停下并松开按键。\n' +
  '5. 出现丢字：把速度滑块往左拨一档，换更稳妥的档位。\n' +
  '6. 小程序切到后台蓝牙会断，请保持前台使用。'

Page({
  data: {
    settings: {
      authKey: '',
      speedId: 'std',
      delay: 22,
      gap: 22,
      heartbeat: 20000,
      retries: 2
    },
    profileNames: cfg.SPEED_PROFILES.map((p) => p.name),
    profileDescs: cfg.SPEED_PROFILES.map((p) => p.desc),
    maxIndex: cfg.SPEED_PROFILES.length - 1,
    sliderIdx: 1,
    authed: false,
    testing: false,
    retesting: false,
    logs: [],
    version: cfg.VERSION,
    build: cfg.BUILD,
    gbkSlots: gbkTable.GBK_SLOTS,
    mtuText: '-',
    chunkText: '-',
    packText: '-',
    packBytes: '-',
    mtuNote: '',
    winText: '-'
  },

  onLoad() {
    const app = getApp()
    this.link = app.link
    this._offs = [
      app.bus.on('link:state', (s) => this.setData({ authed: s.state === 'authed' })),

      app.bus.on('link:chunk', () => this.refresh())
    ]
  },

  onShow() {
    this.refresh()
  },

  onUnload() {
    ;(this._offs || []).forEach((off) => off && off())
    this._offs = []
  },

  refresh() {
    const s = store.getSettings()
    const snap = this.link.snapshot()
    this.setData({
      settings: s,
      sliderIdx: this.indexOfSpeed(s.speedId),
      authed: this.link.state === 'authed',
      logs: this.fmtLogs(),
      mtuText: String(snap.mtu || 23),
      chunkText: String(snap.chunk || 20),
      packText: String(snap.pack || '-'),
      packBytes: String((snap.pack || 0) * 11),
      mtuNote: snap.mtuNote || '',
      winText: String(snap.win || '-'),
      qcapText: String(snap.qcap || '-'),
      wtypeText: snap.wtype === 'writeNoResponse' ? '无应答写' : '有应答写',
      wmsText: snap.wms ? '均' + snap.wms + 'ms' : ''
    })
  },

  indexOfSpeed(id) {
    const ids = cfg.SPEED_PROFILES.map((p) => p.id)
    const i = ids.indexOf(id)
    return i >= 0 ? i : Math.max(0, ids.indexOf('std'))
  },

  fmtLogs() {
    return store.getLogs().slice(0, 5).map((l) => {
      return Object.assign({}, l, { time: util.fmtTime(l.ts).slice(11) })
    })
  },

  onSpeedChanging(e) {
    this.setData({ sliderIdx: Number(e.detail.value) || 0 })
  },

  onSpeedChange(e) {
    const idx = Number(e.detail.value) || 0
    this.setData({ sliderIdx: idx })
    const p = cfg.SPEED_PROFILES[idx]
    if (!p) return
    this.applyParams({ speedId: p.id, delay: p.delay, gap: p.gap }, '已切到「' + p.name + '」')
  },

  applyParams(patch, toast) {
    const next = store.saveSettings(patch)
    this.setData({ settings: next })
    this.link.reloadSettings()
    this.pushTiming(next.delay, next.gap)
    if (toast) wx.showToast({ title: toast, icon: 'none' })
  },

  pushTiming(delay, gap) {
    if (this.link.state !== 'authed') return
    this.link.applyTiming(delay, gap).catch((err) => {
      wx.showToast({ title: '下发失败：' + err.message, icon: 'none' })
    })
  },

  onHeartbeatChange(e) {
    const v = Number(e.detail.value) || 20000
    const next = store.saveSettings({ heartbeat: v })
    this.setData({ settings: next })
    this.link.restartHeartbeat()
  },

  async onTestSend() {
    if (this.link.state !== 'authed') {
      wx.showToast({ title: '设备未就绪', icon: 'none' })
      return
    }
    this.setData({ testing: true })
    try {
      const r = await this.link.sendText('测试Test123，')
      if (r.aborted) {
        wx.showToast({ title: '已终止', icon: 'none' })
      } else {
        wx.showToast({ title: '已发送 ' + r.done + ' 字', icon: 'success' })
      }
      this.setData({ logs: this.fmtLogs() })
    } catch (err) {
      wx.showModal({ title: '发送失败', content: (err && err.message) || '超时', showCancel: false })
    } finally {
      this.setData({ testing: false, logs: this.fmtLogs() })
    }
  },

  async onRetest() {
    if (this.link.state !== 'authed') {
      wx.showToast({ title: '设备未就绪', icon: 'none' })
      return
    }
    this.setData({ retesting: true })
    try {
      const r = await this.link.retestLink()
      this.refresh()
      wx.showModal({
        title: '重测完成',
        content:
          'MTU ' +
          r.mtu +
          '\n可写上限 ' +
          r.chunk +
          'B\n每包 ' +
          (r.pack || this.link._packItems()) +
          ' 条\n队列水位 ' +
          (r.qcap || 48) +
          ' 字' +
          (r.note ? '\n\n' + r.note : ''),
        showCancel: false
      })
    } catch (err) {
      wx.showModal({ title: '重测失败', content: (err && err.message) || '未知错误', showCancel: false })
    } finally {
      this.setData({ retesting: false })
    }
  },

  onClearLogs() {
    wx.removeStorageSync('kb_logs')
    this.setData({ logs: [] })
    wx.showToast({ title: '已清空', icon: 'none' })
  },

  onClearPhrases() {
    wx.showModal({
      title: '清空短语',
      content: '所有自定义短语都会被删除，无法恢复。',
      confirmColor: '#E0454A',
      success: (r) => {
        if (!r.confirm) return
        store.savePhrases([])
        wx.showToast({ title: '已清空', icon: 'none' })
      }
    })
  },

  onClearDevices() {
    wx.showModal({
      title: '清空设备',
      content: '只清除本地绑定记录，不影响已连接的设备。',
      confirmColor: '#E0454A',
      success: (r) => {
        if (!r.confirm) return
        wx.setStorageSync('kb_devices', [])
        wx.setStorageSync('kb_current', '')
        wx.showToast({ title: '已清空', icon: 'none' })
      }
    })
  },

  onClearAll() {
    wx.showModal({
      title: '清除全部数据',
      content: '短语、设备、日志、设置都会被清除，需要重新配置。',
      confirmColor: '#E0454A',
      success: (r) => {
        if (!r.confirm) return
        store.clearAll()
        store.init()
        this.link.reloadSettings()
        this.refresh()
        wx.showToast({ title: '已清除', icon: 'none' })
      }
    })
  },

  showHelp() {
    wx.showModal({ title: '使用说明', content: HELP_TEXT, showCancel: false })
  }
})
