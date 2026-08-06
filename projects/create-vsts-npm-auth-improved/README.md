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

## What setup asks

Follow the prompts to:

1. Choose the directory containing your npm projects.
2. Select the projects you want to configure.
3. Choose the install command that matches the npm versions your projects support.
4. Provide an Azure DevOps Artifacts registry URL when a selected project does not already have one.

You can cancel before setup completes without changing any files.

## What setup changes

For each selected project, setup:

- creates or updates the project `.npmrc` with the selected registry, enables lockfiles, and disables automatic audit and funding messages;
- removes obsolete `always-auth` settings;
- adds the dependency and package scripts needed to run `vsts-npm-auth-improved` before installing packages;
- preserves unrelated registry settings, dependencies, and package scripts; and
- warns when a changed `.npmrc` is ignored by Git and may not be shared with other contributors.

Setup does not authenticate with the registry or add credentials to the project `.npmrc`. Review any `.npmrc` before changing `.gitignore` rules or committing it.

You can safely run setup again when you need to update the configuration.

## Install packages after setup

Use the command selected during setup.

For npm 12 and later:

```shell
npm install
```

Authentication also runs automatically with `npm ci` on npm 12 and later.

For npm 11 and earlier:

```shell
npm run install-packages
```

On Windows, authentication runs before npm installs packages from the private registry. On macOS, Linux, and CI, automatic authentication is skipped so you can use credentials supplied by your environment.

## If authentication fails

Retry from the project directory with forced token acquisition:

```shell
npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved@alpha -c ./.npmrc --read --force
```

See the [`vsts-npm-auth-improved` package documentation](https://www.npmjs.com/package/vsts-npm-auth-improved) for authentication options and platform behavior.
