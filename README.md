# vsts-npm-auth-improved

[![Build and test vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml)
[![Build and test create-vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml)
[![vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/vsts-npm-auth-improved?logo=npm&label=vsts-npm-auth-improved)](https://www.npmjs.com/package/vsts-npm-auth-improved)
[![create-vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/create-vsts-npm-auth-improved?logo=npm&label=create-vsts-npm-auth-improved)](https://www.npmjs.com/package/create-vsts-npm-auth-improved)

`vsts-npm-auth-improved` wraps and invokes [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth) to authenticate npm with private Azure DevOps Artifacts registries on Windows. It adds:

- ✅ A friendlier guided authentication experience.
- ✅ Clearer success and error messages.
- ✅ A one-time automatic retry that can recover from stale or expired tokens.
- ✅ The same npm scripts remain safe to use on macOS, Linux, and CI.

## Configure a project for automatic npm authentication

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

See the [`create-vsts-npm-auth-improved` package documentation](projects/create-vsts-npm-auth-improved/README.md) for detailed setup options and guidance.

## Run authentication manually

If you want to run `vsts-npm-auth-improved` manually to authenticate to an Azure DevOps Artifacts registry, see the [`vsts-npm-auth-improved` package documentation](projects/vsts-npm-auth-improved/README.md).

## Development and releases

Maintaining the repository? See the [`developer documentation`](docs/dev-docs/README.md).
