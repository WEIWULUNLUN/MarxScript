
const keysUtil = require('../../utils/keys')
const store = require('../../utils/store')

const MOD = keysUtil.MOD

function row(chars) {
  const out = []
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    out.push({ label: ch, usage: keysUtil.charUsage(ch) })
  }
  return out
}

const FN_ROW = [{ label: 'Esc', usage: 0x29 }]
for (let i = 1; i <= 12; i++) FN_ROW.push({ label: 'F' + i, usage: 0x39 + i })

const EDIT_KEYS = [
  { label: 'Caps', usage: 0x39 },
  { label: 'Tab', usage: 0x2b },
  { label: 'PrtSc', usage: 0x46 },
  { label: 'ScrLk', usage: 0x47 },
  { label: 'Pause', usage: 0x48 },
  { label: 'Ins', usage: 0x49 },
  { label: 'Home', usage: 0x4a },
  { label: 'PgUp', usage: 0x4b },
  { label: 'Del', usage: 0x4c },
  { label: 'End', usage: 0x4d },
  { label: 'PgDn', usage: 0x4e }
]

const SYM_KEYS = row("`-=[]\\;',./")

const PAD_ROWS = [
  [
    { label: 'Num', usage: 0x53 },
    { label: '/', usage: 0x54 },
    { label: '*', usage: 0x55 },
    { label: '-', usage: 0x56 }
  ],
  [
    { label: '7', usage: 0x5f },
    { label: '8', usage: 0x60 },
    { label: '9', usage: 0x61 },
    { label: '+', usage: 0x57 }
  ],
  [
    { label: '4', usage: 0x5c },
    { label: '5', usage: 0x5d },
    { label: '6', usage: 0x5e },
    { label: '⏎', usage: 0x58 }
  ],
  [
    { label: '1', usage: 0x59 },
    { label: '2', usage: 0x5a },
    { label: '3', usage: 0x5b },
    { label: '⌫', usage: 0x2a }
  ],
  [
    { label: '0', usage: 0x62 },
    { label: '.', usage: 0x63 },
    { label: 'Tab', usage: 0x2b },
    { label: '空格', usage: 0x2c }
  ]
]

Page({
  data: {
    authed: false,
    deviceName: '未连接设备',
    fnRow: FN_ROW,
    editKeys: EDIT_KEYS,
    symKeys: SYM_KEYS,
    padRows: PAD_ROWS,
    digitRow: row('1234567890'),
    row1: row('qwertyuiop'),
    row2: row('asdfghjkl'),
    row3: row('zxcvbnm'),
    mods: { ctrl: false, shift: false, alt: false, win: false },
    modText: '',
    busy: false,
    lastSent: ''
  },

  onLoad() {
    const app = getApp()
    this.link = app.link
    this._q = []
    this._running = false
    this._offs = [
      app.bus.on('link:state', (s) =>
        this.setData({
          authed: s.state === 'authed',
          deviceName: s.state === 'authed' ? s.deviceName || '已连接' : '未连接设备'
        })
      )
    ]
    this.setData({
      authed: this.link.state === 'authed',
      deviceName: this.link.state === 'authed' ? store.displayName(this.link.device) : '未连接设备'
    })
  },

  onUnload() {
    if (this._q) this._q.length = 0
    ;(this._offs || []).forEach((off) => off && off())
    this._offs = []
  },

  modValue() {
    const m = this.data.mods
    let v = 0
    if (m.ctrl) v |= MOD.CTRL
    if (m.shift) v |= MOD.SHIFT
    if (m.alt) v |= MOD.ALT
    if (m.win) v |= MOD.WIN
    return v
  },

  refreshModText() {
    const m = this.data.mods
    const parts = []
    if (m.ctrl) parts.push('Ctrl')
    if (m.shift) parts.push('Shift')
    if (m.alt) parts.push('Alt')
    if (m.win) parts.push('Win')
    this.setData({ modText: parts.join('+') })
  },

  onModTap(e) {
    const k = e.currentTarget.dataset.mod
    const mods = Object.assign({}, this.data.mods)
    mods[k] = !mods[k]
    this.setData({ mods: mods }, () => this.refreshModText())
  },

  clearMods() {
    this.setData({ mods: { ctrl: false, shift: false, alt: false, win: false } }, () =>
      this.refreshModText()
    )
  },

  _do(fn, label) {
    if (this.link.state !== 'authed') {
      wx.showToast({ title: '请先连接设备', icon: 'none' })
      return
    }

    const now = Date.now()
    if (this._lastLabel === label && now - this._lastAt < 80) return
    this._lastLabel = label
    this._lastAt = now

    if (this._q.length >= 8) return
    this._q.push({ fn: fn, label: label })

    this.clearMods()
    this._drain()
  },

  async _drain() {
    if (this._running) return
    this._running = true
    this.setData({ busy: true })
    while (this._q.length) {
      const it = this._q.shift()
      this.setData({ lastSent: it.label })
      try {
        await it.fn()
      } catch (err) {
        const msg = String((err && err.message) || '发送失败')
        if (/超时/.test(msg)) {

          console.warn('[keyboard] ack timeout:', it.label, msg)
        } else {
          wx.showToast({ title: msg, icon: 'none' })
          this._q.length = 0
        }
      }
    }
    this._running = false
    this.setData({ busy: false })
  },

  onCharTap(e) {
    const d = e.currentTarget.dataset
    const usage = Number(d.usage)
    const label = String(d.label || '')
    const mod = this.modValue()

    if (!usage) {
      const code = Number(d.code)
      if (!code) {
        wx.showToast({ title: '这个键不支持', icon: 'none' })
        return
      }
      this._do(() => this.link.sendChar(code), label)
      return
    }

    const m = mod | (Number(d.shift) ? MOD.SHIFT : 0)
    const text = (m ? keysUtil.modText(m) + '+' : '') + label
    this._do(() => this.link.sendKey(m, usage), text)
  },

  onKeyTap(e) {
    const usage = Number(e.currentTarget.dataset.usage)
    const label = String(e.currentTarget.dataset.label || '')
    const mod = this.modValue()
    this._do(() => this.link.sendKey(mod, usage), (mod ? keysUtil.modText(mod) + '+' : '') + label)
  },

  onEnter() {
    this._do(() => this.link.sendKey(this.modValue(), 0x28), 'Enter')
  },

  onBackspace() {
    this._do(() => this.link.sendKey(this.modValue(), 0x2a), 'Backspace')
  },

  onEsc() {
    this._do(() => this.link.sendKey(this.modValue(), 0x29), 'Esc')
  },

  onDelete() {
    this._do(() => this.link.sendKey(this.modValue(), 0x4c), 'Delete')
  },

  onSpace() {

    const mod = this.modValue()
    this._do(() => this.link.sendKey(mod, 0x2c), (mod ? keysUtil.modText(mod) + '+' : '') + 'Space')
  },

  onClose() {
    wx.navigateBack({ delta: 1 })
  },

  goDevices() {
    wx.switchTab({ url: '/pages/devices/devices' })
  }
})
