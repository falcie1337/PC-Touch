const assert = require('node:assert/strict')
const { test } = require('node:test')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { prepareGameScript } = require(path.join(process.env.LINDO_TEST_BUILD, 'game-patches.js'))
const { gameRequestHeaders } = require(path.join(process.env.LINDO_TEST_BUILD, 'game-request-headers.js'))

const authUrl = (kind = 'ankama') =>
  `https://auth.ankama.com/login/${kind}?client_id=18&redirect_uri=dofustouch%3A%2F%2Fauthorized&code_challenge=example`

const loadAuth = () => {
  const windows = []
  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super()
      this.options = options
      this.destroyed = false
      this.urls = []
      this.webContents = new EventEmitter()
      this.webContents.setWindowOpenHandler = (handler) => { this.openHandler = handler }
      windows.push(this)
    }
    isDestroyed() { return this.destroyed }
    close() {
      if (this.destroyed) return
      this.destroyed = true
      this.emit('closed')
    }
    loadURL(url) {
      this.urls.push(url)
      return Promise.resolve()
    }
  }
  const source = fs.readFileSync(path.join(process.env.LINDO_TEST_BUILD, 'auth-window.js'), 'utf8')
  const module = { exports: {} }
  const context = {
    module,
    exports: module.exports,
    URL,
    require: (name) => name === 'electron' ? { BrowserWindow: FakeBrowserWindow } : require(name)
  }
  vm.runInNewContext(source, context)
  return { ...module.exports, windows, parent: new EventEmitter() }
}
const emitNavigation = (popup, eventName, url) => {
  let prevented = false
  popup.webContents.emit(eventName, { preventDefault: () => { prevented = true } }, url)
  return prevented
}

test('only the configured Ankama Touch authorization endpoint can create an auth window', async () => {
  const auth = loadAuth()
  for (const value of [
    undefined, null, {}, 'not a url',
    authUrl().replace('https:', 'http:'),
    authUrl().replace('auth.ankama.com', 'auth.ankama.com.evil.test'),
    authUrl().replace('auth.ankama.com', 'user@auth.ankama.com'),
    authUrl().replace('client_id=18', 'client_id=1'),
    authUrl() + '&client_id=18',
    authUrl().replace('authorized', 'another-host'),
    authUrl() + '&redirect_uri=https://evil.test',
    authUrl().replace('/login/ankama', '/unrelated')
  ]) {
    assert.equal(auth.isWebAuthUrl(value), false)
    assert.equal((await auth.openWebAuthWindow(auth.parent, value)).error, 'Invalid authentication URL')
  }
  assert.equal(auth.windows.length, 0)
  for (const kind of ['ankama', 'ankama-guest', 'google', 'apple', 'discord']) {
    assert.equal(auth.isWebAuthUrl(authUrl(kind)), true)
  }
})

for (const eventName of ['will-navigate', 'will-redirect']) {
  test(`${eventName} consumes the app callback and returns its code without an OS protocol handler`, async () => {
    const auth = loadAuth()
    const result = auth.openWebAuthWindow(auth.parent, authUrl())
    const popup = auth.windows[0]
    assert.equal(emitNavigation(popup, eventName, 'dofustouch://authorized?code=one%2Btwo%26three'), true)
    assert.equal((await result).code, 'one+two&three')
    assert.equal(popup.isDestroyed(), true)
    assert.equal(auth.parent.listenerCount('closed'), 0)
  })
}

test('new-window callback links are consumed and never launch an external application', async () => {
  const auth = loadAuth()
  const result = auth.openWebAuthWindow(auth.parent, authUrl('ankama-guest'))
  const popup = auth.windows[0]
  assert.equal(popup.openHandler({ url: 'dofustouch://authorized?code=guest-code' }).action, 'deny')
  assert.equal((await result).code, 'guest-code')
})

test('auth windows retain CSP, sandboxing and isolation and get separate temporary sessions', async () => {
  const auth = loadAuth()
  const first = auth.openWebAuthWindow(auth.parent, authUrl())
  const second = auth.openWebAuthWindow(auth.parent, authUrl())
  const [one, two] = auth.windows
  for (const popup of auth.windows) {
    const settings = popup.options.webPreferences
    assert.equal(settings.sandbox, true)
    assert.equal(settings.contextIsolation, true)
    assert.equal(settings.webSecurity, true)
    assert.equal(settings.nodeIntegration, false)
    assert.equal(settings.preload, undefined)
    assert.equal(settings.webviewTag, false)
    assert.ok(!settings.partition.startsWith('persist:'))
  }
  assert.notEqual(one.options.webPreferences.partition, two.options.webPreferences.partition)
  emitNavigation(two, 'will-navigate', 'dofustouch://authorized?code=second-account')
  emitNavigation(one, 'will-navigate', 'dofustouch://authorized?code=first-account')
  assert.equal((await first).code, 'first-account')
  assert.equal((await second).code, 'second-account')
})

test('closing an auth window returns cancellation and a later login can succeed', async () => {
  const auth = loadAuth()
  const cancelled = auth.openWebAuthWindow(auth.parent, authUrl())
  auth.windows[0].close()
  assert.equal((await cancelled).error, 'Authentication cancelled')
  const retried = auth.openWebAuthWindow(auth.parent, authUrl())
  emitNavigation(auth.windows[1], 'will-navigate', 'dofustouch://authorized?code=retry')
  assert.equal((await retried).code, 'retry')
})

