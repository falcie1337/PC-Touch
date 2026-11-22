# Validation record

Initial `repair.6` results recorded on 2026-11-21. Subsequent validation is listed separately.

## Automated and development checks

| Check | Result |
| --- | --- |
| Updater, bootstrap, multi-account, authentication, session, audio, portrait, zaap, and party regression suite | 74 passed. |
| Main, preload, and renderer typecheck | Passed. |
| ESLint on changed TypeScript files | Passed. |
| Vite compilation of all three application parts | Passed. |
| Renderer Vite startup with Windows-invalid filename behavior simulated under Node 24 | Old configuration reproduced the error; corrected configuration served HTML, `main.tsx`, and `App.tsx`. |
| Current Ankama bundle patch rules | Resulting JavaScript parsed; `singletons` and `CharacterDisplay` were exposed. |
| Updater against real HTTP with a temporary directory | Completed. A second update reused the cache; obsolete-file removal passed. |
| Original eight-tab navigation, close, and reorder | Passed against the real store in `repair.6`. |
| Tab selection and notification/focus choice | Logic passed with simulated events; user confirmed turn-based selection. Desktop notification/focus settings remain untested manually. |
| Electron packaging for Windows | Not verified. |

## Four-tab limit

The current regression suite passed all 76 tests on Linux with Node 24.22.3 and Yarn 1.22.22. `build:code` passed type checking and the main, preload, and renderer builds.

