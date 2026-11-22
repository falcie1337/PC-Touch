import { createRequire } from 'module'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { basename, delimiter, join, resolve } from 'path'
import { spawnSync } from 'child_process'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const output = mkdtempSync(join(tmpdir(), 'lindo-tests-'))
try {
  for (const filename of [
    'packages/main/updater/game-files.ts',
    'packages/main/updater/game-patches.ts',
    'packages/main/updater/updater-utils.ts',
    'packages/main/windows/auth-window.ts',
    'packages/main/windows/window-audio.ts',
    'packages/main/windows/game-request-headers.ts'
  ]) {
    const name = basename(filename, '.ts')
    const source = readFileSync(filename, 'utf8')
    const result = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true }
    })
    writeFileSync(join(output, `${name}.js`), result.outputText)
  }
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  await build({
    entryPoints: {
      'game-store': 'packages/renderer/src/store/game-store/game-store.ts',
      'fight-options': 'packages/shared/models/option-store/game-fight-option/game-fight-option.ts',
      notifications: 'packages/renderer/src/mods/notifications/notifications.ts',
      'game-manager': 'packages/renderer/src/screens/main-screen/game-screen/game-manager.ts',
      'shortcut-bars': 'packages/renderer/src/mods/shortcuts/shortcut-bars.ts',
      'tab-portrait': 'packages/renderer/src/screens/main-screen/game-screen/tab-portrait.ts',
      'window-options': 'packages/shared/models/option-store/window-option/window-option.ts',
      shortcuts: 'packages/renderer/src/mods/shortcuts/shortcuts.ts',
      hotkeys: 'packages/shared/models/hotkey-store/hotkey-store.ts',
      'zaap-search': 'packages/renderer/src/mods/zaap-search-filter/zaap-search-filter.ts',
      'party-info': 'packages/renderer/src/mods/party-info/party-info.ts'
    },
    outdir: output,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'es2021',
    external: Object.keys(pkg.dependencies),
    plugins: [
      {
        name: 'lindo-test-aliases',
        setup(plugin) {
          plugin.onResolve({ filter: /^@lindo\/shared$/ }, () => ({ path: resolve('packages/shared/index.ts') }))
          plugin.onResolve({ filter: /^@lindo\/i18n$/ }, () => ({ path: resolve('packages/i18n/index.ts') }))
        }
      }
    ]
  })
  const tests = readdirSync('tests')
    .filter((name) => name.endsWith('.test.cjs'))
    .map((name) => join('tests', name))
  const result = spawnSync(process.execPath, ['--test', ...tests], {
    stdio: 'inherit',
    env: {
      ...process.env,
      LINDO_TEST_BUILD: output,
      LINDO_TEST_ROOT: resolve('.'),
      NODE_PATH: [resolve('node_modules'), process.env.NODE_PATH].filter(Boolean).join(delimiter)
    }
  })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} finally {
  rmSync(output, { recursive: true, force: true })
}
