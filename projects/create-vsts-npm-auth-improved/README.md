# create-vsts-npm-auth-improved

`create-vsts-npm-auth-improved` is an interactive setup CLI for [`vsts-npm-auth-improved`](https://www.npmjs.com/package/vsts-npm-auth-improved).

- ✅ Configures one or more npm projects during one interactive setup.
- ✅ Creates or updates `.npmrc` files and package scripts for automatic npm registry authentication.
- ✅ Gives a warning when source control possibly does not include a changed `.npmrc` file.
- ✅ Keeps setup separate from authentication. The setup does not authenticate with a registry.

## How to run

Use `npm init` to run the interactive setup:

```shell
npm init vsts-npm-auth-improved
```

You can also run it directly with `npx`:

```shell
npx create-vsts-npm-auth-improved
```

Use `--help` or `-h` to show help. Use `--version` or `-v` to show the package version:

```shell
npx create-vsts-npm-auth-improved --help
npx create-vsts-npm-auth-improved --version
```

## What the setup asks

Follow the prompts to:

1. Choose the directory containing your npm projects.
2. Select the projects you want to configure.
3. Choose the install command that matches the npm versions your projects support.
4. Provide an Azure DevOps Artifacts registry URL when a selected project does not already have one.

You can cancel before the setup is complete. If you cancel, the setup does not change files.

## What the setup changes

For each selected project, the setup:

- Creates or updates the project `.npmrc` with the selected registry.
- Enables lockfiles.
- Disables automatic audit and funding messages.
- Removes obsolete `always-auth` settings.
- Adds the dependency and package scripts that run `vsts-npm-auth-improved` before package installation.
- Keeps unrelated registry settings, dependencies, and package scripts.
- Gives a warning when Git ignores a changed `.npmrc` file. Other contributors possibly do not receive this file.

The setup does not authenticate with the registry. It does not add credentials to the project `.npmrc`. Examine each `.npmrc` file before you change `.gitignore` rules or commit the file.

You can safely run the setup again when you need to update the configuration.

## Install packages after setup

Use the command selected during setup.

For npm 12 and later:

```shell
npm i
```

Authentication also runs automatically with `npm ci` on npm 12 and later.

For npm 11 and earlier:

```shell
npm run install-packages
```

On Windows, authentication runs before npm installs packages from the private registry. On macOS, Linux, and CI, the tool does not do automatic authentication. Your environment must supply the necessary credentials.
