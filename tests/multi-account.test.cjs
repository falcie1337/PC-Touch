const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const EventEmitter = require('eventemitter3')
const { GameStoreModel } = require(path.join(process.env.LINDO_TEST_BUILD, 'game-store.js'))
const { GameFightOptionModel } = require(path.join(process.env.LINDO_TEST_BUILD, 'fight-options.js'))
const { NotificationsMod } = require(path.join(process.env.LINDO_TEST_BUILD, 'notifications.js'))

const ids = (store) => store.gamesOrder.map((game) => game.id)
const createTabs = (count) => {
  const store = GameStoreModel.create({})
  for (let i = 0; i < count; i++) store.addGame()
  return store
}

test('one window holds eight independent tabs and refuses a ninth without changing the current tabs', () => {
  const store = createTabs(8)
  const before = ids(store)
  assert.equal(new Set(before).size, 8)
  assert.throws(() => store.addGame(), /More than 8/)
  assert.deepEqual(ids(store), before)
})

test('next and previous tab wrap in both directions without reordering the four accounts', () => {
  const store = createTabs(4)
  const order = ids(store)
  store.selectGameIndex(0)
  for (const expected of [1, 2, 3, 0]) {
    store.selectNextGame()
    assert.equal(store.selectedGame.id, order[expected])
  }
  for (const expected of [3, 2, 1, 0]) {
    store.selectPreviousGame()
    assert.equal(store.selectedGame.id, order[expected])
  }
  assert.deepEqual(ids(store), order)
})

test('closing a selected middle tab selects its neighbour and preserves the remaining account order', () => {
  const store = createTabs(4)
  const order = ids(store)
  store.selectGameIndex(1)
  store.removeSelectedGame()
  assert.deepEqual(ids(store), [order[0], order[2], order[3]])
  assert.equal(store.selectedGame.id, order[2])
  store.selectNextGame()
  assert.equal(store.selectedGame.id, order[3])
  store.selectNextGame()
  assert.equal(store.selectedGame.id, order[0])
})

test('closing the last selected tab selects the preceding tab; closing the only tab clears selection', () => {
  const store = createTabs(2)
  const first = store.gamesOrder[0]
  store.removeSelectedGame()
  assert.equal(store.selectedGame, first)
  store.removeSelectedGame()
  assert.equal(store.selectedGame, undefined)
  assert.equal(store.gamesOrder.length, 0)
  assert.equal(store.games.length, 0)
  store.selectNextGame()
  store.selectPreviousGame()
})

test('reordering accounts changes the navigation order without selecting a different character', () => {
  const store = createTabs(4)
  const order = ids(store)
  store.selectGameIndex(0)
  store.moveGame(order[3], order[1])
  assert.deepEqual(ids(store), [order[0], order[3], order[1], order[2]])
  assert.equal(store.selectedGame.id, order[0])
  store.selectNextGame()
  assert.equal(store.selectedGame.id, order[3])
  const before = ids(store)
  store.moveGame('missing', order[0])
  store.moveGame(order[0], 'missing')
  assert.deepEqual(ids(store), before)
})

test('old fight preferences load without enabling foreground switching', () => {
  const oldOptions = GameFightOptionModel.create({ focusOnFightTurn: false })
  assert.equal(oldOptions.focusOnFightTurn, false)
  assert.equal(oldOptions.bringToFrontOnFightTurn, false)
  oldOptions.setFocusOnFightTurn(true)
  assert.equal(oldOptions.bringToFrontOnFightTurn, false)
  oldOptions.setBringToFrontOnFightTurn(true)
  assert.equal(oldOptions.focusOnFightTurn, true)
})

