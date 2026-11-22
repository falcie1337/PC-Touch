# Security policy

PC-Touch is experimental. The Electron runtime and legacy permissions in the main window require further review; see the [roadmap](docs/project/roadmap.md). Restoring basic functionality is not a complete security audit.

## Reporting a vulnerability

Do not publish credentials, an exploit that uses real accounts, or sensitive reproduction details in a public issue. Use GitHub's **Report a vulnerability** option on the **Security** tab if private vulnerability reporting is enabled for this repository. Otherwise, contact the maintainer through a private channel before sharing sensitive details. This file does not claim that private reporting is enabled.

Include the affected version or commit, platform, component, and a sanitized description of the impact. No response time or reward is promised.

## Sanitizing diagnostic information

Remove account passwords, guest-account credentials, master passwords, cookies, OAuth/PKCE codes, access and refresh tokens, and authentication URLs containing sensitive parameters. Full screenshots and application snapshots may expose personal information as well.

The maintainer does not need your credentials to investigate an error. Prefer synthetic test data and describe which step failed. Removing a secret from a message or commit does not guarantee that it is no longer accessible; use the service's account controls to revoke or rotate exposed credentials.

## Before distributing builds

Review the Electron runtime, IPC boundaries, navigation, credential persistence, and artifact provenance before publishing distributable builds. Do not disable TLS validation, dependency integrity checks, or security alerts just to hide an installation failure.
