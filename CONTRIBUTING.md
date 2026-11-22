# Contributing to PC-Touch

PC-Touch is a community-maintained fork of [Lindo No-Emu](https://github.com/prixe/lindo). The first priority is keeping confirmed behavior reproducible while improving the maintenance and release process. Check the [roadmap](docs/project/roadmap.md) before starting larger changes.

## Report a bug or propose a change

Search existing issues before opening a new one. For a bug report, include:

- The application version or commit and the game build, if known.
- Operating system and architecture, number of open tabs, and relevant settings.
- Short steps to reproduce, expected behavior, and observed behavior.
- Sanitized error messages or logs. Remove account details, cookies, OAuth codes, and tokens.

Intermittent issues are still useful to report; describe when they occur rather than inventing a deterministic reproduction. Use the private reporting route in [SECURITY.md](SECURITY.md) for suspected vulnerabilities or exposure of sensitive data.

Feature proposals should identify the user problem and a way to evaluate the result. Link a roadmap item when applicable. Changes involving authentication, persistence, new dependencies, or major architecture should be discussed before implementation expands.

## Development workflow

1. Start from a known commit and create a branch for one focused change.
2. Keep changes cohesive. Avoid combining unrelated Electron upgrades, authentication changes, and UI refactors.
3. Update shared types, localization catalogs, and generated localization types when needed. Types in `dofus-window` describe the game client's observed API; they do not implement that API.
4. Clean up listeners, timers, observers, and DOM/Wui elements created by a feature when its session ends. Preserve native handlers and handlers owned by other mods.
5. Run checks relevant to the change and exercise the affected behavior. Record what could not be tested.
6. Review the full diff before committing. Ensure proprietary game files, account data, `node_modules`, and generated output are not included.
7. Open a pull request against the intended repository and base branch. For work in a fork, verify the destination before submitting.

Example branch command:

```sh
git switch -c fix/short-description
```

## Validation

Choose checks that provide evidence for the code changed:

| Change | Useful validation |
| --- | --- |
| Documentation | Validate relative links, commands, code references, and `git diff --check`. |
| Store or preferences | Typecheck, behavior tests, and compatibility with persisted settings. |
| Game mod or lifecycle | Exercise the affected scenario, close/reopen or reconnect, and check for duplicate callbacks or UI. |
| Updater, authentication, or persistence | Cover success, failure, and cancellation with controlled data; run a separate real-client test where appropriate. |
| Electron or native dependencies | Build, prepare native dependencies, and smoke-test on the target platform. |

Available project checks include:

```sh
npx --yes yarn@1.22.22 typecheck
npx --yes yarn@1.22.22 test
npx --yes yarn@1.22.22 build:code
git diff --check
```

`build:code` already runs the typecheck. The global legacy lint command may report existing issues; linting selected changed files does not establish that the entire project is lint-clean. Existing upstream CI workflows also need modernization.

## Repository conventions

- Edit source under `packages`, not generated files under `dist`, dependencies under `node_modules`, or only the downloaded game cache.
- For Lindo interface text, edit the localization catalogs and regenerate their types. The game language is separate from the Lindo interface language.
- When changing the bootstrap or bundle transformations, review `GAME_PATCH_REVISION` and test behavior with an existing cache.
- Add regression coverage for meaningful behavior. Prefer assertions about observable outcomes over tests that repeat the implementation.
- Keep `package.json` and `yarn.lock` consistent when changing dependencies. Explain why an update is required and avoid unrelated major-version changes.
- Do not suppress network, authentication, or native-module errors just to keep the application opening.

## Data, attribution, and releases

Logs and snapshots may contain credentials. Use synthetic data in tests and inspect diffs before publishing. Keep the original license, upstream credits, and applicable third-party notices. The project code remains under GPL-3.0; this does not grant rights to proprietary game assets or services.

A successful build is not a release. Before distributing a binary, associate it with its source revision, document the build process, and validate installation and startup on the target platform. No distributable binary has been validated for this fork yet.
