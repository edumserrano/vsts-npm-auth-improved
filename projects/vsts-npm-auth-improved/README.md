# vsts-npm-auth-improved

Authenticate npm with a private Azure DevOps Artifacts registry on Windows while keeping the same
npm scripts safe to run on macOS and Linux.

## Requirements

- Node.js 24.18.1 or later
- npm 12.0.2 or later
- Windows for automatic registry authentication

## Usage

Install the CLI as a development dependency:

```shell
npm install --save-dev vsts-npm-auth-improved
```

Run the interactive authentication flow:

```shell
npx vsts-npm-auth-improved auth
```

The `auth` command is the default command:

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

## Options

| Option | Description |
| --- | --- |
| `-c, --config-path <path>` | Path to the project `.npmrc` containing the registry. |
| `--read` | Request a token with Packaging (Read) scope. |
| `--no-read` | Request a token with Packaging (Read & Write) scope. |
| `--force` | Force authentication token acquisition. |
| `--no-force` | Do not force authentication token acquisition. |
| `-h, --help` | Display command help. |
| `-v, --version` | Display the package version. |

When an option is omitted during automatic Windows authentication, the CLI prompts for it.

## Platform behavior

### CI environments

Immediately after the welcome message, the command detects CI environments before checking the
operating system and skips automatic authentication. It does not resolve the `.npmrc` path, prompt
for authentication options, or invoke `vsts-npm-auth`. The command warns that authentication must
be configured in the CI environment and exits successfully so the npm script can continue.

### Windows

The command reads the registry from the selected `.npmrc`, invokes `vsts-npm-auth`, and writes the
acquired credentials to the user's npm configuration at `~/.npmrc`. Failed token acquisition is
retried once with forced acquisition unless `--force` was already supplied. The command does not
pass an expiration time (`-E`) to `vsts-npm-auth`, so newly acquired tokens use the
`vsts-npm-auth` default of 129,600 minutes (90 days).

### macOS and Linux

Immediately after the welcome message, the command detects that automatic authentication is not
available, then:

- warns that registry authentication must be configured manually or `npm install` will fail;
- does not resolve the `.npmrc` path or prompt for any authentication options;
- does not invoke `vsts-npm-auth`;
- exits successfully so a cross-platform npm script can continue.

No PAT-based authentication is currently performed by this package.
