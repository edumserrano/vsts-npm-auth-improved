# vsts-npm-auth-improved

[![Build and test vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml)
[![Build and test create-vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml)
[![vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/vsts-npm-auth-improved?logo=npm&label=vsts-npm-auth-improved)](https://www.npmjs.com/package/vsts-npm-auth-improved)
[![create-vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/create-vsts-npm-auth-improved?logo=npm&label=create-vsts-npm-auth-improved)](https://www.npmjs.com/package/create-vsts-npm-auth-improved)

`vsts-npm-auth-improved` wraps and invokes
[`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) to authenticate npm with private Azure
DevOps Artifacts registries on Windows. It adds:

- ✅ An improved interactive experience.
- ✅ Clearer authentication results.
- ✅ An automatic one-time forced retry after failed token acquisition, which resolves issues
  caused by stale or expired tokens.
- ✅ Safe no-op behavior on macOS, Linux, and CI.

## Configure a project

From the directory containing one or more npm projects, run:

```shell
npm init vsts-npm-auth-improved
```

Follow the prompts to choose the projects and Azure DevOps Artifacts registry you want to use. The
setup prepares each project to authenticate before installing private packages, so developers can
keep using familiar npm install commands without manually wiring up authentication scripts. The
same project setup remains safe to use across Windows, macOS, Linux, and CI.

After setup, use the installation command selected during the prompts:

```shell
npm install
```

or, for the npm 11-and-earlier compatibility strategy:

```shell
npm run install-packages
```

On Windows, the generated script obtains Azure DevOps registry credentials and writes them to the
user npm configuration before installation continues. On macOS, Linux, and CI, automatic
authentication is skipped with a warning so authentication can be supplied by the environment.

See the
[`create-vsts-npm-auth-improved` package documentation](projects/create-vsts-npm-auth-improved/README.md)
for the complete setup flow and resulting files.

## Run authentication directly

Projects that are already configured can invoke the core command directly:

```shell
npx vsts-npm-auth-improved auth --config-path ./.npmrc --read --no-force
```

See the
[`vsts-npm-auth-improved` package documentation](projects/vsts-npm-auth-improved/README.md) for all
supported flags, upstream mappings, and platform behavior.

## Requirements

- Node.js 24.18.1 or later
- npm 12.0.2 or later for the standard installation strategy
- Windows for automatic authentication

The setup CLI itself runs on Windows, macOS, and Linux. No PAT-based authentication is currently
performed on non-Windows platforms.

## Development and releases

Contributor documentation is collected under [`docs/dev-docs`](docs/dev-docs/README.md), including:

- [development, testing, and package inspection](docs/dev-docs/development.md);
- [how to create releases and how Dependabot updates release automatically](docs/dev-docs/releases.md);
- [testing strategies](docs/dev-docs/README.md#developer-documentation); and
- [architecture decisions](docs/dev-docs/adr/0001-use-a-github-app-for-release-preparation.md).
