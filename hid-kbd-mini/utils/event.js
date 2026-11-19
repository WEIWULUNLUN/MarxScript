
function createEmitter() {
  const map = Object.create(null)

  return {
    on(event, fn) {
      if (typeof fn !== 'function') return function () {}
      if (!map[event]) map[event] = []
      map[event].push(fn)
      return function off() {
        const arr = map[event]
        if (!arr) return
        const i = arr.indexOf(fn)
        if (i > -1) arr.splice(i, 1)
      }
    },
    off(event, fn) {
      const arr = map[event]
      if (!arr) return
      if (!fn) {
        delete map[event]
        return
      }
      const i = arr.indexOf(fn)
      if (i > -1) arr.splice(i, 1)
    },
    emit(event, payload) {
      const arr = map[event]
      if (!arr || !arr.length) return

      arr.slice().forEach(function (fn) {
        try {
          fn(payload)
        } catch (e) {
          console.error('[emitter] handler error on', event, e)
        }
      })
    }
  }
}

module.exports = { createEmitter: createEmitter }
