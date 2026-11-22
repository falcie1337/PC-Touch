const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')
const { observable, runInAction } = require('mobx')
const EventEmitter = require('eventemitter3')
const { createDom } = require('./helpers/dom.cjs')
const { ZaapSearchFilterMod } = require(path.join(process.env.LINDO_TEST_BUILD, 'zaap-search.js'))
const { PartyInfoMod } = require(path.join(process.env.LINDO_TEST_BUILD, 'party-info.js'))

const setup = (t) => {
  const dom = createDom()
  const oldWindow = global.window
  global.window = { lindoAPI: { logger: { info: () => () => {} } } }
  t.after(() => {
    global.window = oldWindow
  })
  const game = {
    document: dom.doc,
    MutationObserver: dom.MutationObserver,
    setTimeout: dom.setTimeout,
    clearTimeout: dom.clearTimeout,
    dofus: { connectionManager: new EventEmitter() },
    gui: { party: { currentParty: { _childrenList: [] } } }
  }
  const root = {
    optionStore: {
      gameGeneral: observable({ zaapSearchFilter: true }),
      gameGroup: observable({ groupLevel: true, groupProspecting: true })
    }
  }
  const LL = {
    mod: {
      zaapSearchFilter: { placeholder: () => 'Search a zaap', placeholderZaapi: () => 'Search a zaapi' },
      partyInfo: { level: () => 'Lvl:' }
    }
  }
  return { ...dom, game, root, LL }
}
const element = (doc, parent, className, tag = 'div') => {
  const node = doc.createElement(tag)
  node.className = className
  parent.appendChild(node)
  return node
}
const teleporter = (env) => {
  const win = element(env.doc, env.doc.body, 'window teleporterListWindow')
  const body = element(env.doc, win, 'teleporterBody zaapBody')
  element(env.doc, body, 'tabs')
  const panels = element(env.doc, body, 'panels')
  const panel = element(env.doc, panels, 'panel Zaap')
  const table = element(env.doc, panel, 'TableV2')
  const content = element(env.doc, table, 'content')
  const header = element(env.doc, table, 'row header')
  const makeRow = (name) => {
    const row = element(env.doc, content, 'row')
    row.style.display = 'flex'
    const favorite = element(env.doc, row, 'favoriteButton fullStar')
    const destination = element(env.doc, row, 'destinationName')
    destination.textContent = name
    return { row, favorite }
  }
  const astrub = makeRow('Astrub')
  const bonta = makeRow('Bônta')
  const mod = new ZaapSearchFilterMod(env.game, env.root, env.LL)
  return { win, body, panels, header, content, makeRow, astrub, bonta, mod }
}

test('repeated zaap packets keep one search field and leave native destination rows and favorite controls intact', (t) => {
  const env = setup(t)
  const ui = teleporter(env)
  t.after(() => ui.mod.destroy())
  for (let count = 0; count < 10; count++) {
    env.game.dofus.connectionManager.emit('ZaapListMessage', {})
    env.flush()
  }
  assert.equal(ui.body.querySelectorAll('input').length, 1)
  assert.equal(env.doc.head.querySelectorAll('style').length, 1)
  assert.equal(ui.panels.querySelectorAll('.destinationName').length, 2)
  assert.equal(ui.astrub.favorite.parentElement, ui.astrub.row)
  assert.equal(ui.bonta.favorite.classList.contains('fullStar'), true)
})

test('search is accent-insensitive, skips headers and restores each native row display mode', (t) => {
  const env = setup(t)
  const ui = teleporter(env)
  t.after(() => ui.mod.destroy())
  env.game.dofus.connectionManager.emit('ZaapListMessage', {})
  env.flush()
  const input = ui.body.querySelector('input')
  input.value = 'BONTA'
  input.emit('input')
  assert.equal(ui.astrub.row.style.display, 'none')
  assert.equal(ui.bonta.row.style.display, 'flex')
  assert.equal(ui.header.style.display, '')
  input.value = ''
  input.emit('input')
  assert.equal(ui.astrub.row.style.display, 'flex')
  assert.equal(ui.bonta.row.style.display, 'flex')
})

test('native destination updates are filtered again without creating another field', (t) => {
  const env = setup(t)
  const ui = teleporter(env)
  t.after(() => ui.mod.destroy())
  env.game.dofus.connectionManager.emit('ZaapListMessage', {})
  env.flush()
  const input = ui.body.querySelector('input')
  input.value = 'astrub'
  input.emit('input')
  const extra = ui.makeRow('Frigost')
  env.observers[0].trigger()
  assert.equal(extra.row.style.display, 'none')
  assert.equal(ui.body.querySelectorAll('input').length, 1)
})

