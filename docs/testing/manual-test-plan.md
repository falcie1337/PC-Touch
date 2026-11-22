# Manual test plan

This document tracks scenarios for targeted testing. Testers do not need to run the entire matrix. The initial scope is Windows x64; Windows 11 x64 is the environment confirmed so far. The [validation record](validation.md) contains observed results. An unchecked scenario may simply be untested.

## Short smoke test

1. Start the application, update the game, and reach the start screen.
2. Sign in using the intended method and enter a character.
3. Move between several maps and open/close an interface such as inventory or the store.
4. Close and relaunch the application without deleting application data.

Report the action and the first relevant error. Passing this smoke test does not validate every mod or saved-account behavior.

## Manual test matrix

| ID | Scenario and expected result | Current evidence |
| --- | --- | --- |
| T01 | Prepare and launch on a clean Windows 11 x64 profile with Node 24/Yarn 1.22.22; do not copy `node_modules` from another PC. | One maintainer machine prepared; tester machines pending. |
| T02 | Guest login, server selection, character selection, and map entry. | Confirmed by maintainer. |
| T03 | Ankama login returns to the game without requiring a Windows protocol handler. | Confirmed; a separate intermittent error remains unexplained. |
| T04 | Existing guest → another account, cancel, retry, close/reopen; retain the guest and return to the correct tab. | Full matrix pending; see H03 in the roadmap. |
| T05 | Interleave two login attempts and complete them out of order; each result belongs to its originating attempt. | Popup simulations exist; full storage/PKCE integration pending. |
| T06 | Two accounts in one window, grouped and in combat; select the tab whose character's turn begins. | Confirmed with two accounts. |
| T07 | Open four tabs. The add button disappears and the new-tab shortcut keeps the same selection and order. Close one tab and open another. Repeat tab cycling and reordering with four signed-in accounts. | Store tested. Windows UI and four live accounts pending. |
| T08 | Saved shortcuts and Ctrl+Tab/Shift+Tab with US and ABNT2 layouts; no unintended command while typing. | Existing arrow-key shortcuts confirmed; requested combinations pending. |
| T09 | With background audio allowed, switch applications/minimize/restore without restarting the track. | Confirmed by maintainer. |
| T10 | Test foreground-only audio and global/window mute options, including preference changes while unfocused. | Simulated tests passed; full manual matrix pending. |
| T11 | Portrait appears after selection and updates on character/tab changes without stale images or accumulated components. | Portraits confirmed; repeated/long-session tests pending. |
| T12 | Open/reopen zaap, search without accents, and use favorites without duplicate fields; repeat for zaapi where available. | Zaap menu confirmed; subcases/zaapi not separately characterized. |
| T13 | Party prospecting icon and totals update after members join/leave/reconnect. | Icon confirmed; total updates not separately characterized. |
| T14 | Store loads and closes; gameplay continues without a grey/blank panel. | Confirmed; no purchase transaction was tested. |
| T15 | Repeat disconnect/reconnect/character changes without duplicate notifications, fields, timers, or listeners. | Manager logic tested; long manual sessions pending. |
| T16 | Updater recovers or reports failure for missing assets, failed streams, interruption, and channel changes; never reports false success. | Automated cases and real HTTP run recorded; full manual matrix pending. |
| T17 | Saved-account/team login and restoration remain optional and preserve existing data. | Legacy behavior requires review; see F03/H04. |
| T18 | Validate optional mods individually and record game version/API/context. | Full compatibility review pending. |

## Turn notification and window focus

Tab selection and desktop window focus are separate behaviors. These scenarios depend on game options and operating-system notification settings.

| Configuration | Expected behavior when another tab's turn begins |
| --- | --- |
| Auto-select on; bring-to-front off; notifications on | Select the account and attempt a notification without requesting desktop focus/restore. |
| Auto-select and bring-to-front on | Select the account and request focus/restore; notification remains governed by its own option. |
| Auto-select off; notifications on | Keep the current tab and attempt a notification. |
| Notifications off; auto-select on | Select the account without requiring notification creation. |
| System blocks notifications | Notification failure must not prevent configured tab selection or focus behavior. |
| User clicks a turn notification | Request focus and select the associated account. |

Repeat with the window behind another window, minimized, and in the foreground. A monster turn or another account's character must not select the wrong tab. For Linux results, record the desktop environment and its focus policy.

## Performance observations

Compare versions on similar machines and scenarios. Record account count, resolution/scaling, map/activity, enabled mods, session length, and CPU/memory/GPU observations. Start with one, two, and four accounts.

Look for trends across close/reopen cycles rather than one memory reading. Record hangs, duplicated events, increasing usage, and when they begin. Choose performance targets only after gathering a baseline.

## Recording a result

```text
Scenario ID:
Application version/commit:
Game build, if available:
Operating system/architecture and Node version:
Tab count / keyboard layout:
Steps performed:
Expected result:
Observed result:
Outcome: passed / failed / not tested / blocked
Sanitized error and notes:
```

Mark only scenarios that were actually exercised as passed. Update the validation record or link the issue/pull request containing the evidence. Do not include passwords or tokens in logs or screenshots. Controlled logic tests do not require the maintainer's real accounts.

## Automated tests

Run `npx --yes yarn@1.22.22 test`. The current suite contains 74 tests and prepares real project modules with TypeScript/esbuild. Electron windows, DOM, network, and events are simulated in several scenarios; passing tests do not establish that live login or CSS rendering works.

For runtime/native-module changes, also prepare and run on the target platform. For store/auth/updater changes, add regressions for relevant failure and cancellation paths. For small copy or styling changes, diff review and visual inspection may be sufficient.
