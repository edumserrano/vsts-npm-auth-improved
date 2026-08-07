# vsts-npm-auth-improved

`vsts-npm-auth-improved` wraps and invokes [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) to authenticate npm with private Azure DevOps Artifacts registries on Windows. It adds:

- ✅ An interactive setup to Configure one or more npm projects for automatic npm authentication.
- ✅ A friendlier guided authentication experience.
- ✅ Clearer success and error messages.
- ✅ A one-time automatic retry that can recover from stale or expired tokens.
- ✅ The same npm scripts remain safe to use on macOS, Linux, and CI.

## Configure a project for automatic npm authentication (interactive setup)

From the directory containing one or more npm projects, run:

```shell
npm init vsts-npm-auth-improved
```

Follow the prompts to choose the projects and Azure DevOps Artifacts registry you want to use. The selected projects are updated so authentication runs automatically with either `npm install` (supported on npm 12 and later) or `npm run install-packages` (supported on npm 11 and earlier).

After setup, install packages using the command selected during setup.

For npm 12 and later:

```shell
npm install
```

For npm 11 and earlier:

```shell
npm run install-packages
```

On Windows, authentication happens automatically before npm installs private packages. On macOS, Linux, and CI, the authentication step is skipped so your environment must supply the required credentials.

## Configure a project for automatic npm authentication (manual setup)

Add an npm script with the authentication choices explicitly set:

```json
{
  "scripts": {
    "registry-auth": "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved -c ./.npmrc --read --no-force"
  }
}
```

This command uses `npx` to resolve and run `vsts-npm-auth-improved` before the project's dependencies have been installed. The explicit `--registry=https://registry.npmjs.org/` option fetches the publicly available package from the public npm registry, which does not require authentication. This avoids the chicken-and-egg problem of needing working private-registry credentials before the tool that obtains those credentials can run.

After adding the `registry-auth` command, connect it to package installation with one of the following pre-hook scripts.

For npm 12 and later, use `preinstall` to authenticate automatically before `npm install` or `npm ci`:

```json
{
  "scripts": {
    "registry-auth": "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved -c ./.npmrc --read --no-force",
    "preinstall": "npm run registry-auth"
  }
}
```

This `preinstall` strategy requires npm 12 or later. In npm 7 through npm 11, the root `preinstall` script runs after dependencies have already been fetched and installed, which is too late to authenticate before npm accesses a private registry. npm 12 restores the hook so it runs before dependency installation. See [npm CLI issue #2660](https://github.com/npm/cli/issues/2660) for the history of this behavior.

For npm 11 and earlier, use a custom package-installation command with its matching pre-hook script:

```json
{
  "scripts": {
    "registry-auth": "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved -c ./.npmrc --read --no-force",
    "preinstall-packages": "npm run registry-auth",
    "install-packages": "npm install"
  }
}
```

Install packages with `npm run install-packages` instead of `npm install`. npm automatically runs `preinstall-packages` before `install-packages`, so authentication completes before npm accesses the private registry.

## Use as a global module

Install the CLI globally:

```shell
npm i -g vsts-npm-auth-improved
```

Run the interactive authentication flow:

```shell
vsts-npm-auth-improved
```

For a non-interactive authentication flow, provide all required options on the command line. The available options are described below. Example:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --no-force
```

## Options

| Option                               | Description and default                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `-c, --config-path <paths>`          | One project `.npmrc`, or a comma-separated list. Each file must contain a global `registry`. When omitted, the CLI prompts for one path, defaulting to `./.npmrc`. |
| `-t, --target-config <path>`         | `.npmrc` that receives generated credentials. Defaults to the user npm configuration, normally `~/.npmrc`.                                                         |
| `-e, --expiration-minutes <minutes>` | Positive integer lifetime for a newly acquired token, up to 525,600 minutes (365 days). Defaults to 129,600 minutes (90 days).                                     |
| `--read`                             | Requests a token with Packaging (Read) scope.                                                                                                                      |
| `--no-read`                          | Requests a token with Packaging (Read & Write) scope.                                                                                                              |
| `--force`                            | Forces token acquisition even when an existing token is still valid.                                                                                               |
| `--no-force`                         | Allows reuse of an existing valid token. A failed request is retried once with forced acquisition.                                                                 |
| `-h, --help`                         | Displays command help.                                                                                                                                             |
| `-v, --version`                      | Displays the `vsts-npm-auth-improved` package version.                                                                                                             |

When config path, token scope, or force behavior is omitted on Windows, the CLI prompts for that value.

## Examples

Authenticate with the standard read-only token and non-forced choices:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --no-force
```

Force a new read-only token:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --force
```

Authenticate the registries from multiple project configurations, in order:

```shell
vsts-npm-auth-improved -c ./client/.npmrc,./server/.npmrc --read --no-force
```

Write credentials to a custom npm configuration file:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --no-force --target-config ./credentials/.npmrc
```

Request a new token with a 60-minute lifetime:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --force --expiration-minutes 60
```

## Platform behavior

### CI environments

If invoked in CI, the command detects it's in a CI environment and skips automatic authentication. It warns that authentication must be configured in CI and exits successfully so the npm script can continue.

CI environment detection is done by the [ci-info](https://www.npmjs.com/package/ci-info) package.

### Windows

The command reads the global registry from every selected `.npmrc`, invokes [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth), and writes credentials to the target npm configuration. The target defaults to the user npm configuration at `~/.npmrc` and can be changed with `--target-config`. Failed token acquisition is retried once with forced acquisition unless `--force` was supplied.

### macOS and Linux

Automatic authentication is not available. The command warns that registry authentication must be configured manually, [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) is not invoked, and exits successfully so a cross-platform npm script can continue.

## Why this package was created

`vsts-npm-auth-improved` was created to improve the developer experience while retaining the familiar `vsts-npm-auth` authentication flow on Windows. The interactive setup configures projects for automatic authentication, reducing the manual work required to get started. If token acquisition fails, the package retries once with forced acquisition unless `--force` was already supplied. This can recover automatically when a cached token is stale or expired.

### Alternatives considered

Each of the following alternatives has the advantage of supporting multiple platforms. However, none provided a sufficiently simple and reliable drop-in replacement for the way `vsts-npm-auth` was being used:

- [`better-vsts-npm-auth`](https://github.com/zumwald/better-vsts-npm-auth) uses a two-part OAuth solution that requires an accompanying web service and an initial authorization flow in which a refresh token is copied back into the terminal. This setup was considered too involved for a drop-in replacement.
- [`azdo-npm-auth`](https://github.com/johnnyreilly/azdo-npm-auth) can work, but automatic PAT acquisition requires the Azure CLI, an `az login`, and an Azure DevOps organization connected to Microsoft Entra ID. A PAT can instead be supplied manually, but either approach requires additional setup. See this [comparison from the evaluation](https://github.com/microsoft/ado-npm-auth/issues/69#issuecomment-3566949390).
- [`ado-npm-auth`](https://github.com/microsoft/ado-npm-auth) is also cross-platform, but it could not authenticate against the organization used during the evaluation, even after trying `az login --allow-no-subscriptions`. The failure and the steps attempted are recorded in the same [issue comment](https://github.com/microsoft/ado-npm-auth/issues/69#issuecomment-3566949390).
