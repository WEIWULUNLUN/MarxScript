
const store = require('./utils/store')
const { Link } = require('./utils/link')
const { createEmitter } = require('./utils/event')

App({
  link: null,
  bus: createEmitter(),
  globalData: {

    pendingText: '',
    pendingAppend: false
  },

  onLaunch() {
    store.init()

    this.link = new Link()

    this.link.on('state', (s) => this.bus.emit('link:state', s))
    this.link.on('batch', (b) => this.bus.emit('link:batch', b))
    this.link.on('notice', (n) => this.bus.emit('link:notice', n))
    this.link.on('log', (l) => this.bus.emit('link:log', l))

    this.link.on('chunk', (c) => this.bus.emit('link:chunk', c))

    this._lastAutoAt = Date.now()
    setTimeout(() => {
      this.link.autoReconnect().catch(() => {})
    }, 400)
  },

  onShow() {

    if (!this.link) return
    const st = this.link.state
    if (st === 'authed' || st === 'connecting') return
    if (Date.now() - (this._lastAutoAt || 0) < 3000) return
    this._lastAutoAt = Date.now()
    setTimeout(() => {
      this.link.autoReconnect({ scanMs: 4000 }).catch(() => {})
    }, 300)
  },

  onError(err) {
    console.error('[app] onError', err)
  }
})
