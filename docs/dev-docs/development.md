# Development, testing, and packaging

## Requirements

- Node.js 24.18.1 or later
- npm 12.0.2 or later

Each package owns its dependencies, lockfile, build, tests, and release tarball. Run commands from the package directory you are changing.

## Build and test

For `vsts-npm-auth-improved`:

```shell
cd projects/vsts-npm-auth-improved
npm ci
npm run build
npm test
```

For `create-vsts-npm-auth-improved`:

```shell
cd projects/create-vsts-npm-auth-improved
npm ci
npm run build
npm test
```

Both packages also provide these test workflows:

```shell
npm run test:watch
npm run test:ui
npm run test:update-snapshots
```

`build` cleans `dist` before compiling the library and test TypeScript. `test` cleans `test-reporters` before running Vitest with coverage. See the package-specific [core testing strategy](../../projects/vsts-npm-auth-improved/tests/README.md) and [setup testing strategy](../../projects/create-vsts-npm-auth-improved/tests/README.md) for the public-boundary rules.

## Package module formats

`vsts-npm-auth-improved` publishes a CommonJS CLI. `create-vsts-npm-auth-improved` publishes an ESM-only CLI, matching its Node.js 24 minimum and its ESM dependencies. Neither package exposes a supported programmatic API; consumers should invoke the npm executable.

## Build and inspect a tarball

From either package directory:

```shell
npm run pack
```

The tarball is written beneath `dist/<package-name>-package/`. The `prepack` script builds the package and copies that package directory's `README.md`, the repository `LICENSE`, and a cleaned `package.json` into the publish directory before `npm pack` runs.

The release workflow performs the same pack operation, inspects the archive for `package/README.md`, `package/LICENSE`, and `package/package.json`, smoke-tests the executable, and publishes that exact tarball. Consequently, the README displayed on npm is:

- `projects/vsts-npm-auth-improved/README.md` for `vsts-npm-auth-improved`;
- `projects/create-vsts-npm-auth-improved/README.md` for `create-vsts-npm-auth-improved`.

The repository-root `README.md` is not included in either npm package.

## Prerelease version policy

During the prerelease phase, `create-vsts-npm-auth-improved` writes the npm `alpha` dist-tag for `vsts-npm-auth-improved` into managed projects instead of a fixed version range. Publishing a new core alpha therefore does not require a matching setup-package source change. Before the stable release, change the managed core spec to `latest` and publish a new setup-package version.

See [Creating releases](releases.md) for the automated release process.
