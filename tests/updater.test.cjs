const assert = require('node:assert/strict')
const { test } = require('node:test')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Readable } = require('node:stream')
const { diffManifest, retrieveManifests, validateManifest } = require(path.join(
  process.env.LINDO_TEST_BUILD,
  'updater-utils.js'
))
const { downloadToFile, gameFilePath, runWithConcurrency } = require(path.join(
  process.env.LINDO_TEST_BUILD,
  'game-files.js'
))
const { prepareBootstrapFile } = require(path.join(process.env.LINDO_TEST_BUILD, 'game-patches.js'))
const entry = (filename, version = '1') => ({ filename, version })
const temporary = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lindo-updater-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('manifest diff handles removed files and changed URLs with the same version', () => {
  const previous = { files: { 'old.js': entry('old.js'), 'same.js': entry('one/same.js') } }
  const next = { files: { 'same.js': entry('two/same.js') } }
  assert.deepEqual(diffManifest(previous, next), { 'same.js': 1, 'old.js': -1 })
})

test('same manifest repairs a missing local game file', async (t) => {
  const root = temporary(t)
  const manifest = { files: { 'build/script.js': entry('build/script.js') } }
  const localManifestPath = path.join(root, 'manifest.json')
  fs.writeFileSync(localManifestPath, JSON.stringify(manifest))
  const [, , diff] = await retrieveManifests({
    localManifestPath,
    remoteManifestUrl: 'https://example.test/manifest.json',
    httpClient: { get: async () => ({ data: manifest }) },
    gamePath: root
  })
  assert.equal(diff['build/script.js'], 1)
})

test('a changed patch revision forces a fresh copy even when files exist', async (t) => {
  const root = temporary(t)
  const manifest = { files: { 'script.js': entry('script.js') } }
  const localManifestPath = path.join(root, 'manifest.json')
  fs.writeFileSync(localManifestPath, JSON.stringify(manifest))
  fs.writeFileSync(path.join(root, 'script.js'), 'outdated patched code')
  const [, , diff] = await retrieveManifests({
    localManifestPath,
    remoteManifestUrl: 'https://example.test/manifest.json',
    httpClient: { get: async () => ({ data: manifest }) },
    gamePath: root,
    forceDownload: true
  })
  assert.equal(diff['script.js'], 1)
})

test('a truncated manifest cache is recovered', async (t) => {
  const root = temporary(t)
  const localManifestPath = path.join(root, 'manifest.json')
  fs.writeFileSync(localManifestPath, '{"files":')
  const manifest = { files: { 'script.js': entry('script.js') } }
  const [previous, , diff] = await retrieveManifests({
    localManifestPath,
    remoteManifestUrl: 'https://example.test/manifest.json',
    httpClient: { get: async () => ({ data: manifest }) }
  })
  assert.deepEqual(previous, { files: {} })
  assert.equal(diff['script.js'], 1)
})

test('an HTML error page cannot be accepted as an empty manifest', () => {
  assert.throws(() => validateManifest('<html>Unavailable</html>'), /Invalid game manifest/)
  assert.throws(() => validateManifest({ files: [] }), /Invalid game manifest/)
  assert.throws(() => validateManifest({ files: { 'script.js': { filename: 'script.js' } } }), /Invalid game manifest/)
  assert.deepEqual(validateManifest({ files: {} }), { files: {} })
})

test('manifest paths cannot escape the game directory on Windows or Linux', () => {
  for (const name of [
    '../outside',
    '/outside',
    'C:/outside',
    'C:\\outside',
    'build/../../outside',
    'build\\..\\outside',
    'build/file:stream',
    'build/.. /outside',
    'build/../outside',
    'build//file',
    'build/./file'
  ]) {
    assert.throws(() => gameFilePath('/game', name), /Invalid game file path/)
  }
  assert.equal(gameFilePath('/game', 'build/script.js'), path.join('/game', 'build/script.js'))
})

test('a failed asset stream preserves the previous file and removes the partial download', async (t) => {
  const root = temporary(t)
  const destination = path.join(root, 'asset.bin')
  fs.writeFileSync(destination, 'old complete asset')
  const data = Readable.from(
    (async function* () {
      yield Buffer.from('partial')
      throw new Error('network interrupted')
    })()
  )
  await assert.rejects(
    downloadToFile({ get: async () => ({ data }) }, 'https://example.test/asset', destination),
    /network interrupted/
  )
  assert.equal(fs.readFileSync(destination, 'utf8'), 'old complete asset')
  assert.deepEqual(fs.readdirSync(root), ['asset.bin'])
})

test('HTTP failures do not create an empty asset file', async (t) => {
  const root = temporary(t)
  const destination = path.join(root, 'asset.bin')
  await assert.rejects(
    downloadToFile(
      {
        get: async () => {
          throw new Error('HTTP 503')
        }
      },
      'https://example.test/asset',
      destination
    ),
    /HTTP 503/
  )
  assert.deepEqual(fs.readdirSync(root), [])
})

test('a successful download preserves binary bytes exactly', async (t) => {
  const root = temporary(t)
  const destination = path.join(root, 'nested', 'asset.bin')
  const bytes = Buffer.from([0, 255, 239, 187, 191, 128, 0])
  await downloadToFile(
    { get: async () => ({ data: Readable.from([bytes]) }) },
    'https://example.test/asset',
    destination
  )
  assert.deepEqual(fs.readFileSync(destination), bytes)
  assert.deepEqual(fs.readdirSync(path.dirname(destination)), ['asset.bin'])
})

test('downloads respect the concurrency limit', async () => {
  let active = 0
  let maximum = 0
  const completed = []
  await runWithConcurrency(
    [0, 1, 2, 3, 4],
    async (item) => {
      maximum = Math.max(maximum, ++active)
      await new Promise((resolve) => setImmediate(resolve))
      active--
      completed.push(item)
    },
    2
  )
  assert.equal(maximum, 2)
  assert.deepEqual(completed.sort(), [0, 1, 2, 3, 4])
})

test('failed batches wait for the remaining in-flight write before rejecting', async () => {
  let release
  let finished = false
  const gate = new Promise((resolve) => {
    release = resolve
  })
  const batch = runWithConcurrency(
    ['fail', 'write'],
    async (item) => {
      if (item === 'fail') throw new Error('download failed')
      await gate
      finished = true
    },
    2
  )
  const rejection = assert.rejects(batch, /download failed/)
  assert.equal(finished, false)
  release()
  await rejection
  assert.equal(finished, true)
})

test('the pinned bootstrap keeps native IndexedDB and selects the current desktop login', () => {
  const original = fs.readFileSync(path.join(process.env.LINDO_TEST_ROOT, 'tests/fixtures/upstream-index.html'), 'utf8')
  const patched = prepareBootstrapFile('index.html', original)
  assert.doesNotMatch(patched, /window\.(?:indexedDB|IDBTransaction)\s*=/)
  assert.doesNotMatch(patched, /window\.cordova\s*=/)
  assert.match(patched, /window\.process = \{ type: "renderer" \}/)
  assert.match(patched, /fixesScript\.addEventListener\('load', cb\)/)
})

test('mouse-to-touch support does not retain abandoned-domain popups', () => {
  const original = fs.readFileSync(path.join(process.env.LINDO_TEST_ROOT, 'tests/fixtures/upstream-fixes.js'), 'utf8')
  const patched = prepareBootstrapFile('fixes.js', original)
  assert.match(patched, /new TouchEvent/)
  assert.doesNotMatch(patched, /https?:\/\//)
  assert.doesNotMatch(patched, /sendPopup/)
})
