const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const EventEmitter = require('eventemitter3')
const { GameStoreModel } = require(path.join(process.env.LINDO_TEST_BUILD, 'game-store.js'))
const { GameManager } = require(path.join(process.env.LINDO_TEST_BUILD, 'game-manager.js'))
const { ShortcutsMod } = require(path.join(process.env.LINDO_TEST_BUILD, 'shortcuts.js'))
const { HotkeyStoreModel } = require(path.join(process.env.LINDO_TEST_BUILD, 'hotkeys.js'))
const { getActiveShortcutBar, getShortcutBars } = require(path.join(process.env.LINDO_TEST_BUILD, 'shortcut-bars.js'))

const makeClock = () => {
  let nextId = 0
  const tasks = new Map()
  return {
    setTimeout: (callback, delay = 0) => { const id = ++nextId; tasks.set(id, {callback, delay}); return id },
    clearTimeout: (id) => tasks.delete(id),
    flush: () => {
      const pending = [...tasks.entries()].filter(([, task]) => task.delay === 0)
      for (const [id, {callback}] of pending) { tasks.delete(id); callback() }
    },
    get pending() { return tasks.size }
  }
}
class DomEvents extends EventEmitter {
  addEventListener(name, callback) { this.on(name, callback) }
  removeEventListener(name, callback) { this.removeListener(name, callback) }
}

const setup = (t, modTypes = []) => {
  const store = GameStoreModel.create({})
  store.addGame()
  const game = store.selectedGame
  const clock = makeClock()
  const errors = []
  const oldWindow = global.window
  global.window = {
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    document: { createElement: () => ({style: {}}) },
    lindoAPI: {
      logger: {
        error: (...args) => () => errors.push(args),
        info: () => () => {},
        debug: () => () => {}
      }
    }
  }
  const gui = new EventEmitter()
  gui.playerData = new EventEmitter()
  gui.playerData.characterBaseInformations = { name: 'Test character', entityLook: {} }
  gui.playerData.characters = { mainCharacter: null }
  gui._resizeUi = () => {}
  gui.isConnected = true
  gui.wBody = {
    rootElement: {},
    appendChild: (child) => {child.rootElement.parentNode = gui.wBody.rootElement; return child},
    removeChild: (child) => {child.rootElement.parentNode = null; return child}
  }
  const portraits = []
  class Portrait {
    constructor(options) {
      this.options = options
      this.rootElement = { style: {} }
      this.canvas = {rootElement: {width: 64, height: 64, toDataURL: () => 'data:image/png;base64,example'}}
      this.released = false
      portraits.push(this)
    }
    setLook(_look, _options, callback) { callback?.() }
    resize() {}
    release() { this.released = true }
  }
  const gameWindow = new DomEvents()
  Object.assign(gameWindow, {
    gui,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    CharacterDisplay: Portrait,
    dofus: { connectionManager: new EventEmitter() },
    isoEngine: { mapScene: { camera: { maxZoom: 2 }, canvas: { height: 800 } } }
  })
  const manager = new GameManager({ game, rootStore: { gameStore: store }, LL: {}, modTypes })
  manager.init(gameWindow)
  t.after(() => { manager.destroy(); global.window = oldWindow })
  return { store, game, clock, errors, gameWindow, manager, portraits }
}

test('native character setup and map request finish before optional enhancements start', (t) => {
  const sequence = []
  class InspectCharacter {
    constructor(gameWindow) {
      assert.ok(gameWindow.gui.playerData.characters.mainCharacter)
      assert.ok(sequence.includes('GameContextCreateRequestMessage'))
      sequence.push('enhancements')
    }
    destroy() {}
  }
  const { gameWindow, clock, game } = setup(t, [InspectCharacter])
  // This order matches the game's connectModules -> _selectCharacter -> character-selection listener.
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  sequence.push('connect character modules')
  gameWindow.gui.playerData.characters.mainCharacter = { spellData: {} }
  sequence.push('GameContextCreateRequestMessage')
  assert.equal(game.characterName, undefined)
  assert.equal(sequence.includes('enhancements'), false)
  clock.flush()
  assert.deepEqual(sequence, ['connect character modules', 'GameContextCreateRequestMessage', 'enhancements'])
  assert.equal(game.characterName, 'Test character')
})

test('one incompatible enhancement cannot prevent later enhancements or native map setup', (t) => {
  let goodStarts = 0
  class BrokenMod { constructor() { throw new Error('obsolete game API') } }
  class GoodMod { constructor() { goodStarts++ } destroy() {} }
  const { gameWindow, clock, errors } = setup(t, [BrokenMod, GoodMod])
  assert.doesNotThrow(() => gameWindow.gui.playerData.emit('characterSelectedSuccess'))
  assert.doesNotThrow(() => clock.flush())
  assert.equal(goodStarts, 1)
  assert.equal(errors.length, 1)
  assert.match(errors[0][0], /BrokenMod/)
  assert.match(errors[0][1], /obsolete game API/)
})

test('closing a tab before deferred startup prevents reads of its destroyed MST node', (t) => {
  let starts = 0
  class Counter { constructor() { starts++ } destroy() {} }
  const { store, gameWindow, manager, clock, errors } = setup(t, [Counter])
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  store.removeSelectedGame()
  assert.doesNotThrow(() => clock.flush())
  manager.destroy()
  assert.equal(starts, 0)
  assert.equal(errors.length, 0)
  assert.equal(gameWindow.gui.playerData.listenerCount('characterSelectedSuccess'), 0)
})

test('disconnect cancels pending startup and a later login can initialize the same tab', (t) => {
  let starts = 0
  class Counter { constructor() { starts++ } destroy() {} }
  const { gameWindow, clock } = setup(t, [Counter])
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  gameWindow.gui.emit('disconnect')
  clock.flush()
  assert.equal(starts, 0)
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  clock.flush()
  assert.equal(starts, 1)
})

