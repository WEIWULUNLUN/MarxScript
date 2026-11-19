
const RENEW_MS = 20000

const holders = new Set()
let timer = null

function applyOn() {
  try {
    wx.setKeepScreenOn({
      keepScreenOn: true,
      fail: function () {

      }
    })
  } catch (e) {}
}

function applyOff() {
  try {
    wx.setKeepScreenOn({ keepScreenOn: false, fail: function () {} })
  } catch (e) {}
}

function sync() {
  const on = holders.size > 0
  if (on) {
    applyOn()
    if (!timer) timer = setInterval(applyOn, RENEW_MS)
  } else {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    applyOff()
  }
}

function hold(tag) {
  holders.add(String(tag || 'default'))
  sync()
}

function release(tag) {
  holders.delete(String(tag || 'default'))
  sync()
}

function releaseAll() {
  holders.clear()
  sync()
}

function isHeld() {
  return holders.size > 0
}

module.exports = { hold: hold, release: release, releaseAll: releaseAll, isHeld: isHeld }
