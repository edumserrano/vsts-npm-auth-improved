# Development, testing, and packaging

## Requirements

- Node.js 24.18.1 or later
- npm 12.0.2 or later
- Windows for automatic npm registry authentication

## Build and test

For `vsts-npm-auth-improved`:

```shell
cd projects/vsts-npm-auth-improved
npm i
npm run build
npm test
```

For `create-vsts-npm-auth-improved`:

```shell
cd projects/create-vsts-npm-auth-improved
npm i
npm run build
npm test
```

See the package-specific [core testing strategy](../../projects/vsts-npm-auth-improved/tests/README.md) and [setup testing strategy](../../projects/create-vsts-npm-auth-improved/tests/README.md) for the public-boundary rules.

## Testing workflows

Run these commands from either package directory:

| Command                         | What it does                                                                  | Why it is useful                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                      | Runs the public-boundary checks and the full Vitest suite once with coverage. | Quick way to run all the tests.                                                                                                                                           |
| `npm run test:watch`            | Reruns affected tests as files change and serves the updated coverage report. | Use it while developing for fast feedback without repeatedly starting the test suite.                                                                                     |
| `npm run test:ui`               | Opens the Vitest UI and serves the coverage report.                           | Best dev experience to get test feedback without repeatedly starting the test suite. Use it to explore test results, filter tests, and investigate failures interactively |
| `npm run test:update-snapshots` | Runs the test suite and replaces stored snapshots with the current output.    | Use it only when an output change is intentional, then review the snapshot diff before committing it.                                                                     |

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
