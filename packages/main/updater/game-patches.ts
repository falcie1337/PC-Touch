// Change this when the desktop bootstrap changes, so existing installations are rebuilt.
export const GAME_PATCH_REVISION = '2026-11-21.3'

export const prepareGameAudio = (content: string): string => {
  // The desktop window controls output muting. Native mobile lifecycle muting stops and restarts loops.
  // Preserve all other appGoBackground/appLeaveBackground listeners (network, rendering and game state).
  const audioLifecycle =
    /window\.gui\.on\("appGoBackground", function\(\) \{\s*(\w+)\.setMute\(!0\)\s*\}\), window\.gui\.on\("appLeaveBackground", function\(\) \{\s*\1\.setMute\(!1\)\s*\}\)/g
  if ([...content.matchAll(audioLifecycle)].length !== 1) return content
  return content.replace(audioLifecycle, 'void 0')
}

export const prepareGameScript = (content: string): string => {
  // Replace only the game's Electron WebAuth opener. Leave PKCE and token exchange in the game.
  const electronOpener =
    /function (\w+)\((\w+)\) \{\s*var (\w+) = window\.open\(\2, "_blank"\);[\s\S]+?(\w+)\(new Error\("Error WebAuth Electron impossible to open the page"\)\)\s*\n\s*\}/g
  let replacements = 0
  const patched = content.replace(electronOpener, (_match, name, url, _popup, callback) => {
    replacements++
    return `function ${name}(${url}) {
        if (!window.lindoAuth || typeof window.lindoAuth.open !== "function") {
            return ${callback}(new Error("Desktop authentication bridge is unavailable"));
        }
        return window.lindoAuth.open(${url}).then(function(result) {
            if (result && result.code) return ${callback}(null, result.code);
            return ${callback}(new Error(result && result.error || "Authentication cancelled"));
        }, function() {
            return ${callback}(new Error("Desktop authentication failed"));
        });
    }`
  })
  if (replacements !== 1) throw new Error('The current game bundle has an unrecognized desktop authentication flow')
  return patched
}

export const prepareBootstrapFile = (filename: string, content: string): string => {
  if (filename === 'fixes.js') {
    // Retain mouse-to-touch support; discard obsolete website and community popups.
    const start = content.indexOf('var events = {')
    const end = content.indexOf('/* Popups */')
    if (start === -1 || end < start) throw new Error('Unrecognized pinned mouse-to-touch bootstrap')
    return content.slice(start, end)
  }
  if (filename === 'index.html') {
    return content
      .replace(/window\.(?:indexedDB|IDBDatabase|IDBTransaction|IDBCursor|IDBKeyRange)\s*=\s*\{\};/g, '')
      .replace(/window\.cordova = \{[\s\S]*?\n {8}\};/, 'window.process = { type: "renderer" };')
      .replace(
        'head.appendChild(fixesScript);\n                cb();',
        "fixesScript.addEventListener('load', cb);\n                head.appendChild(fixesScript);"
      )
  }
  return content
}
