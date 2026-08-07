# create-vsts-npm-auth-improved

`create-vsts-npm-auth-improved` is an interactive setup CLI for [`vsts-npm-auth-improved`](https://www.npmjs.com/package/vsts-npm-auth-improved).

- ✅ Configures one or more npm projects in a single interactive setup.
- ✅ Updates/creates `.npmrc` files and package scripts to use `vsts-npm-auth-improved` for automatic npm registry authentication.
- ✅ Warns when changed `.npmrc` files may not be shared through source control.
- ✅ Keeps setup separate from authentication; it does not authenticate with a registry itself.

## How to run

The intended way to run the interactive setup is with `npm init`:

```shell
npm init vsts-npm-auth-improved
```

It can also be executed directly with `npx`:

```shell
npx create-vsts-npm-auth-improved
```

Use `--help` or `-h` for help and `--version` or `-v` for the package version:

```shell
npx create-vsts-npm-auth-improved --help
npx create-vsts-npm-auth-improved --version
```

## What the setup asks

Follow the prompts to:

1. Choose the directory containing your npm projects.
2. Select the projects you want to configure.
3. Provide an Azure DevOps Artifacts registry URL when a selected project does not already have one.

You can cancel before setup completes without changing any files.

## What the setup changes

For each selected project, the setup:

- creates or updates the project `.npmrc` with the selected registry, enables lockfiles, and disables automatic audit and funding messages;
- removes obsolete `always-auth` settings;
- adds the dependency and package scripts needed to run `vsts-npm-auth-improved` before installing packages;
- preserves unrelated registry settings, dependencies, and package scripts;
- warns when a changed `.npmrc` is ignored by Git and may not be shared with other contributors.

The setup does not authenticate with the registry or add credentials to the project `.npmrc`. Review any `.npmrc` before changing `.gitignore` rules or committing it.

You can safely run the setup again when you need to update the configuration.

## Install packages after setup

Use the generated installation command:

```shell
npm run install-packages
```

On Windows, authentication runs before npm installs packages from the private registry. On macOS, Linux, and CI, automatic authentication is skipped so your environment must supply the required credentials.

## Why package installation uses a custom command

A root `preinstall` hook cannot reliably authenticate npm before it accesses a private registry:

1. In npm 7 through npm 11, the root `preinstall` hook ran after dependencies had already been installed, which was too late to provide registry credentials. npm 12 corrected that lifecycle ordering through [npm/cli#2660](https://github.com/npm/cli/issues/2660), but the correction is not available to projects that still use an earlier npm version.
2. npm 12 runs root `preinstall` before fetching dependencies, but the active npm process loads `.npmrc` before invoking the hook. Credentials created or refreshed by `preinstall` are therefore not used by the dependency requests that follow it. This remaining behavior is tracked by [npm/cli#9853](https://github.com/npm/cli/issues/9853).

The custom workflow provides the required process boundary. Running `npm run install-packages` first invokes its matching `preinstall-packages` hook to authenticate, then starts `npm install` as a new process. That new npm process loads the updated credentials before accessing the private registry.

If [npm/cli#9853](https://github.com/npm/cli/issues/9853) is resolved and the fix is available, the standard `npm install` workflow can be enabled in future versions of this package without requiring the custom `install-packages` command.