test('a late bootstrap callback cannot reattach listeners to an already closed tab', (t) => {
  const { store, gameWindow, manager, errors } = setup(t)
  store.removeSelectedGame()
  manager.destroy()
  assert.doesNotThrow(() => manager.init(gameWindow))
  assert.equal(gameWindow.gui.playerData.listenerCount('characterSelectedSuccess'), 0)
  assert.equal(gameWindow.gui.listenerCount('disconnect'), 0)
  assert.equal(errors.length, 0)
})

test('duplicate selection events coalesce and cleanup removes listeners and releases the portrait', (t) => {
  let starts = 0
  let stops = 0
  class Counter { constructor() { starts++ } destroy() { stops++ } }
  const { gameWindow, manager, clock, portraits } = setup(t, [Counter])
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  clock.flush()
  assert.equal(starts, 1)
  manager.destroy()
  manager.destroy()
  assert.equal(stops, 1)
  assert.equal(portraits[0].released, true)
  assert.equal(gameWindow.gui.playerData.listenerCount('characterSelectedSuccess'), 0)
  assert.equal(gameWindow.gui.listenerCount('disconnect'), 0)
  assert.equal(gameWindow.listenerCount('resize'), 0)
  assert.equal(clock.pending, 0)
})

test('a broken teardown cannot prevent the remaining enhancements from being stopped', (t) => {
  let goodStops = 0
  class BadStop { destroy() { throw new Error('teardown failed') } }
  class GoodStop { destroy() { goodStops++ } }
  const { gameWindow, manager, clock, errors } = setup(t, [BadStop, GoodStop])
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  clock.flush()
  assert.doesNotThrow(() => manager.destroy())
  assert.equal(goodStops, 1)
  assert.equal(errors.length, 1)
})

test('tab portraits request centered rendering and do not affect the native resize handler', (t) => {
  const { gameWindow, clock, portraits } = setup(t)
  const nativeResize = () => {}
  gameWindow.onresize = nativeResize
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  clock.flush()
  assert.deepEqual(portraits[0].options, { scale: 'fitin', horizontalAlign: 'center', verticalAlign: 'center' })
  assert.equal(gameWindow.onresize, nativeResize)
})

test('failure to render a portrait cannot stop enhancements or game entry', (t) => {
  let starts = 0
  class Counter { constructor() { starts++ } destroy() {} }
  const { gameWindow, clock, errors } = setup(t, [Counter])
  gameWindow.CharacterDisplay = class { constructor() { throw new Error('portrait failed') } }
  gameWindow.gui.playerData.emit('characterSelectedSuccess')
  assert.doesNotThrow(() => clock.flush())
  assert.equal(starts, 1)
  assert.equal(errors.length, 1)
})

test('shortcut lookup follows the current player/hero API and still supports the older client', () => {
  const playerBar = { name: 'player' }
  const heroBar = { name: 'hero' }
  let hero = false
  const gui = {
    playerData: { characters: { isHeroCharacterControlled: () => hero } },
    shortcutBarManager: { shortcutBars: { playerBar, heroBar } }
  }
  assert.equal(getActiveShortcutBar(gui), playerBar)
  hero = true
  assert.equal(getActiveShortcutBar(gui), heroBar)
  assert.deepEqual(getShortcutBars(gui), [playerBar, heroBar])
  const oldGui = { playerData: { characters: {} }, shortcutBar: playerBar }
  assert.equal(getActiveShortcutBar(oldGui), playerBar)
  assert.deepEqual(getShortcutBars(oldGui), [playerBar])
})

test('real shortcut mod initializes with current bars, dispatches to the controlled character and cleans up', (t) => {
  const { gameWindow } = setup(t)
  const document = new DomEvents()
  gameWindow.document = document
  let hero = false
  gameWindow.gui.playerData.characters.isHeroCharacterControlled = () => hero
  const taps = []
  const bar = (name) => ({
    _panels: {
      spell: { slotList: Array.from({length: 33}, (_, index) => Object.assign(new EventEmitter(), {tap: () => taps.push(`${name}-spell-${index}`)})) },
      item: { slotList: Array.from({length: 33}, (_, index) => ({tap: () => taps.push(`${name}-item-${index}`)})) }
    }
  })
  const playerBar = bar('player')
  const heroBar = bar('hero')
  gameWindow.gui.shortcutBarManager = {shortcutBars: {playerBar, heroBar}}
  gameWindow.gui.menuBar = {_icons: {_childrenList: []}}
  gameWindow.foreground = {_monsterTooltips: []}
  const root = {hotkeyStore: HotkeyStoreModel.create({}), optionStore: {gameGeneral: {activeOpenMenu: true}}}
  const mod = new ShortcutsMod(gameWindow, root, {})
  t.after(() => mod.destroy())
  const key = (value, ctrlKey = false, tagName = 'DIV') => {
    const event = {
      type: 'keydown', key: value, which: value.charCodeAt(0), ctrlKey,
      target: {tagName}, defaultPrevented: false,
      preventDefault() {this.defaultPrevented = true},
      stopPropagation() {}, stopImmediatePropagation() {}
    }
    document.emit('keydown', event)
  }
  key('1')
  hero = true
  key('1')
  key('1', true)
  key('1', false, 'INPUT')
  assert.deepEqual(taps, ['player-spell-1', 'hero-spell-1', 'hero-item-0'])
  mod.destroy()
  assert.equal(playerBar._panels.spell.slotList[1].listenerCount('doubletap'), 0)
  assert.equal(heroBar._panels.spell.slotList[1].listenerCount('doubletap'), 0)
  assert.equal(document.listenerCount('keydown'), 0)
})
