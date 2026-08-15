# Code signing policy

This project signs and distributes its Windows release artifacts. This document
states which artifacts are signed, how they are built, and who approves signing.

## Windows — SignPath Foundation (application pending)

We are applying for the [SignPath Foundation](https://signpath.org) open-source
code signing program. Planned statement (required by the program, if approved):

> Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org)

Status: **pending approval**.

### What is signed

Release artifacts published on GitHub Releases:

- `DeepWharf-Setup-<version>-x64.exe` — NSIS one-click installer
- `DeepWharf-Portable-<version>-x64.exe` — portable build

Inner executables inside the installer payload are signed by the local signing
hook during CI builds. After program approval this will be refined so every
executable is signed by SignPath (see `.github/workflows/release.yml`).

### Build and signing process

- Release artifacts are built by the GitHub Actions workflow
  (`.github/workflows/release.yml`) on GitHub-hosted `windows-latest` runners,
  from tagged commits (`v*`).
- The embedded Node.js runtime and Harness (`dsh`) versions are pinned in
  `build-versions.json` and verified by checksum during the build.
- Only CI-built artifacts are submitted for signing. Local builds are never
  published as releases.
- The private key is held by SignPath on an HSM. This project never stores or
  handles the private key.

### Team roles (single-maintainer project)

- Author / Maintainer / Approver — https://github.com/sdf123098
  - All external pull requests are reviewed by the maintainer before merge.
  - Each signing request is explicitly approved by the maintainer.

## Local (development) builds

- Local builds use a self-signed test certificate via `scripts/sign.js`
  (`DEEPMHARF_SIGN_MODE=test`) for internal testing only; they are never
  distributed as releases.
- To sign locally with a commercial certificate, set `CSC_LINK` /
  `CSC_KEY_PASSWORD` and `DEEPMHARF_SIGN_MODE=pfx`.
- `DEEPMHARF_SIGN_MODE=none` produces an unsigned build (CI without secrets).

## Distribution locations

- https://github.com/sdf123098/deepwharf/releases

## Privacy

- DeepWharf is a local desktop application. Harness user data (sessions,
  profiles, settings) is stored in the user profile (`%APPDATA%\DeepWharf`).
- The shell itself collects no telemetry. It contacts external services only
  when the user performs an explicit action: checking for updates or using the
  plugin store contacts the npm registry; the Harness runtime contacts the
  user-configured model API.
