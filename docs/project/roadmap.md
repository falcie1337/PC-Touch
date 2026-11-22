# PC-Touch roadmap

**Functional reference:** `3.0.0-rc.12-repair.6`, through commit `7d6708d`. **Initial plan:** 2026-11-21. This roadmap organizes work for an early community fork; it is not a schedule or a promise that proposed features are implemented.

The initial target is a reproducible desktop client for manual play in one window, with up to four accounts as the practical use case. The application store allows eight tabs, but this has not been validated with eight active accounts. Windows x64 is the current test platform. Linux, beginning with Void Linux glibc/X11, is a future target. Distributable binaries are planned for a later phase.

## Priority levels

| Priority | Meaning |
| --- | --- |
| **P0** | Foundations required before treating the fork as stable: diagnostics, isolation, runtime, and repeatable verification. |
| **P1** | Reliability, compatibility, and maintainability improvements. |
| **P2** | Distribution and quality-of-life work after core dependencies are stable. |

An item is complete when the implementation or investigation is finished, evidence is reviewable, and relevant documentation is current. A visible setting, successful build, or error that disappeared after a restart does not validate an entire workflow.

## Current baseline

- [x] Restore game asset updating and bootstrap for the current client build.
- [x] Restore guest/Ankama login and character entry for the exercised scenarios.
- [x] Confirm two accounts, group play, and automatic turn-based tab selection on Windows.
- [x] Confirm portraits, background audio, zaap search, party prospecting icon, and store.
- [x] Add 74 regression tests and record the repair scope.
- [ ] Publish the repaired state to the fork and record a maintainer reference commit.
- [ ] Complete four-account, notification/window-focus, and long-session testing.
- [ ] Modernize the runtime, security boundaries, CI, and distribution process.

Completed items refer only to evidence in the [validation record](../testing/validation.md); they do not imply that every game mod or workflow is defect-free.

## Suggested milestones

| Milestone | Scope | Exit condition |
| --- | --- | --- |
| **M0 — preserve the baseline** | H01–H02; import the repair into the fork; run initial tester checks. | A known revision, repeatable checks, and actionable issue reports. |
| **M1 — reduce fragility** | H03–H06, as separate changes. | Authentication/account tests pass without cross-session state; runtime and trust boundaries are reviewed. |
| **M2 — maintain and distribute** | H07–H11; complete the Windows matrix. | Recoverable updates, diagnosable mods, and a Windows artifact validated on a clean machine. |
| **M3 — Linux** | L01–L03, after a known Windows baseline. | Documented Linux setup and execution without Windows regressions. |
| **M4 — quality of life** | F01–F08 according to interest and dependencies. | Each selected feature is proposed, tested, and documented independently. |

Small fixes and learning work do not need to wait for an entire milestone. A major Electron upgrade should have its own branch, tests, and rollback reference.

## Codebase health

### H01 — CI and reproducible baseline · P0

The inherited workflows use Node `16.15.1`, older GitHub Actions, and do not explicitly run the new regression suite. Legacy `LINDO_KEY` configuration also needs review.

**Areas:** `.github/workflows`, `package.json`, `yarn.lock`, build and test scripts.

- [ ] Record the fork's initial commit and the platform/toolchain matrix that passed.
- [ ] Update CI to the project's selected Node/Yarn versions and currently supported action versions.
- [ ] Separate checks that do not need Electron native modules from platform-specific preparation/build jobs.
- [ ] Run tests, typecheck, and code build without account credentials or secrets from the legacy service.
- [ ] Limit workflow permissions; untrusted pull-request code must not receive secrets.

**Done when:** a clean checkout passes the declared checks, logs identify the revision/toolchain, and CI runs the documented checks. Do not hide lint failures just to obtain a green status.

### H02 — Diagnostics and observability · P0

Generic errors obscure the failed stage, while complete logs and snapshots may contain account data.

**Areas:** main-process logger, authentication flow, `GameManager`, updater, and store synchronization.

- [ ] Standardize stage, severity, error code, and local tab/attempt ID.
- [ ] Distinguish authentication window startup, cancellation, callback, token exchange, and game connection errors.
- [ ] Sanitize URLs, messages, and snapshots before logging or exporting diagnostics.
- [ ] Document a minimal bug report and test sanitization with synthetic secrets.

**Done when:** failures can be located without exposing passwords, cookies, tokens, or sensitive OAuth parameters. Preserve the sanitized original error instead of replacing it with artificial success.

### H03 — Authentication and account isolation · P0

An intermittent Ankama Connect failure has not been reproduced or explained. OAuth popups use separate temporary sessions, but game iframes share an origin. Native client keys such as `CODE_VERIFIER` and `WEBAUTH_TYPE` need review for multi-tab behavior.

**Areas:** `windows/auth-window.ts`, preload, `GameScreen.tsx`, `game-patches.ts`, and client storage APIs.

