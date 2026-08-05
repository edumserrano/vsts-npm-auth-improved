# vsts-npm-auth-improved

[![Build and test vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml)
[![Build and test create-vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml)
[![vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/vsts-npm-auth-improved?logo=npm&label=vsts-npm-auth-improved)](https://www.npmjs.com/package/vsts-npm-auth-improved)
[![create-vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/create-vsts-npm-auth-improved?logo=npm&label=create-vsts-npm-auth-improved)](https://www.npmjs.com/package/create-vsts-npm-auth-improved)

TypeScript CLI tools for configuring npm projects and authenticating with private Azure DevOps
Artifacts registries.

## Packages

- `vsts-npm-auth-improved` authenticates npm with an Azure DevOps registry on Windows.
- `create-vsts-npm-auth-improved` interactively configures project `.npmrc` and `package.json`
  files to use the authentication command.

## Platform behavior

### Windows

`vsts-npm-auth-improved` runs `vsts-npm-auth` to acquire credentials for the registry configured
in the selected project `.npmrc`. The credentials are written to the user's npm configuration at
`~/.npmrc`. It does not pass an expiration time (`-E`) to `vsts-npm-auth`, so newly acquired tokens
use the `vsts-npm-auth` default of 129,600 minutes (90 days).

### macOS and Linux

Automatic authentication is not supported outside Windows. The command warns that authentication
must be configured manually and exits successfully without reading the project `.npmrc` or
invoking `vsts-npm-auth`. This allows cross-platform npm scripts to continue to `npm install`
after displaying the manual-authentication requirement.

No PAT-based authentication is currently performed by this package.

## Authentication CLI

Run with prompts:

```shell
vsts-npm-auth-improved auth
```

Provide all options for use from an npm script:

```shell
vsts-npm-auth-improved auth --config-path ./.npmrc --read --no-force
```

The `auth` command is the default, so this is equivalent:

```shell
vsts-npm-auth-improved --config-path ./.npmrc --read --no-force
```

## Project setup CLI

Use the companion setup package to configure one or more npm projects:

```shell
npx create-vsts-npm-auth-improved init-auth
```

See the package documentation under `projects/create-vsts-npm-auth-improved` for the complete
interactive setup flow.

## Development

Each package is built and tested from its own directory:

```shell
cd projects/vsts-npm-auth-improved
npm ci
npm run build
npm test
```

The repository currently requires Node.js 24.18.1 or later and npm 12.0.2 or later.

Maintainers should follow the [release runbook](RELEASE_RUNBOOK.md) to prepare, publish, verify,
or recover a package release.
