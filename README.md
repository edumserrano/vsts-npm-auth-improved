# vsts-npm-auth-improved

[![Build and test vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml)
[![Build and test create-vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml)
[![vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/vsts-npm-auth-improved?logo=npm&label=vsts-npm-auth-improved)](https://www.npmjs.com/package/vsts-npm-auth-improved)
[![create-vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/create-vsts-npm-auth-improved?logo=npm&label=create-vsts-npm-auth-improved)](https://www.npmjs.com/package/create-vsts-npm-auth-improved)

`vsts-npm-auth-improved` wraps and invokes
[`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) to authenticate npm with private Azure
DevOps Artifacts registries on Windows. It adds:

- ✅ A friendlier guided authentication experience.
- ✅ Clearer success and error messages.
- ✅ A one-time automatic retry that can recover from stale or expired tokens.
- ✅ The same npm scripts remain safe to use on macOS, Linux, and CI.

## Configure a project for automatic npm authentication

From the directory containing one or more npm projects, run:

```shell
npm init vsts-npm-auth-improved
```

Follow the prompts to choose the projects and Azure DevOps Artifacts registry you want to use. The
selected projects are updated so authentication runs automatically with either `npm install`
(supported on npm 12 and later) or `npm run install-packages` (supported on npm 11 and earlier).

After setup, install packages using the command selected during setup.

For npm 12 and later:

```shell
npm install
```

For npm 11 and earlier:

```shell
npm run install-packages
```

On Windows, authentication happens automatically before npm installs private packages. On macOS,
Linux, and CI, the authentication step safely stands aside so you can use the credentials provided
by your environment.

See the
[`create-vsts-npm-auth-improved` package documentation](projects/create-vsts-npm-auth-improved/README.md)
for detailed setup options and guidance.

## Run authentication directly

Need to authenticate an already-configured project manually? Run:

```shell
npx vsts-npm-auth-improved auth --config-path ./.npmrc --read --no-force
```

See the
[`vsts-npm-auth-improved` package documentation](projects/vsts-npm-auth-improved/README.md) for
interactive and scripted usage options, troubleshooting, and platform support.

## Requirements

- Node.js 24.18.1 or later
- npm 12.0.2 or later
- Windows for automatic authentication

Project setup runs on Windows, macOS, and Linux. On non-Windows systems and in CI, provide registry
credentials using your environment's normal authentication method.

## Development and releases

Maintaining the repository? See the [`developer documentation`](docs/dev-docs/README.md), including:

- [development, testing, and package inspection](docs/dev-docs/development.md);
- [the release process, including automatic releases for Dependabot updates](docs/dev-docs/releases.md);
- [testing strategies](docs/dev-docs/README.md#developer-documentation); and
- [architecture decisions](docs/dev-docs/adr/0001-use-a-github-app-for-release-preparation.md).
