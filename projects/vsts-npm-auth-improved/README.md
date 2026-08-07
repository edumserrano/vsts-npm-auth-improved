# vsts-npm-auth-improved

`vsts-npm-auth-improved` wraps and invokes [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) to authenticate npm with private Azure DevOps Artifacts registries on Windows. It adds:

- ✅ A friendlier guided authentication experience.
- ✅ Clearer success and error messages.
- ✅ A one-time automatic retry that can recover from stale or expired tokens.
- ✅ The same npm scripts remain safe to use on macOS, Linux, and CI.

## Install and run

Install the CLI globally:

```shell
npm i -g vsts-npm-auth-improved
```

Run the interactive authentication flow:

```shell
vsts-npm-auth-improved
```

For an npm script, provide the project `.npmrc` and authentication choices explicitly:

```json
{
  "scripts": {
    "registry-auth": "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved -c ./.npmrc --read --no-force"
  }
}
```

This command uses `npx` to resolve and run `vsts-npm-auth-improved` before the project's dependencies have been installed. The explicit `--registry=https://registry.npmjs.org/` option fetches the publicly available package from the public npm registry, which does not require authentication. This avoids the chicken-and-egg problem of needing working private-registry credentials before the tool that obtains those credentials can run.

To configure your projects interactively, run:

```shell
npm init vsts-npm-auth-improved
```

See the [`create-vsts-npm-auth-improved` package documentation](https://www.npmjs.com/package/create-vsts-npm-auth-improved) for detailed setup options and guidance.

## Options

| Option                     | Description and default                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `-c, --config-path <path>` | Project `.npmrc` containing the registry. When omitted, the CLI prompts with `./.npmrc` as the default. |
| `--read`                   | Requests a token with Packaging (Read) scope.                                                           |
| `--no-read`                | Requests a token with Packaging (Read & Write) scope.                                                   |
| `--force`                  | Forces token acquisition even when an existing token is still valid.                                    |
| `--no-force`               | Allows reuse of an existing valid token. A failed request is retried once with forced acquisition.      |
| `-h, --help`               | Displays command help.                                                                                  |
| `-v, --version`            | Displays the `vsts-npm-auth-improved` package version.                                                  |

When config path, token scope, or force behavior is omitted on Windows, the CLI prompts for that value. Newly acquired tokens expire in 90 days.

## Examples

Authenticate with the standard read-only token and non-forced choices:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --no-force
```

Force a new read-only token:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --force
```

## Platform behavior

### CI environments

If invoked in CI, the command detects it's in a CI environment and skips automatic authentication. It warns that authentication must be configured in CI and exits successfully so the npm script can continue.

CI environment detection is done by the [ci-info](https://www.npmjs.com/package/ci-info) package.

### Windows

The command reads the global registry from the selected `.npmrc`, invokes [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth), and writes credentials to the user npm configuration at `~/.npmrc`. Failed token acquisition is retried once with forced acquisition unless `--force` was supplied.

### macOS and Linux

Automatic authentication is not available. The command warns that registry authentication must be configured manually, [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) is not invoked, and exits successfully so a cross-platform npm script can continue.