test('closing the owning game window cancels its pending authentication', async () => {
  const auth = loadAuth()
  const result = auth.openWebAuthWindow(auth.parent, authUrl())
  auth.parent.emit('closed')
  assert.equal((await result).error, 'Authentication cancelled')
  assert.equal(auth.windows[0].isDestroyed(), true)
})

test('malformed callbacks cannot supply an authorization code', () => {
  const { readWebAuthCallback } = loadAuth()
  for (const url of [
    'dofustouch://authorized',
    'dofustouch://authorized?code=',
    'dofustouch://authorized?code=a&code=b',
    'dofustouch://authorized?code=a&error=b',
    'dofustouch://authorized.evil.test?code=a',
    'dofustouch://user@authorized?code=a',
    'dofustouch://authorized:123?code=a',
    'dofustouch://authorized/path?code=a',
    'dofustouch://authorized?code=a#fragment',
    'https://authorized?code=a',
    'invalid'
  ]) {
    assert.equal(readWebAuthCallback(url).code, undefined, url)
    assert.ok(readWebAuthCallback(url).error, url)
  }
  assert.equal(readWebAuthCallback('dofustouch://authorized?error=access_denied').error, 'access_denied')
})

test('other app schemes are blocked while ordinary HTTPS authentication navigation continues', async () => {
  const auth = loadAuth()
  const result = auth.openWebAuthWindow(auth.parent, authUrl())
  const popup = auth.windows[0]
  assert.equal(emitNavigation(popup, 'will-navigate', 'https://account.ankama.com/'), false)
  for (const url of ['file:///C:/example', 'javascript:alert(1)', 'unknown-app://open']) {
    assert.equal(emitNavigation(popup, 'will-navigate', url), true)
    assert.equal(popup.openHandler({ url }).action, 'deny')
    assert.equal(popup.isDestroyed(), false)
  }
  popup.close()
  await result
})

test('failure of the main auth document reports an error, while aborted and subframe loads are ignored', async () => {
  const auth = loadAuth()
  const result = auth.openWebAuthWindow(auth.parent, authUrl())
  const popup = auth.windows[0]
  popup.webContents.emit('did-fail-load', {}, -3, 'aborted', '', true)
  popup.webContents.emit('did-fail-load', {}, -105, 'subframe error', '', false)
  assert.equal(popup.isDestroyed(), false)
  popup.webContents.emit('did-fail-load', {}, -105, 'main frame error', '', true)
  assert.equal((await result).error, 'Could not load the authentication page')
})

// A small synthetic fixture of the old opener, without distributing the game bundle.
const oldOpener = `function openElectron(url) {
    var popup = window.open(url, "_blank");
    return popup ? popup.eval("read the remote page") : done(new Error("Error WebAuth Electron impossible to open the page"))
}
function launch(url) { return openElectron(url); }
`

test('the patched game opener passes native auth results to the existing game callback without remote eval', async () => {
  const source = prepareGameScript(oldOpener)
  assert.ok(!source.includes('.eval('))
  const calls = []
  const context = { window: { lindoAuth: { open: async () => ({ code: 'native-code' }) } }, done: (...args) => calls.push(args) }
  vm.runInNewContext(source, context)
  await context.launch(authUrl())
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], null)
  assert.equal(calls[0][1], 'native-code')
})

test('cancelling native auth reaches the game error callback without throwing an uncaught exception', async () => {
  const context = {
    window: { lindoAuth: { open: async () => ({ error: 'Authentication cancelled' }) } },
    done: (error) => { context.lastError = error.message }
  }
  vm.runInNewContext(prepareGameScript(oldOpener), context)
  await context.launch(authUrl())
  assert.equal(context.lastError, 'Authentication cancelled')
})

test('an unrecognized or ambiguous game auth flow is rejected instead of applying an incomplete patch', () => {
  assert.throws(() => prepareGameScript('unrecognized'), /unrecognized desktop authentication/)
  assert.throws(() => prepareGameScript(oldOpener + oldOpener), /unrecognized desktop authentication/)
})

test('the static Ankama image rule and client-header rule both apply without changing credentials', () => {
  const original = {
    referer: 'http://127.0.0.1:3000/game/index.html',
    'SEC-CH-UA': 'example',
    'Sec-Fetch-Site': 'cross-site',
    Cookie: 'example-cookie',
    Authorization: 'example-token',
    'User-Agent': 'example-agent'
  }
  const headers = gameRequestHeaders('https://static.ankama.com/news/image.jpg', original)
  assert.equal(headers.referer, undefined)
  assert.equal(headers['SEC-CH-UA'], undefined)
  assert.equal(headers['Sec-Fetch-Site'], undefined)
  for (const name of ['Cookie', 'Authorization', 'User-Agent']) assert.equal(headers[name], original[name])
  assert.ok(original.referer)
  for (const url of ['https://auth.ankama.com/', 'https://static.ankama.com.evil.test/image.jpg']) {
    assert.equal(gameRequestHeaders(url, original).referer, original.referer)
  }
})
