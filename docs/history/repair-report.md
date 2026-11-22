# PC-Touch repair report

This report summarizes the recovery of the abandoned Lindo No-Emu codebase against a current DOFUS Touch client. It records implementation scope and evidence; it is not a security audit or a guarantee that every optional mod works.

## Reference and outcome

| Item | Reference |
| --- | --- |
| Original repository | [prixe/lindo](https://github.com/prixe/lindo) |
| Original baseline | `b7233eb233a0ea655f4e314ba5166e7db6363b72` (2022-11-17) |
| Functional repair endpoint | `7d6708d2b08dfeaef43bea2b22e2f5c250763514` (`3.0.0-rc.12-repair.6`) |
| Initial target | Windows 11 x64 |
| Manual usage confirmed | Two accounts, party, combat, turn-based tab selection, portraits, background audio, zaap, party indicator, and store |
| Not verified | Four live accounts, full notification/focus settings, long sessions, Linux, and distributable builds |

See the [validation record](../testing/validation.md) for details and qualifications. The full source inventory for the original repair range is in [repair-file-inventory.csv](repair-file-inventory.csv) (66 records; 22 added, 40 modified, 4 deleted; +3,442/−2,397 lines).

## Repair series

| Commit | Scope |
| --- | --- |
| `d1b3201f642327716b1f44be74a70918c1ee77fd` | Game updater and bootstrap recovery. |
| `1788cc5` | Eight-tab store and optional foreground behavior. |
| `f90156f3481e2a1cd37292f18478fcdc004d3ab9` | Node 24 / Windows Vite invalid `node:test` path. |
| `1393fe6535a8464f873dfad971cc06c66edc6ac7` | Desktop OAuth callback handling and news-image request headers. |
| `52331c4e68268c7fdb059286c3b886a2eef01d29` | Character/map entry, optional-mod lifecycle, and current shortcut-bar APIs. |
| `c296b0d312de242c88938533e0233398277e875f` | Tab portraits and background audio. |
| `7d6708d2b08dfeaef43bea2b22e2f5c250763514` | Zaap search and party prospecting indicator. |

The functional repair was followed by repository documentation changes. Documentation reorganization does not change the functional endpoint or application runtime.

## Changes by subsystem

### Updater and bootstrap

- Updated game asset endpoints and cache/bootstrap handling for the current client.
- Compared local and remote manifests so removed/changed/missing files can be repaired even when the game version string is unchanged.
- Validated manifest paths against traversal and rejected HTML/error responses as empty manifests.
- Downloaded binary assets to temporary files, preserved existing files on failed streams, bounded concurrency, and wrote manifests after successful batches.
- Pinned the upstream game bootstrap by commit and retained native IndexedDB and desktop login selection.
- Removed obsolete Firebase initialization, old context telemetry/site statistics, abandoned popup integrations, and the upstream binary self-updater behavior.

The updater does not replace the whole game directory atomically and does not add independent cryptographic hashes for every asset. Recovery, integrity, and interruption behavior remain roadmap items.

### Electron authentication and news images

- Replaced the desktop authentication opener that evaluated code in a remote page with a native Electron authentication window.
- The window begins at HTTPS `auth.ankama.com`, uses the expected DOFUS Touch client parameters, and has no preload or Node integration. It intercepts `dofustouch://authorized` callbacks and returns the result over IPC to the requesting tab instead of requiring a Windows protocol handler.
- Kept the game's PKCE and authorization-code token exchange flow.
- Combined request-header handling so multiple Electron listeners do not overwrite each other; removed a local referrer that caused two public news images to receive HTTP 403.

The OAuth popup uses a temporary per-request in-memory session. This is not complete isolation between the same-origin game iframes. The intermittent Ankama Connect failure reported during manual use was not reproduced or diagnosed.

### Character entry, tabs, and optional mods

- Added a `GameManager` lifecycle boundary and postponed optional mods until the native character initialization and map request could continue.
- Isolated optional-mod constructor/teardown failures and cleaned up owned listeners/timers; guarded MobX-state-tree access after removal.
- Updated shortcut integration to use the current `shortcutBarManager` player/hero bars rather than the removed `_panels` field.
- Expanded the tab store to eight entries and improved close/reorder selection behavior.
- Separated automatic account-tab selection on combat turns from the optional request to bring the desktop window to the foreground.
- Fixed a Windows/Node 24 Vite optimizer failure caused by generating a `node:test` directory name. The renderer already uses the preload API, so obsolete Node/Electron module bridges were removed.

Eight-tab store behavior is covered by tests; live eight-account gameplay is not. The practical target is up to four accounts.

### Portraits and audio

- Rendered the game character portrait within the native Wui tree at `gui.wBody`, waited for assets, exported a PNG for the React tab UI, and released temporary game components/resources.
- Removed the pair of native background/foreground handlers that muted the game through a method that stops and restarts looped tracks. Kept unrelated lifecycle callbacks and connected Electron output mute to the existing preferences.

Automated tests verify the expected component/audio contracts with simulated environments. The maintainer later confirmed portraits and normal background audio during play.

### Zaap search and party indicator

- Replaced repeated search-field injection with one field per zaap/zaapi body, accent-insensitive filtering, native favorite handling, a mutation observer, and teardown cleanup.
- Replaced a broken local prospecting image path with the current game's `.iconProspecting` CSS class and versioned official CDN asset.
- Deferred party total reads until after native event handlers and removed a duplicate listener.

Tests use a structural DOM rather than a visual layout engine. Manual play later confirmed the zaap menu and party prospecting icon; zaapi subcases and party-total updates were not separately characterized.

## Repository structure and dependency changes

The repair added test scripts and fixtures, regression tests for updater/authentication/multi-account/game entry/audio/portraits/zaap/party behavior, and focused lifecycle components under the renderer. Shared models and preload types were updated for tabs, focus preferences, and authentication IPC. Main-process window and updater code contain the corresponding desktop changes.

The [CSV inventory](repair-file-inventory.csv) lists every added, modified, or removed source file with line counts and a short change summary. It is the authoritative detailed file-level record for the baseline-to-functional-endpoint diff.

The lockfile remains the project's dependency authority. The runtime still uses Electron `19.0.11`, TypeScript `4.7.4`, and Vite `3.0.4`; the use of Node 24 to run development scripts does not update Electron's embedded runtime. Native dependency preparation succeeded on the maintainer's Windows machine, but a distributable package was not validated.

## Verification summary

- 74 automated regression tests passed.
- Main/preload/renderer typecheck passed; changed TypeScript files passed ESLint; all three Vite application parts compiled.
- Updater tests covered manifest differences, missing assets, path traversal, failed streams, binary bytes, and concurrency. A real HTTP updater run completed with a temporary directory.
- Electron authentication windows, current game bundle integrations, and some DOM behavior were tested with controlled/simulated environments.
- The maintainer manually confirmed basic game entry and two-account gameplay on Windows 11 x64, including combat and the repaired UI/audio paths listed above.

The automated suite does not prove live login, real WebGL output, every mod, long-session stability, four-account behavior, or release packaging. See [validation](../testing/validation.md) and the [manual test plan](../testing/manual-test-plan.md).

## Security and policy notes

This work removed obsolete telemetry and the remote-page `eval` path used by the former desktop auth opener. It did not complete an Electron security review. The main window still retains permissive legacy settings, and runtime/dependency modernization is pending. Authentication/session state shared by game iframes remains an area for investigation.

PC-Touch is not an official Ankama client. The project license applies to the repository code and does not override Ankama's service rules or grant rights to proprietary game assets. The game client is downloaded at runtime and is not included in this repository.
