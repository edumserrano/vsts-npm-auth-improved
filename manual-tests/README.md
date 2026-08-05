# Published-package manual tests

These projects exercise the packages published to npm. They are fixtures, not automated tests.

## Prerequisites

- Node.js 24.18.1 or later
- npm 12.0.2 or later
- Windows for the `registry-auth` authentication flow
- Access to the configured LexisAdvance Azure DevOps Artifacts npm registry

## Initializer command

Run the initializer from the project being tested:

```powershell
npm init vsts-npm-auth-improved@alpha
```

Use `.` as the search root unless a scenario says otherwise. After initialization, inspect the
changes before continuing:

```powershell
git diff --no-index -- NUL package.json
Get-Content .npmrc
npm run install-packages
npm run registry-auth
```

Run the initializer a second time to check idempotency. Already configured files should remain
unchanged.

## Scenarios

### 01-clean

A minimal npm project without an `.npmrc`. Select its `package.json` and enter a real Azure
DevOps registry URL. Both managed files and all managed values should be added.

### 02-existing-config

Contains the LexisAdvance global registry plus unrelated npm and package settings. The unrelated
settings, dependency, and scripts should survive.

### 03-scoped-registry-only

Contains only a scoped registry. The initializer should still ask for a global registry while
preserving the scoped registry.

### 04-conflicting-config

Contains incorrect managed values and obsolete `always-auth` settings. Managed values should be
corrected, both `always-auth` entries removed, and unrelated settings retained.

### 05-already-configured

Contains the exact managed configuration already. The initializer should report both files
unchanged.

### 06-monorepo

Run from this directory and use `.` as the search root. Discovery should include the root package,
`apps/api`, `apps/web`, and `packages/shared`. It should exclude `ignored`, `.hidden`, nested
`generated`, and `node_modules`. Test both selecting a subset and selecting `ALL` (reset the
fixture between runs if you want to compare them cleanly).

### 07-path with spaces

Runs the normal setup and authentication flow from a path containing spaces. Enter a real registry
when prompted and confirm the generated npm scripts work without path quoting errors.
