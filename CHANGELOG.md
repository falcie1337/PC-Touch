# Changelog

## PC-Touch — unreleased source changes

The current functional reference is `3.0.0-rc.12-repair.6`, through commit `7d6708d`. These notes describe the initial recovery work and documentation; they do not indicate that an installer or portable build has been released.

### Compatibility and functionality

- Updated game asset endpoints, repaired cache recovery, and improved download handling.
- Pinned the game bootstrap and restored desktop authentication callbacks without remote `eval` or a Windows protocol-handler dependency.
- Adapted shortcuts to current game bars and delayed optional mods until native character initialization completes.
- Separated turn-based tab selection from desktop window focus.
- Limited each game window to four tabs and four direct tab shortcuts. Larger saved teams open the first four characters in their saved order.
- Repaired portraits, background audio, zaap filtering, and the party prospecting indicator.
- Removed legacy analytics/statistics and abandoned upstream executable-update behavior.

### Tests and documentation

- Added 74 regression tests. Manual Windows 11 testing confirmed two-account combat, the store, portraits, background audio, and zaap UI.
- Added a fork README, roadmap, contribution/security guidance, test matrix, validation record, and repair history.
- Organized public documentation under `docs/`; personal setup and codebase-learning notes are not part of the public documentation set.
- Updated repository references to `falcie1337/PC-Touch`. Distributable binaries remain planned for a later phase.
- Four-account use, the full notification/focus matrix, intermittent authentication behavior, Linux, and packaging remain unverified or pending.

See the [repair report](docs/history/repair-report.md), [validation record](docs/testing/validation.md), and [roadmap](docs/project/roadmap.md) for details and limitations.

## Original Lindo release history

Earlier upstream release notes are preserved in the [original Lindo changelog](https://github.com/prixe/lindo/blob/main/CHANGELOG.md). They describe upstream releases and should not be read as release history for PC-Touch.