- [ ] Reproduce guest → another account without converting or deleting the guest account.
- [ ] Test overlapping attempts, out-of-order callbacks, cancellation, and closing the requesting tab.
- [ ] Identify which state belongs to an attempt, tab, account, or application profile.
- [ ] Prevent stale callbacks/state from being delivered to another attempt while preserving PKCE and the official token exchange flow.
- [ ] Test cancellation and restart without requiring users to erase local data.

**Done when:** concurrency tests do not mix codes, verifiers, or login modes, guest accounts remain accessible, and the reported failure has evidence-based handling. Do not attribute the intermittent failure to shared storage without a reproducer.

### H04 — Account and credential persistence · P0

The legacy master-password/saved-account system requires review and a migration plan. Successful manual login does not establish that saved credentials are safe or compatible.

**Areas:** `main/multi-account.ts`, main-process store, `gameMultiAccount` models, and saved-login flow.

- [ ] Map persisted fields, protection, and possible logging paths.
- [ ] Define a migration compatible with existing user data before changing formats or libraries.
- [ ] Test wrong master password, password changes, corrupted stores, and cancellation without silent data loss.
- [ ] Evaluate operating-system credential protection on target platforms and document its limits.

**Done when:** migration tests use synthetic data, failures do not overwrite the original store, and credentials do not appear in logs or preference exports. Saved login remains optional; manual play must not depend on it.

### H05 — Electron, IPC, and navigation boundaries · P0

The main window still has legacy `webSecurity: false`, `sandbox: false`, and `allowRunningInsecureContent: true` settings. The authentication window has its own protections; that does not automatically secure other contexts.

**Areas:** `main/windows`, IPC handlers in `application.ts` and stores, and preload APIs.

- [ ] Inventory privileged operations and identify which frames may call them.
- [ ] Validate sender and arguments for every handler, not just authentication handlers.
- [ ] Restrict navigation, external links, permissions, and preload exposure to what is required.
- [ ] Find a compatible way to serve/load the game that permits removing legacy permissions.
- [ ] Review the CSP of each context and document any necessary temporary exceptions.

**Done when:** invalid calls are rejected, one context cannot gain another's privileges, and the effective runtime settings are verified. Changing flags without testing login, assets, and iframes is not completion.

### H06 — Runtime and native dependencies · P0

The application remains on Electron `19.0.11`, with old TypeScript/Vite and native modules. Installing Node 24 on the host does not update the Node runtime embedded in Electron.

**Areas:** `package.json`, lockfile, Vite, `argon2`, `native-keymap`, preload, and packager.

- [ ] Select an Electron release supported at migration time and map relevant API changes.
- [ ] Upgrade in reviewable steps while retaining a known working reference.
- [ ] Update or replace incompatible dependencies with a clear rationale; do not improvise cryptography.
- [ ] Verify native module rebuilds, sandbox/preload, keyboard input, login, WebGL, and audio.
- [ ] Remove dependencies only when proven unused and review Node/Python/toolchain requirements.

**Done when:** clean installation, project checks, and live-client smoke tests pass on the selected runtime with versions and limitations recorded. Do not erase accounts or preferences as a compatibility workaround.

### H07 — Recoverable updater and integrity · P1

Assets are downloaded to temporary files and manifests are written only after success, but updating the entire directory is not an atomic transaction.

**Areas:** `main/updater`, manifests, cache, and channel selection.

- [ ] Validate remote URL schemes/origins and local destinations against the real manifest/CDN format.
- [ ] Test process interruption at each phase, mixed caches, and production/early channel switching.
- [ ] Plan recoverable staging/commit for critical files and metadata.
- [ ] Verify integrity against trustworthy manifest data where available; do not guess the meaning of version fields.
- [ ] Improve progress and file/status diagnostics; evaluate cancellation/resume without false success.

**Done when:** an interrupted update is recovered or clearly rejected on next launch without a partial bootstrap or loss of account data. Cover stream, disk-write, and restart failures.

### H08 — Game client API adaptation · P1

Mods depend on private client objects and bootstrap regular expressions, which can change after a game update.

**Areas:** `dofus-window`, `game-patches.ts`, bootstrap `regex.json`, and mods.

- [ ] Centralize mutable API access in small adapters, such as the shortcut-bar resolver.
- [ ] Document assumptions per transformation and verify match counts for critical rules.
- [ ] Make optional incompatibilities diagnosable and independently disableable without blocking native game entry.
- [ ] Add small synthetic fixtures for regressions without committing the proprietary game client.
- [ ] Review `GAME_PATCH_REVISION` and test an existing cache when transformations change.

**Done when:** important incompatibilities produce useful errors, optional mod failures do not break the native flow, and fixtures cover the observed contracts.

### H09 — Lifecycle, performance, and types · P1

The game manager has additional safeguards, but late mod callbacks, reconnections, timers, and DOM changes still need per-mod review.

- [ ] Review listener, timer, observer, and Wui component cleanup in each mod.
- [ ] Repeat login/close, reconnect, and character-switch scenarios while checking for accumulated callbacks or DOM nodes.
- [ ] Measure memory, CPU/GPU, and responsiveness with one, two, and four accounts; record scenario and duration.
- [ ] Resolve type/lint errors against actual contracts and reduce unjustified assertions and dead code.

