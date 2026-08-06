# vsts-npm-auth-improved

Authenticate npm with private Azure DevOps Artifacts registries on Windows while keeping the same
npm scripts safe to run on macOS, Linux, and CI.

The CLI validates the project `.npmrc`, runs the public
[`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) package, presents its result clearly,
and retries a failed non-forced token request once with forced acquisition.

## Requirements

- Node.js 24.18.1 or later
- npm 12.0.2 or later
- Windows for automatic registry authentication

## Install and run

Install the CLI as a development dependency:

```shell
npm install --save-dev vsts-npm-auth-improved
```

Run the interactive authentication flow:

```shell
npx vsts-npm-auth-improved auth
```

The `auth` command is the default:

```shell
npx vsts-npm-auth-improved
```

For an npm script, provide the project `.npmrc` and authentication choices explicitly:

```json
{
  "scripts": {
    "registry-auth": "vsts-npm-auth-improved -c ./.npmrc --read --no-force"
  }
}
```

The companion setup package can create this configuration interactively:

```shell
npx --yes create-vsts-npm-auth-improved init-auth
```

## Options

| Option | Upstream mapping | Description and default |
| --- | --- | --- |
| `-c, --config-path <path>` | `Config (-C)` | Project `.npmrc` containing the registry. When omitted, the CLI prompts with `./.npmrc` as the default. The wrapper supports one configuration file per invocation. |
| `--read` | `ReadOnly (-R)` | Requests a token with Packaging (Read) scope. |
| `--no-read` | no `-R` flag | Requests a token with Packaging (Read & Write) scope. |
| `--force` | `Force (-F)` | Forces token acquisition even when an existing token is still valid. |
| `--no-force` | no `-F` flag | Allows reuse of an existing valid token. A failed request is retried once with `-F`. |
| `-h, --help` | `Help (-?)` | Displays wrapper command help without running authentication. |
| `-v, --version` | Wrapper option | Displays the `vsts-npm-auth-improved` package version. |

When config path, token scope, or force behavior is omitted on Windows, the CLI prompts for that
value. The wrapper does not pass an expiration option, so newly acquired tokens use the upstream
default of 129,600 minutes (90 days).

## Examples

Authenticate with the standard read-only, non-forced choices used by generated projects:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --no-force
```

Force a new read-only token:

```shell
vsts-npm-auth-improved -c ./.npmrc --read --force
```

## Platform behavior

### CI environments

Immediately after the welcome message, the command detects CI before checking the operating system
and skips automatic authentication. It does not resolve `.npmrc` paths, prompt, or invoke
[`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth). It warns that authentication must be
configured in CI and exits successfully so the npm script can continue.

### Windows

The command reads the global registry from the selected `.npmrc`, invokes
[`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth), and writes credentials to the user
npm configuration at `~/.npmrc`. Failed token acquisition is retried once with forced acquisition
unless `--force` was supplied. Newly acquired tokens use the upstream 129,600-minute default
because the wrapper does not pass an expiration option.

### macOS and Linux

Automatic authentication is not available. The command warns that registry authentication must be
configured manually, does not resolve `.npmrc` paths or prompt, does not invoke
[`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth), and exits successfully so a
cross-platform npm script can continue.

No PAT-based authentication is currently performed by this package.

## Development

Build, test, packaging, and release instructions are maintained in the repository's
[developer documentation](https://github.com/edumserrano/vsts-npm-auth-improved/tree/main/docs/dev-docs).
