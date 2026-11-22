const EventEmitter = require('eventemitter3')

// Minimal DOM fixture for structural regression tests. It does not emulate CSS layout.
class Element extends EventEmitter {
  constructor(tag, doc) {
    super()
    this.tagName = tag.toUpperCase()
    this.ownerDocument = doc
    this.children = []
    this.parentElement = null
    this.style = { display: '' }
    this.className = ''
    this.id = ''
    this.value = ''
    this.attributes = {}
    this.text = ''
    this.classList = {
      contains: (name) => this.className.split(/\s+/).includes(name),
      add: (...names) => {
        this.className = [...new Set([...this.className.split(/\s+/).filter(Boolean), ...names])].join(' ')
      },
      remove: (...names) => {
        this.className = this.className
          .split(/\s+/)
          .filter((name) => !names.includes(name))
          .join(' ')
      }
    }
  }
  get parentNode() {
    return this.parentElement
  }
  get textContent() {
    return this.text + this.children.map((child) => child.textContent).join('')
  }
  set textContent(value) {
    this.text = String(value)
    for (const child of this.children) child.parentElement = null
    this.children = []
  }
  appendChild(child) {
    child.remove()
    child.parentElement = this
    this.children.push(child)
    return child
  }
  insertBefore(child, sibling) {
    child.remove()
    const index = this.children.indexOf(sibling)
    if (index < 0) throw new Error('Missing reference child')
    child.parentElement = this
    this.children.splice(index, 0, child)
    return child
  }
  remove() {
    if (this.parentElement) {
      const siblings = this.parentElement.children
      siblings.splice(siblings.indexOf(this), 1)
      this.parentElement = null
    }
  }
  removeChild(child) {
    if (child.parentElement !== this) throw new Error('Not a child')
    child.remove()
    return child
  }
  setAttribute(name, value) {
    this.attributes[name] = String(value)
    if (name === 'id') this.id = String(value)
  }
  getAttribute(name) {
    return this.attributes[name] ?? null
  }
  contains(child) {
    return child === this || this.children.some((node) => node.contains(child))
  }
  addEventListener(name, listener) {
    this.on(name, listener)
  }
  removeEventListener(name, listener) {
    this.removeListener(name, listener)
  }
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  }
  querySelectorAll(selector) {
    const results = []
    const selectors = selector.split(',').map((part) => part.trim().split(/\s+/))
    const matches = (node, part) =>
      part.startsWith('.')
        ? node.classList.contains(part.slice(1))
        : part.startsWith('#')
        ? node.id === part.slice(1)
        : node.tagName.toLowerCase() === part
    const accepts = (node, parts) => {
      if (!matches(node, parts.at(-1))) return false
      let ancestor = node.parentElement
      for (let index = parts.length - 2; index >= 0; index--) {
        while (ancestor && !matches(ancestor, parts[index])) ancestor = ancestor.parentElement
        if (!ancestor) return false
        ancestor = ancestor.parentElement
      }
      return true
    }
    const visit = (node) => {
      for (const child of node.children) {
        if (selectors.some((parts) => accepts(child, parts))) results.push(child)
        visit(child)
      }
    }
    visit(this)
    return results
  }
}

const createDom = () => {
  const doc = {}
  const root = new Element('html', doc)
  doc.head = root.appendChild(new Element('head', doc))
  doc.body = root.appendChild(new Element('body', doc))
  doc.createElement = (tag) => new Element(tag, doc)
  doc.querySelector = (selector) => root.querySelector(selector)
  doc.querySelectorAll = (selector) => root.querySelectorAll(selector)
  let next = 0
  const timers = new Map()
  const observers = []
  class MutationObserver {
    constructor(callback) {
      this.callback = callback
      this.active = false
      observers.push(this)
    }
    observe(target) {
      this.target = target
      this.active = true
    }
    disconnect() {
      this.active = false
    }
    trigger() {
      if (this.active) this.callback([])
    }
  }
  return {
    doc,
    observers,
    MutationObserver,
    setTimeout: (callback) => {
      const id = ++next
      timers.set(id, callback)
      return id
    },
    clearTimeout: (id) => timers.delete(id),
    flush: () => {
      const pending = [...timers.values()]
      timers.clear()
      for (const callback of pending) callback()
    },
    get pending() {
      return timers.size
    }
  }
}
module.exports = { createDom }
