# vsts-npm-auth-improved

[![Build and test vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-vsts-npm-auth-improved.yml)
[![Build and test create-vsts-npm-auth-improved](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml/badge.svg?branch=main)](https://github.com/edumserrano/vsts-npm-auth-improved/actions/workflows/build-test-create-vsts-npm-auth-improved.yml)
[![vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/vsts-npm-auth-improved?logo=npm&label=vsts-npm-auth-improved)](https://www.npmjs.com/package/vsts-npm-auth-improved)
[![create-vsts-npm-auth-improved on npm](https://img.shields.io/npm/v/create-vsts-npm-auth-improved?logo=npm&label=create-vsts-npm-auth-improved)](https://www.npmjs.com/package/create-vsts-npm-auth-improved)

`vsts-npm-auth-improved` uses [`vsts-npm-auth`](https://www.npmjs.com/package/vsts-npm-auth). It authenticates npm with private Azure DevOps Artifacts registries on Windows. It provides these functions:

- ✅ Configures one or more npm projects for automatic npm authentication during one interactive setup.
- ✅ Guides you through the authentication process.
- ✅ Gives clear success and error messages.
- ✅ Automatically tries the authentication one more time if a token is stale or expired.
- ✅ Lets you safely use the same npm scripts on macOS, Linux, and CI.

## Configure a project for automatic npm authentication

From the directory containing one or more npm projects, run:

```shell
npm init vsts-npm-auth-improved
```

Follow the prompts to select the projects and the Azure DevOps Artifacts registry. The setup updates the selected projects. Authentication then starts automatically with one of these commands:

- `npm install` for npm 12 and later.
- `npm run install-packages` for npm 11 and earlier.

After setup, install packages using the command selected during setup.

For npm 12 and later:

```shell
npm install
```

For npm 11 and earlier:

```shell
npm run install-packages
```

On Windows, authentication starts automatically before npm installs private packages. On macOS, Linux, and CI, the tool does not do the authentication step. Your environment must supply the necessary credentials.

See the [`create-vsts-npm-auth-improved` package documentation](projects/create-vsts-npm-auth-improved/README.md) for detailed setup options and guidance.

## Run authentication manually

To run `vsts-npm-auth-improved` manually, refer to the [`vsts-npm-auth-improved` package documentation](projects/vsts-npm-auth-improved/README.md).

## Development and releases

For repository maintenance, refer to the [`developer documentation`](docs/dev-docs/README.md).