const setupTurn = (
  t,
  { foreground = false, autoSelect = true, notify = true, focused = false, blocked = false } = {}
) => {
  const previousWindow = global.window
  const previousNotification = global.Notification
  const calls = []
  const notices = []
  global.window = {
    lindoAPI: {
      focusCurrentWindow: () => calls.push('window'),
      logger: {
        warn: () => {
          calls.push('notification-error')
          return () => {}
        }
      }
    }
  }
  global.Notification = class {
    constructor(title) {
      if (blocked) throw new Error('Notifications are blocked')
      this.title = title
      notices.push(this)
    }
  }
  const gui = new EventEmitter()
  gui.playerData = { characterBaseInformations: { id: 42, name: 'Test Character' } }
  const game = {
    gui,
    dofus: { connectionManager: new EventEmitter() },
    document: { hasFocus: () => focused }
  }
  const root = {
    optionStore: {
      gameFight: GameFightOptionModel.create({ focusOnFightTurn: autoSelect, bringToFrontOnFightTurn: foreground }),
      gameNotification: { fightTurn: notify }
    }
  }
  const mod = new NotificationsMod(game, root, { notifications: { fightTurn: ({ characterName }) => characterName } })
  mod.eventEmitter.on('notification', () => calls.push('unread'))
  mod.eventEmitter.on('focusTabRequest', () => calls.push('tab'))
  t.after(() => {
    mod.destroy()
    if (previousWindow === undefined) delete global.window
    else global.window = previousWindow
    if (previousNotification === undefined) delete global.Notification
    else global.Notification = previousNotification
  })
  return { calls, notices, gui, mod }
}

test('notification mode selects the turn account but never requests foreground focus', (t) => {
  const { gui, calls, notices } = setupTurn(t)
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  assert.deepEqual(calls, ['unread', 'tab'])
  assert.equal(notices.length, 1)
  assert.equal(notices[0].title, 'Test Character')
})

test('foreground mode selects the turn account and requests window focus', (t) => {
  const { gui, calls, notices } = setupTurn(t, { foreground: true })
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  assert.deepEqual(calls, ['unread', 'tab', 'window'])
  assert.equal(notices.length, 1)
})

test('a different character or monster starting its turn cannot switch this account', (t) => {
  const { gui, calls, notices } = setupTurn(t, { foreground: true })
  gui.emit('GameFightTurnStartMessage', { id: 99 })
  gui.emit('GameFightTurnStartMessage', { id: -1 })
  assert.deepEqual(calls, [])
  assert.equal(notices.length, 0)
})

test('the already focused account does not notify or request foreground focus again', (t) => {
  const { gui, calls, notices } = setupTurn(t, { foreground: true, focused: true })
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  assert.deepEqual(calls, [])
  assert.equal(notices.length, 0)
})

test('disabling automatic selection keeps the current tab while still allowing turn alerts', (t) => {
  const { gui, calls, notices } = setupTurn(t, { foreground: true, autoSelect: false })
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  assert.deepEqual(calls, ['unread'])
  assert.equal(notices.length, 1)
})

test('desktop alerts can be disabled while automatic foreground switching still works', (t) => {
  const { gui, calls, notices } = setupTurn(t, { foreground: true, notify: false })
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  assert.deepEqual(calls, ['tab', 'window'])
  assert.equal(notices.length, 0)
})

test('blocked desktop alerts do not break automatic turn selection or foreground switching', (t) => {
  const { gui, calls, notices } = setupTurn(t, { foreground: true, blocked: true })
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  assert.deepEqual(calls, ['unread', 'tab', 'window', 'notification-error'])
  assert.equal(notices.length, 0)
})

test('clicking a turn alert brings its account to the foreground even in notification mode', (t) => {
  const { gui, calls, notices } = setupTurn(t)
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  notices[0].onclick()
  assert.deepEqual(calls, ['unread', 'tab', 'window', 'tab'])
})

test('destroying a notification mod removes its game listeners', (t) => {
  const { gui, calls, mod } = setupTurn(t)
  mod.destroy()
  gui.emit('GameFightTurnStartMessage', { id: 42 })
  assert.deepEqual(calls, [])
})