Tests cover attempts to open a fifth tab, closing a tab to make room, restoring a larger saved team in order while preserving its roster, and using only the first four shortcuts from older settings. Windows UI verification and four signed-in accounts remain in the [manual test plan](manual-test-plan.md#manual-test-matrix).

## Manual results reported by the maintainer

| Scenario | Result and limit |
| --- | --- |
| Native Electron window and game start on Windows | Window and authentication reached. |
| Ankama login, callback, server/character selection, and character creation | Confirmed on Windows in repair.3. The observed protocol version matched (`1595`). |
| Single-account map entry | Confirmed after repair.4; portraits/audio were the remaining reported issues at that stage. |
| Two simultaneous accounts and party | Confirmed on Windows with one Ankama account and one guest after the Albuera solo area. |
| Combat with two accounts and automatic turn-based tab switching | Confirmed after cumulative repairs. |
| Tab portraits and background audio | User confirmed portraits and music worked without restarting when switching apps. Physical output was not measured. |
| Zaap menu and party prospecting icon | User confirmed both working on Windows. Zaapi behavior and party total updates were not separately characterized. |
| In-game store | User confirmed it loaded correctly; purchases and long sessions were not tested. |
| Four live accounts and notification-only versus window-focus behavior | Not tested. |
| Intermittent Ankama Connect error | One occurrence did not recur after restarting; no diagnosis or additional code fix was established. |
| Legacy auto-follow and remaining mods | Not enabled or validated by this repair. |

## Integration tests and scope

| Area | Evidence and limitation |
| --- | --- |
| Authentication callback (`dofustouch:`), cancellation, and separate popup sessions | Passed with real application logic and simulated Electron windows; CSP/sandbox were retained. This does not prove a live Ankama login. |
| WebAuth module from game build 1.74.13 | Executed in a VM with simulated network for regular login, guest login, PKCE, and token exchange. |
| Public news images from `static.ankama.com` | Two images returned HTTP 403 with the local referer and 200 without it; the header rule was corrected. |
| Current `shortcutBarManager` | Real mod tested against current structure, including controlled-character bar selection and listener cleanup. |
| Native connection continuation before optional mods | Tests require character data connection and map request before optional mod initialization. |
| Session teardown and mod failures | Passed with real manager, MST store, and simulated windows/events. |
| Portrait rendering contract | Tested with simulated components. User later confirmed portraits displayed correctly on Windows. Actual WebGL rendering was not visually inspected by the automated test. |
| Audio adaptation | Module executed in a VM; handlers that stop loops were removed while map/combat callbacks remained. User confirmed background audio behavior; physical audio output was not tested by automation. |
| Zaap/zaapi search and party indicator | Real mods passed against a minimal structural DOM, not a visual layout engine. User confirmed zaap menu and prospecting icon. |

The updater test used substitutes for its Electron window and store while retaining project download/write logic. It validates asset handling, not the full game client. Observed live client data were build `1.74.13` and app `3.14.2`; no account was used in automated tests.

The legacy file named `icon.png` in the pinned revision contains encoded text rather than a PNG image. Its bytes were preserved and compared with the original revision; removed popups no longer use it. Binary preservation tests use controlled content.

Fixtures under `tests/fixtures` reproduce the bootstrap at `0327e6986a1ab78900667c79663d0b2215894058`. Trailing spaces in blank HTML lines were removed.

Dependency installation was performed with lifecycle scripts disabled. Native module preparation and executable packaging were not run in the Linux validation environment. Project code was compiled using Node.js 24.22.3, Yarn 1.22.22, and lockfile-pinned TypeScript 4.7.4. On the user's Windows machine, `prepare:desktop` successfully prepared Electron, argon2, and native-keymap; the original `yarn dev` then failed on the renderer's `node:test` directory name. The corrected configuration removed Node/Electron module bridge plugins because the UI already uses the preload API. A Linux test simulated Windows-invalid names, reproduced the old failure, and verified HTTP 200 for the corrected renderer assets. This does not replace launching the native window on Windows.

## Known limitations

Electron remains at `19.0.11`, inherited from the original project. Runtime modernization, security review, four-account testing, compatibility of remaining mods, and long sessions remain pending. This work is not a complete application or dependency security audit.

Repair.3 replaces the desktop WebAuth opener that evaluated code in a remote page. It retains the native PKCE and authorization-code token exchange. The new popup starts at HTTPS `auth.ankama.com` with the DOFUS Touch parameters and no preload, Node integration, or Windows protocol registration. Navigation/window-open handlers consume the callback before the operating system can handle it and return the result through IPC to the requesting tab. Tests use `BrowserWindow` substitutes and emitted events; they do not verify Chromium visuals or live authentication.

Repair.4 addresses the first Windows console exception in `shortcuts.ts`: reading `_panels` from obsolete `gui.shortcutBar`. The current bundle uses `shortcutBarManager.shortcutBars.playerBar` and `heroBar`. Native `characterSelectedSuccess` fires inside `playerData.connectModules`, before the rest of that function and `GameContextCreateRequestMessage` have completed. A synchronous optional-mod failure could therefore interrupt map entry and leave character state incomplete. The new session schedules optional work for the next task, isolates individual mod failures, and removes handlers on teardown. Tests exercise the actual manager and shortcut mod with simulated game/DOM events.

Repair.5 mounts the temporary character-display component under the native Wui tree at `gui.wBody`, waits for the canvas/assets, exports a PNG, and releases the component. The game component's `resize` method requires this Wui context; moving its DOM to the React window alone is insufficient. The audio adaptation removes only the native `appGoBackground`/`appLeaveBackground` pair that called `setMute` and stopped/restarted looped tracks. Other lifecycle callbacks remain. User confirmation provides the manual evidence for portraits and background audio.

Repair.6 replaces repeated zaap field injection with one field per body, filtering destination rows while preserving native favorites and controls. A mutation observer refreshes filtering and is removed on teardown. The broken party icon referenced a nonexistent local asset; the current game CSS already defines `.iconProspecting` with a versioned official CDN URL. Totals are read after native event processing. Auto-follow code and options were left unchanged.

## Repair revisions

The original baseline was `b7233eb233a0ea655f4e314ba5166e7db6363b72` (2022-11-17). The functional repair series is:

| Revision | Scope |
| --- | --- |
| `d1b3201` | Updater and bootstrap recovery. |
| `1788cc5` | Eight-tab store and optional foreground behavior. |
| `f90156f` | Node 24 / Windows Vite `node:test` invalid directory fix. |
| `1393fe6` | Desktop OAuth callback and news request headers. |
| `52331c4` | Character/map entry, mod lifecycle, and shortcut APIs. |
| `c296b0d` | Audio and portraits. |
| `7d6708d` | Zaap and party indicator; functional `repair.6` reference. |

The documentation and repository organization were added after the functional repair series and do not change executable code. See the [repair report](../history/repair-report.md) and [CSV inventory](../history/repair-file-inventory.csv) for scope.