test('closing a teleport dialog restores the native layout, disconnects observation and allows reopening', (t) => {
  const env = setup(t)
  const ui = teleporter(env)
  t.after(() => ui.mod.destroy())
  env.game.dofus.connectionManager.emit('ZaapListMessage', {})
  env.flush()
  const input = ui.body.querySelector('input')
  input.value = 'unknown'
  input.emit('input')
  env.game.dofus.connectionManager.emit('LeaveDialogMessage', {})
  assert.equal(ui.body.querySelectorAll('input').length, 0)
  assert.equal(ui.astrub.row.style.display, 'flex')
  assert.equal(ui.body.classList.contains('lindo-teleport-searchable'), false)
  assert.equal(env.observers[0].active, false)
  env.game.dofus.connectionManager.emit('ZaapListMessage', {})
  env.flush()
  assert.equal(ui.body.querySelectorAll('input').length, 1)
})

test('leaving before the scheduled update cancels injection and disabling the mod cleans its UI', (t) => {
  const env = setup(t)
  const ui = teleporter(env)
  t.after(() => ui.mod.destroy())
  env.game.dofus.connectionManager.emit('ZaapListMessage', {})
  env.game.dofus.connectionManager.emit('LeaveDialogMessage', {})
  env.flush()
  assert.equal(ui.body.querySelectorAll('input').length, 0)
  env.game.dofus.connectionManager.emit('ZaapListMessage', {})
  env.flush()
  runInAction(() => {
    env.root.optionStore.gameGeneral.zaapSearchFilter = false
  })
  assert.equal(ui.body.querySelectorAll('input').length, 0)
  assert.equal(env.game.dofus.connectionManager.listenerCount('ZaapListMessage'), 0)
})

test('zaap and zaapi bodies retain their separate search fields without changing native favorites', (t) => {
  const env = setup(t)
  const ui = teleporter(env)
  t.after(() => ui.mod.destroy())
  const subway = element(env.doc, ui.win, 'teleporterBody subwayBody')
  element(env.doc, subway, 'panels')
  env.game.dofus.connectionManager.emit('TeleportDestinationsListMessage', { teleporterType: 1 })
  env.flush()
  assert.equal(ui.body.querySelectorAll('input').length, 1)
  assert.equal(subway.querySelectorAll('input').length, 1)
  assert.equal(subway.querySelector('input').placeholder, 'Search a zaapi')
})

test('separate game tabs do not share search text or injected nodes', (t) => {
  const env = setup(t)
  const other = setup(t)
  const first = teleporter(env)
  const second = teleporter(other)
  t.after(() => first.mod.destroy())
  t.after(() => second.mod.destroy())
  env.game.dofus.connectionManager.emit('ZaapListMessage', {})
  other.game.dofus.connectionManager.emit('ZaapListMessage', {})
  env.flush()
  other.flush()
  first.body.querySelector('input').value = 'bonta'
  first.body.querySelector('input').emit('input')
  assert.equal(second.body.querySelector('input').value, '')
  assert.equal(second.astrub.row.style.display, 'flex')
})

test('the party prospecting badge uses the native CDN-backed CSS icon instead of a missing local image', (t) => {
  const env = setup(t)
  const holder = element(env.doc, env.doc.body, 'partyScroller')
  element(env.doc, holder, 'partyBoxes')
  const mod = new PartyInfoMod(env.game, env.root, env.LL)
  t.after(() => mod.destroy())
  env.flush()
  const badge = env.doc.querySelector('#party-info-container')
  assert.equal(badge.querySelectorAll('img').length, 0)
  const icon = badge.querySelector('.iconProspecting')
  assert.ok(icon)
  assert.equal(icon.getAttribute('role'), 'img')
  assert.equal(icon.getAttribute('aria-label'), 'PP')
})

test('party totals read the updated native roster after event dispatch and coalesce repeated updates', (t) => {
  const env = setup(t)
  const holder = element(env.doc, env.doc.body, 'partyScroller')
  element(env.doc, holder, 'partyBoxes')
  const mod = new PartyInfoMod(env.game, env.root, env.LL)
  t.after(() => mod.destroy())
  env.game.dofus.connectionManager.emit('PartyJoinMessage', {})
  env.game.dofus.connectionManager.emit('PartyUpdateMessage', {})
  env.game.gui.party.currentParty._childrenList = [
    { memberData: { level: 15, prospecting: 100 } },
    { memberData: { level: 21, prospecting: 110 } }
  ]
  env.flush()
  assert.equal(env.doc.querySelector('#party-level').textContent, 'Lvl: 36')
  assert.equal(env.doc.querySelector('#party-pr').textContent, ' 210')
  assert.equal(env.game.dofus.connectionManager.listenerCount('PartyUpdateMessage'), 1)
})

test('destroying party info cancels pending updates and removes all listeners and DOM', (t) => {
  const env = setup(t)
  const holder = element(env.doc, env.doc.body, 'partyScroller')
  element(env.doc, holder, 'partyBoxes')
  const mod = new PartyInfoMod(env.game, env.root, env.LL)
  env.flush()
  env.game.dofus.connectionManager.emit('PartyUpdateMessage', {})
  mod.destroy()
  env.flush()
  assert.equal(env.doc.querySelector('#party-info-container'), null)
  assert.equal(env.game.dofus.connectionManager.listenerCount('PartyUpdateMessage'), 0)
  assert.equal(env.pending, 0)
})
