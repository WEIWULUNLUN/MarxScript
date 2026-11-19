const store = require('../../utils/store')
const cfg = require('../../utils/config')

Page({
  data: {
    list: [],
    maxCount: cfg.LIMITS.MAX_PHRASES,
    saving: false,
    editor: {
      open: false,
      id: '',
      title: '',
      content: ''
    }
  },

  onShow() {
    this.load()
  },

  load() {
    this.setData({ list: store.getPhrases() })
  },

  onAdd() {
    if (this.data.list.length >= this.data.maxCount) {
      wx.showToast({ title: '已达 ' + this.data.maxCount + ' 条上限', icon: 'none' })
      return
    }
    this.setData({ editor: { open: true, id: '', title: '', content: '' } })
  },

  onEdit(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.filter((p) => p.id === id)[0]
    if (!item) return
    this.setData({
      editor: { open: true, id: item.id, title: item.title || '', content: item.content || '' }
    })
  },

  onCancel() {
    this.setData({ 'editor.open': false })
  },

  onTitleInput(e) {
    this.setData({ 'editor.title': e.detail.value })
  },

  onContentInput(e) {
    this.setData({ 'editor.content': e.detail.value })
  },

  onSave() {
    const { id, title, content } = this.data.editor
    const t = String(title || '').trim()
    const c = String(content || '').trim()
    if (!c) {
      wx.showToast({ title: '内容不能为空', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    try {
      if (id) {
        store.updatePhrase(id, { title: t || c.slice(0, 8), content: c })
      } else {
        store.addPhrase(t || c.slice(0, 8), c)
      }
      this.setData({ saving: false, 'editor.open': false })
      this.load()
      wx.showToast({ title: '已保存', icon: 'success' })
    } catch (err) {
      this.setData({ saving: false })
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' })
    }
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.filter((p) => p.id === id)[0]
    wx.showModal({
      title: '删除短语',
      content: '删除「' + ((item && item.title) || '该短语') + '」？',
      confirmColor: '#E0454A',
      success: (r) => {
        if (!r.confirm) return
        store.removePhrase(id)
        this.load()
      }
    })
  },

  onMove(e) {
    const { id, dir } = e.currentTarget.dataset
    store.movePhrase(id, Number(dir))
    this.load()
  },

  onFill(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.list.filter((p) => p.id === id)[0]
    if (!item) return
    const app = getApp()
    app.globalData.pendingText = item.content
    app.globalData.pendingAppend = false
    wx.switchTab({ url: '/pages/index/index' })
  }
})
