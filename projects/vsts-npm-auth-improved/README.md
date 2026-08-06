# vsts-npm-auth-improved

`vsts-npm-auth-improved` wraps and invokes [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) to authenticate npm with private Azure DevOps Artifacts registries on Windows. It adds:

- ✅ A friendlier guided authentication experience.
- ✅ Clearer success and error messages.
- ✅ A one-time automatic retry that can recover from stale or expired tokens.
- ✅ The same npm scripts remain safe to use on macOS, Linux, and CI.

## Install and run

Install the CLI as a development dependency:

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

> [!NOTE]
>
> This command uses `npx` to resolve and run `vsts-npm-auth-improved` before the project's dependencies have been installed. The explicit `--registry=https://registry.npmjs.org/` option fetches the publicly available package from the public npm registry, which does not require authentication. This avoids the chicken-and-egg problem of needing working private-registry credentials before the tool that obtains those credentials can run.

To configure your projects interactively, run:

```shell
npm init vsts-npm-auth-improved
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

When config path, token scope, or force behavior is omitted on Windows, the CLI prompts for that value. The wrapper does not pass an expiration option, so newly acquired tokens use the upstream default of 129,600 minutes (90 days).

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

Immediately after the welcome message, the command detects CI before checking the operating system and skips automatic authentication. It does not resolve `.npmrc` paths, prompt, or invoke [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth). It warns that authentication must be configured in CI and exits successfully so the npm script can continue.

### Windows

The command reads the global registry from the selected `.npmrc`, invokes [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth), and writes credentials to the user npm configuration at `~/.npmrc`. Failed token acquisition is retried once with forced acquisition unless `--force` was supplied. Newly acquired tokens use the upstream 129,600-minute default because the wrapper does not pass an expiration option.

### macOS and Linux

Automatic authentication is not available. The command warns that registry authentication must be configured manually, does not resolve `.npmrc` paths or prompt, does not invoke [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth), and exits successfully so a cross-platform npm script can continue.

No PAT-based authentication is currently performed by this package.

## Development

Build, test, packaging, and release instructions are maintained in the repository's [developer documentation](https://github.com/edumserrano/vsts-npm-auth-improved/tree/main/docs/dev-docs).
