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

| Command                         | What it does                                                                  | Why it is useful                                                                                                                                                           |
| ------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                      | Runs the public-boundary checks and the full Vitest suite one time with coverage. | Use it to run all tests.                                                               |
| `npm run test:watch`            | Runs affected tests again when files change. Coverage stays enabled.             | Use it during development to get test results quickly.                                  |
| `npm run test:ui`               | Opens the Vitest UI with coverage enabled.                                       | Use it to examine and filter test results. You can also examine failures interactively. |
| `npm run test:update-snapshots` | Runs the test suite and replaces stored snapshots with the current output.       | Use it only for an intentional output change. Examine the snapshot differences first.  |

## Build and inspect a tarball

From either package directory:

```shell
npm run pack
```

The command writes the tarball below `dist/<package-name>-package/`. The `prepack` script builds the package. It copies these files into the publish directory before `npm pack` runs:

- The package directory `README.md`.
- The repository `LICENSE`.
- A clean `package.json`.

The release workflow does the same pack operation. It makes sure that the archive contains these files:

- `package/README.md`.
- `package/LICENSE`.
- `package/package.json`.

The workflow also does a smoke test of the executable. Then, it publishes that tarball. npm shows the applicable README:

- `projects/vsts-npm-auth-improved/README.md` for `vsts-npm-auth-improved`;
- `projects/create-vsts-npm-auth-improved/README.md` for `create-vsts-npm-auth-improved`.

The repository-root `README.md` is not included in either npm package.
