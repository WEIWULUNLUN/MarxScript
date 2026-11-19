const store = require('../../utils/store')
const gbk = require('../../utils/gbk')
const cfg = require('../../utils/config')
const screen = require('../../utils/screen')

const STATE_TEXT = {
  idle: '未连接设备',
  connecting: '正在连接…',
  connected: '已连接，正在鉴权…',
  authed: '已就绪 · 可以发送',
  authfail: '鉴权失败，无法发送',
  error: '连接异常',
  offline: '连接已断开'
}

Page({
  data: {

    state: 'idle',
    stateText: STATE_TEXT.idle,
    connected: false,
    authed: false,
    deviceName: '未选择设备',

    text: '',
    len: 0,
    maxLen: cfg.LIMITS.MAX_TEXT,
    unsupported: 0,
    hintText: '本地 GBK 转码 · 不联网',

    sending: false,
    done: 0,
    total: 0,
    percent: 0,
    canSend: false,
    estimateMs: 0,
    estimateText: '0.0S',
    remainText: '0.0S',
    speedName: '标准',
    traceText: '',

    phrases: [],
    bannerId: cfg.AD.BANNER
  },

  onLoad() {
    const app = getApp()
    this.link = app.link
    this._offs = []

    this._offs.push(
      app.bus.on('link:state', (s) => this.applyState(s)),
      app.bus.on('link:batch', (b) => this.applyBatch(b)),
      app.bus.on('link:notice', (n) => this.onNotice(n))
    )

    this.applyState(this.link.snapshot())
    this.refreshLocal()
  },

  onShow() {
    this.refreshLocal()
    this.applyState(this.link.snapshot())
    this.recalcEstimate()

    const app = getApp()
    const pending = app.globalData.pendingText
    if (pending) {
      const append = app.globalData.pendingAppend
      app.globalData.pendingText = ''
      app.globalData.pendingAppend = false
      this.setData({ text: append ? (this.data.text || '') + pending : pending })
      this.recheck()
    }
  },

  onUnload() {
    ;(this._offs || []).forEach((off) => off && off())
    this._offs = []
    this.stopCountdown()
    if (this._hintTimer) clearTimeout(this._hintTimer)

    screen.releaseAll()
  },

  onHide() {
    this.stopCountdown()
  },

  applyState(s) {
    if (!s) return
    const st = s.state || 'idle'
    const connected = st === 'connected' || st === 'authed' || st === 'authfail'
    this.setData(
      {
        state: st,
        stateText: s.message ? STATE_TEXT[st] + '（' + s.message + '）' : STATE_TEXT[st] || st,
        connected: connected,
        authed: st === 'authed',
        deviceName: s.deviceName || store.displayName(this.link.device)
      },
      () => this.refreshCanSend()
    )
  },

  applyBatch(b) {
    if (!b) return
    if (b.phase === 'start') {
      this.setData({ sending: true, done: 0, total: b.total, percent: 0, traceText: '' })
      this.startCountdown()
    } else if (b.phase === 'sending') {
      this.setData({ done: b.done, percent: b.percent || 0 })
    } else if (b.phase === 'done') {
      this.setData({ sending: false, percent: 100, traceText: b.trace || '' })
      this.stopCountdown()
    } else if (b.phase === 'aborted' || b.phase === 'error') {
      this.setData({ sending: false, percent: 0, traceText: b.trace || '' })
      this.stopCountdown()
    }
    this.refreshCanSend()
  },

  onNotice(n) {
    if (!n || !n.message) return
    if (n.type === 'OFFLINE') {

      if (this.data.sending) {
        wx.showModal({ title: '连接断开', content: n.message, showCancel: false })
        return
      }
      wx.showToast({ title: '连接断开，正在重连…', icon: 'none', duration: 2000 })
      setTimeout(() => {
        this.link.autoReconnect({ scanMs: 5000 }).catch(() => {})
      }, 400)
      return
    }
    console.warn('[notice]', n)
  },

  refreshCanSend() {
    const canSend =
      this.data.authed && !this.data.sending && String(this.data.text || '').trim().length > 0
    if (canSend !== this.data.canSend) this.setData({ canSend: canSend })
  },

  goDevices() {
    wx.switchTab({ url: '/pages/devices/devices' })
  },

  goPhrases() {
    wx.navigateTo({ url: '/pages/phrases/phrases' })
  },

  goKeyboard() {
    wx.navigateTo({ url: '/pages/keyboard/keyboard' })
  },

  onInput(e) {
    const text = e.detail.value || ''
    this.setData({ text: text, len: text.length })
    this.refreshCanSend()
    this.scheduleCheck()
  },

  scheduleCheck() {
    if (this._hintTimer) clearTimeout(this._hintTimer)
    this._hintTimer = setTimeout(() => {
      this.recheck(true)
      this.recalcEstimate()
    }, 200)
  },

  recalcEstimate() {
    const text = this.data.text || ''
    if (!text.trim()) {
      this.setData({ estimateMs: 0, estimateText: '0.0S' })
      return
    }
    const r = this.link.estimate(text)
    this.setData({ estimateMs: r.ms, estimateText: this.fmtSec(r.ms) })
  },

  fmtSec(ms) {
    const s = Math.max(0, ms) / 1000
    if (s >= 60) {
      const m = Math.floor(s / 60)
      const r = Math.round(s - m * 60)
      return m + '分' + (r < 10 ? '0' + r : String(r)) + '秒'
    }
    return (s < 10 ? s.toFixed(2) : s.toFixed(1)) + 'S'
  },

  recheck(onlyHint) {
    const text = this.data.text || ''
    const r = gbk.check(text)
    const patch = {
      len: text.length,
      unsupported: r.unsupported.length,
      hintText:
        r.unsupported.length > 0
          ? r.unsupported.length + ' 个字无法转 GBK（将替换为 ?）：' + r.unsupported.slice(0, 6).join(' ')
          : '本地 GBK 转码 · 不联网 · 可发送 ' + r.total + ' 个字符'
    }
    if (!onlyHint) patch.canSend = this.data.authed && !this.data.sending && text.trim().length > 0
    this.setData(patch)
  },

  onClear() {
    if (!this.data.text) return
    wx.showModal({
      title: '清空输入',
      content: '确定清空当前文字？',
      success: (r) => {
        if (!r.confirm) return
        this.setData({
          text: '',
          len: 0,
          unsupported: 0,
          hintText: '本地 GBK 转码 · 不联网',
          canSend: false,
          estimateMs: 0,
          estimateText: '0.0S'
        })
      }
    })
  },

  async onSend() {

    if (this.data.sending) return
    const text = this.data.text || ''
    if (!text.trim()) return

    if (!this.data.authed) {
      wx.showModal({
        title: '设备未就绪',
        content: '请先在「设备」页连接 MarxScript 键盘，并通过鉴权后再发送。',
        confirmText: '去连接',
        success: (r) => {
          if (r.confirm) wx.switchTab({ url: '/pages/devices/devices' })
        }
      })
      return
    }

    const check = gbk.check(text)
    if (check.unsupported.length) {
      const ok = await this.confirm(
        '有字符无法转码',
        check.unsupported.slice(0, 8).join(' ') +
          (check.unsupported.length > 8 ? ' 等' : '') +
          ' 共 ' +
          check.unsupported.length +
          ' 个字将替换为 "?"，仍要发送吗？'
      )
      if (!ok) return
    }

    this.setData({ sending: true, done: 0, total: check.total, percent: 0 })
    this.startCountdown()

    try {
      const r = await this.link.sendText(text)
      if (r.aborted) {
        wx.showToast({ title: '已终止', icon: 'none' })
      } else if (r.lost) {

        wx.showModal({
          title: '已输入 ' + r.done + ' 字，跳过 ' + r.lost + ' 字',
          content:
            '共 ' +
            r.total +
            ' 字，' +
            r.lost +
            ' 个字因链路丢包或开发板队列满没有打出来' +
            (r.lost <= 2 ? '（通常在结尾）' : '') +
            '，其余已全部输入。如需补齐请只重发缺失部分，不要整段重发。',
          showCancel: false
        })
      } else {
        wx.showToast({ title: '已发送 ' + r.done + ' 字', icon: 'success' })
        if (wx.vibrateShort) wx.vibrateShort({ type: 'light' })
      }
    } catch (err) {
      wx.showModal({
        title: '发送中断',
        content: (err && err.message) || '未知错误，请检查设备连接',
        showCancel: false
      })
    } finally {
      this.setData({ sending: false })
      this.stopCountdown()

      screen.release('send')
      this.refreshCanSend()
      this.recalcEstimate()
    }
  },

  onAbort() {
    this.link.abort()
    this.setData({ sending: false, percent: 0 })
    this.stopCountdown()
    wx.showToast({ title: '已终止', icon: 'none' })
    if (wx.vibrateShort) wx.vibrateShort({ type: 'heavy' })
    this.refreshCanSend()
  },

  startCountdown() {
    this.stopCountdown()
    const total = this.data.estimateMs
    const t0 = Date.now()
    let lastText = ''
    this._countdown = setInterval(() => {
      const batch = this.link._bulk
      let remain = 0
      if (batch && batch.total > 0) {

        const left = Math.max(0, batch.total - batch.acked)
        remain = total * (left / batch.total)
      } else {
        remain = Math.max(0, total - (Date.now() - t0))
      }
      const txt = this.fmtSec(remain)
      if (txt === lastText) return
      lastText = txt
      this.setData({ remainText: txt })
    }, 500)
  },

  stopCountdown() {
    if (this._countdown) {
      clearInterval(this._countdown)
      this._countdown = null
    }
  },

  confirm(title, content) {
    return new Promise((resolve) => {
      wx.showModal({
        title: title,
        content: content,
        success: (r) => resolve(!!r.confirm),
        fail: () => resolve(false)
      })
    })
  },

  refreshLocal() {
    const app = getApp()
    const settings = app.link ? app.link.reloadSettings() : store.getSettings()
    const profiles = cfg.SPEED_PROFILES
    let speedName = '标准'
    const hit = profiles.filter((p) => p.id === settings.speedId)[0]
    if (hit) speedName = hit.name

    this.setData({
      phrases: store.getPhrases().slice(0, 10),
      maxLen: cfg.LIMITS.MAX_TEXT,
      speedName: speedName
    })
  },

  onChipTap(e) {
    const i = Number(e.currentTarget.dataset.index)
    const p = this.data.phrases[i]
    if (!p) return
    this.appendText(p.content)
  },

  onChipLongPress(e) {
    const i = Number(e.currentTarget.dataset.index)
    const p = this.data.phrases[i]
    if (!p) return
    if (wx.vibrateShort) wx.vibrateShort({ type: 'medium' })
    this.setData({ text: p.content })
    this.recheck()
    this.recalcEstimate()
    wx.showToast({ title: '已替换为「' + (p.title || '短语') + '」', icon: 'none' })
  },

  appendText(t) {
    if (!t) return
    let next = (this.data.text || '') + t
    const max = this.data.maxLen
    if (next.length > max) {
      next = next.slice(0, max)
      wx.showToast({ title: '已达 ' + max + ' 字上限', icon: 'none' })
    }
    this.setData({ text: next, len: next.length })
    this.refreshCanSend()
    this.recheck()
    this.recalcEstimate()
  },

  onAdError(e) {

    console.warn('[ad] banner error', e && e.detail)
  }
})
