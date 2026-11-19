
module.exports = {
  VERSION: '0.11.9',
  BUILD: '2026-11-14',

  DEBUG: false,

  BLE: {

    SERVICE_UUID: '0000FFE0-0000-1000-8000-00805F9B34FB',
    WRITE_UUID: '0000FFE1-0000-1000-8000-00805F9B34FB',
    NOTIFY_UUID: '0000FFE2-0000-1000-8000-00805F9B34FB',

    STAT_UUID: '0000FFE2-0000-1000-8000-00805F9B34FB',

    CHUNK: 20,

    MTU_REQUEST: 185,

    CHUNK_TARGET: 192,

    CHUNK_STEPS: [192, 165, 132, 110, 88, 66, 44, 22, 11],

    CHUNK_GAP: 5,

    PREFER_NO_RSP: true,

    NAME_PREFIX: 'MarxScript'
  },

  SPEED_PROFILES: [
    { id: 'slow', name: '稳妥', delay: 34, gap: 45, desc: '4 字/秒，老电脑/老系统也不丢字' },
    { id: 'std', name: '标准', delay: 22, gap: 22, desc: '6.5 字/秒，默认，绝大多数电脑都正常' },
    { id: 'fast', name: '快速', delay: 12, gap: 10, desc: '11 字/秒，推荐，速度与稳定兼顾' },
    { id: 'turbo', name: '极速', delay: 6, gap: 4, desc: '18 字/秒，只给性能好的电脑，丢字就往回调' }
  ],

  PACK: {

    ITEMS: 12,
    MIN_ITEMS: 2,
    MAX_ITEMS: 17
  },

  TUNE: {

    WINDOW_FALLBACK: 3,
    WINDOW_MAX: 3,

    QUEUE_MAX: 48,

    NO_PROGRESS_MS: 45000
  },

  AD: {
    BANNER: '',
    REWARDED: ''
  },

  LIMITS: {
    MAX_TEXT: 6800,
    MAX_PHRASES: 60
  }
}