**Done when:** repeated scenarios do not accumulate resources and reports identify likely bottlenecks. Do not set arbitrary RAM/FPS targets without a reference machine and workload.

### H10 — Windows artifacts and fork identity · P1

Testers still need a clean setup, and the packager retains upstream identity and links.

- [ ] Define the fork's product name, URLs, and `appId` while preserving authorship and license notices.
- [ ] Plan application-data location and migration if application identity changes.
- [ ] Produce portable/ZIP and installer artifacts separately; test on a clean Windows profile without Node or development tools.
- [ ] Associate artifacts with source commits, record the build process, and publish checksums.
- [ ] Verify install, first update, relaunch, uninstall, and intended data preservation.

**Done when:** a distributable works without the development checkout and is attributable/reproducible. A target in `electron-builder.json` alone is not evidence. Automatic binary updates are a later decision and require a maintainer-controlled destination.

### H11 — Update and regression process · P1

- [ ] Maintain a short smoke-test matrix for both game and application changes.
- [ ] Link compatibility reports to the observed game version/build.
- [ ] Separate the fork changelog from upstream history and record actual test scope per release.
- [ ] Use small branches/pull requests and retain a known revision for rollback.

**Done when:** regressions can be tied to a revision and reproduced from report details, and each release states what was actually verified.

## Linux

### L01 — Void setup and execution · P1, after M0

Revalidate the upstream Linux build, beginning with Void Linux **glibc, x64, and X11**. Identify actual native dependencies, prepare Electron, and verify login, map entry, assets, audio, keyboard, and shutdown.

**Done when:** a fresh system/profile can follow Void-specific instructions without relying on undocumented packages or environment variables. Do not infer musl or Wayland support from glibc/X11 results.

### L02 — Desktop integration · P1, depends on L01

Check notifications, focus/restore behavior under the window manager's rules, US/ABNT2 layouts, shortcuts, HiDPI, data/cache locations, and audio integration. Desktop policies may deny focus requests; document observed behavior and keep a notification alternative.

**Done when:** results identify the desktop environment and do not promise universal focus behavior.

### L03 — Linux distribution and platform matrix · P2, depends on L01/L02

Choose a package format after validating actual dependencies. Test C libraries, graphics libraries, native modules, icons/desktop files, and paths. Add confirmed targets to CI without removing Windows smoke tests.

**Done when:** the package is tested outside its build machine and requirements are documented. Inherited AppImage/tar/deb targets alone do not prove compatibility.

## Candidate features and follow-up testing

| ID | Scope | Dependencies and acceptance criteria |
| --- | --- | --- |
| **F01** | Validate notification-only versus bringing the window to the foreground. Turn-based tab selection is confirmed with two accounts. | Use the [manual matrix](../testing/manual-test-plan.md): minimized/background states, blocked notifications, and notification clicks; respect user preferences. |
| **F02** | Validate four accounts and US/ABNT2 shortcuts; consider Ctrl+Tab/Shift+Tab and existing preferences. | Correct cycling after close/reorder; no unintended command while typing; performance measured under H09. |
| **F03** | Fix/validate optional saved-account login. Legacy `_login(character.account, password, false)` does not match the currently observed signature. | Depends on H03/H04; manual login must remain available; test migration and existing data. |
| **F04** | Fix marketplace sale notifications. `_sendHdvSaleNotif` still uses an old domain and fixed data version. | Use current suitable data and handle failures without blocking gameplay. |
| **F05** | Validate remaining mods: damage preview, health bars, map resources, job/harvest tools, exchanges, timeline, and timers. | Test each against current APIs, including cleanup and disable behavior. Opening the game does not validate all mods. |
| **F06** | Consider a Brazilian Portuguese Lindo UI translation and accessibility/HiDPI improvements. The game's language does not translate Lindo automatically. | Keep UI catalogs/types separate; check truncation, navigation, contrast, and visuals. |
| **F07** | Consider preference profiles/export and a compatibility diagnostics panel. | Depends on H02/H04/H08; export only defined fields, never credentials; validate imported data/version. |
| **F08** | Evaluate legacy `AutoGroupMod` auto-follow at a later stage. It was not adapted or enabled in the repair. | Decide scope and assess compatibility/policy before promising behavior; test independently. |

F06–F08 are candidates for discussion, not promised features. Documenting or testing legacy behavior does not mean it is enabled by default.

## Using the roadmap

Create one issue per goal when Issues are available, reference the item ID, and split large work into focused pull requests. Update the [manual test plan](../testing/manual-test-plan.md) and [validation record](../testing/validation.md) when evidence changes. Do not mark a whole milestone complete because one subtask passed.

Useful references: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security/), [native Node modules](https://www.electronjs.org/docs/latest/tutorial/using-native-node-modules), [node-gyp](https://github.com/nodejs/node-gyp), and [contributing](../../CONTRIBUTING.md). Verify tool and runtime versions when starting the relevant work.
