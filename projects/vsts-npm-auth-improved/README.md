# vsts-npm-auth-improved

`vsts-npm-auth-improved` uses [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth). It authenticates npm with private Azure DevOps Artifacts registries on Windows. It provides these functions:

- ✅ Guides you through the authentication process.
- ✅ Gives clear success and error messages.
- ✅ Automatically tries the authentication one more time if a token is stale or expired.
- ✅ Lets you safely use the same npm scripts on macOS, Linux, and CI.

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

This command uses `npx` to find and run `vsts-npm-auth-improved` before npm installs the project dependencies. The `--registry=https://registry.npmjs.org/` option gets the public package from the public npm registry. This registry does not require authentication. Thus, the tool can get private-registry credentials before these credentials are available.

To configure your projects interactively, run:

```shell
npm init vsts-npm-auth-improved
```

Refer to the [`create-vsts-npm-auth-improved` package documentation](https://www.npmjs.com/package/create-vsts-npm-auth-improved) for detailed setup options and instructions.

## Options

| Option                     | Description and default                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `-c, --config-path <path>` | Project `.npmrc` containing the registry. When omitted, the CLI prompts with `./.npmrc` as the default. |
| `--read`                   | Requests a token with the Packaging (Read) scope.                                                        |
| `--no-read`                | Requests a token with the Packaging (Read & Write) scope.                                                |
| `--force`                  | Gets a token even when an existing token is valid.                                                       |
| `--no-force`               | Permits the use of an existing valid token. After a failed request, the CLI tries once to get a token.   |
| `-h, --help`               | Shows command help.                                                                                      |
| `-v, --version`            | Shows the `vsts-npm-auth-improved` package version.                                                      |

On Windows, the CLI prompts for each option that you do not supply. These options are the config path, token scope, and force behavior. New tokens expire after 90 days.

## Examples

Get a standard read-only token. Permit the use of an existing valid token:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --no-force
```

Force a new read-only token:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --force
```

## Platform behavior

### CI environments

In CI, the command detects the CI environment and does not start automatic authentication. It tells you to configure authentication in CI. Then, it exits successfully and lets the npm script continue.

The [ci-info](https://www.npmjs.com/package/ci-info) package detects the CI environment.

### Windows

The command reads the global registry from the selected `.npmrc`. It uses [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) and writes credentials to the user npm configuration at `~/.npmrc`. After a failed token request, the command tries once to get a token. It does not try again if you supplied `--force`.

### macOS and Linux

Automatic authentication is not available. The command tells you to configure registry authentication manually. It does not use [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth). The command exits successfully and lets a cross-platform npm script continue.
