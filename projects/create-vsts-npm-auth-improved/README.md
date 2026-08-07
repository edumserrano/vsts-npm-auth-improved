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

This custom command is required even with npm 12. npm 12 runs a root `preinstall` before fetching
dependencies, but npm loads `.npmrc` before that hook and does not use credentials created or
refreshed by it during the active installation. This npm behavior is tracked by
[npm/cli#9853](https://github.com/npm/cli/issues/9853). `npm run install-packages` authenticates
first and then starts `npm install` as a new process, which loads the updated credentials.

On Windows, authentication runs before npm installs packages from the private registry. On macOS, Linux, and CI, automatic authentication is skipped so your environment must supply the required credentials.
