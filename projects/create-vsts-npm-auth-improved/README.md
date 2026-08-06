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

## Prompt flow

`init-auth` completes the interactive setup in this order:

1. Enter the root directory to search. The default is `./`, relative to the directory where the command was started. The directory must exist, be readable, and be a directory.
2. The CLI recursively discovers `package.json` files in deterministic order. It respects `.gitignore` files from the selected root up to the repository root as well as nested `.gitignore` files. It also skips hidden directories, symbolic-link directories, and directories named `node_modules`. Global Git ignore files are not applied, so discovery is consistent across machines.
3. Select `ALL` to configure every discovered package, or select a subset. An empty selection exits without changing files.
4. Choose how package installation should trigger authentication. Standard `npm install` is selected by default and requires npm 12 or later. The custom `npm run install-packages` compatibility command configures selected projects that must later install with npm 11 or earlier. The setup CLI itself still requires npm 12.0.2 or later. The choice applies to every selected package.
5. For each selected package whose adjacent `.npmrc` has no non-empty global `registry` setting, enter an absolute registry URL. Existing global registry values are reused, so those packages do not prompt. A scoped registry alone does not replace the required global registry.
6. After every selected package has been read, parsed, and planned—and all required registry prompts have completed—the CLI writes only changed files. It groups the result by package directory and labels each managed file as created, updated, or unchanged.
7. If an `.npmrc` created or updated by the command is ignored by Git, the CLI lists it in a warning. See [Git-ignore checking](#git-ignore-checking).

Cancelling any prompt during planning exits before any file is written. Invalid or unreadable input also stops planning before persistence begins.

## Git-ignore checking

After configuration files are written successfully, the CLI checks every `.npmrc` file it created or updated against applicable `.gitignore` rules. This helps identify project-level npm settings that may otherwise remain local and unavailable to other contributors.

The check:

- considers only `.npmrc` files created or updated during the current run;
- does not report selected `.npmrc` files that remained unchanged;
- respects `.gitignore` files from the selected root up to the repository root, nested `.gitignore` files, and negated rules;
- does not apply a user's global Git ignore file; and
- is best-effort: if the check cannot be completed, setup still succeeds and no Git-ignore warning is displayed.

When ignored files are found, the warning lists their paths and recommends reviewing each file for credentials or other secrets before changing `.gitignore` rules or committing it. The CLI does not modify `.gitignore`, stage files, create commits, or push changes automatically.

## Resulting configuration

### `.npmrc`

For a new `.npmrc`, the CLI configures these managed settings:

```ini
registry=<registry entered in the prompt>
package-lock=true
audit=false
fund=false
```

For an existing `.npmrc`, the CLI enforces those same four managed values. The effective non-empty project `registry` value is reused; the other three managed values are overwritten when they conflict. Credentials, unrelated settings, and scoped registry entries such as `@scope:registry=...` remain configured. `lockfile-version` and `legacy-peer-deps` are not added or changed. Both global `always-auth=...` and scoped `//registry/:always-auth=...` settings are removed.

### `package.json`

The CLI adds or replaces this exact development dependency:

```json
{
  "devDependencies": {
    "vsts-npm-auth-improved": "alpha"
  }
}
```

The standard installation strategy places these managed scripts at the top of the `scripts` object:

```json
{
  "scripts": {
    "registry-auth": "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved@alpha -c ./.npmrc --read --no-force",
    "preinstall": "npm run registry-auth"
  }
}
```

`registry-auth` uses npm's package runner so authentication can run before the project's dependencies have been installed. The explicit package spec and command-line registry select the current `alpha` release from the public npm registry, overriding the project-level global registry for this bootstrap request. npm caches the fetched package and reuses its package data while the same alpha release remains current. All `npx` options precede the package spec, so the remaining options are passed to `vsts-npm-auth-improved`.

With npm 12 or later, the root `preinstall` lifecycle runs before dependencies are installed. Run the standard installation command immediately after configuration:

```shell
npm install
```

The `preinstall` hook authenticates first, then npm installs the project dependencies using the configured project registry. The same lifecycle order also applies to `npm ci` in npm 12 or later.

The compatibility strategy instead creates the existing custom scripts:

```json
{
  "scripts": {
    "registry-auth": "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved@alpha -c ./.npmrc --read --no-force",
    "preinstall-packages": "npm run registry-auth",
    "install-packages": "npm i"
  }
}
```

Run that strategy with:

```shell
npm run install-packages
```

Its `preinstall-packages` hook authenticates before `install-packages` runs `npm i`. Use this strategy when the project must support npm 11 or earlier.

If authentication fails, retry from the project directory with forced token acquisition:

```shell
npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved@alpha -c ./.npmrc --read --force
```

Conflicting values for the selected strategy's managed dependency or scripts are overwritten. If standard mode finds an unrelated existing `preinstall`, it prepends `npm run registry-auth &&` so the existing work still runs after authentication. Switching strategies removes hooks previously generated by this command while preserving unrelated script values. Unrelated fields, dependencies, and scripts are preserved. Repeating `init-auth` with the same answers is idempotent: already-configured files remain unchanged.

### File serialization

The CLI uses npm's own `@npmcli/config` and `@npmcli/package-json` libraries to parse and serialize `.npmrc` and `package.json` files. Managed semantic values and unrelated semantic configuration are retained, but the original text is not a preservation contract. Comments, formatting, duplicate entries, key ordering, byte-order marks (BOMs), and newline style or final-newline choices are not guaranteed after a semantic update. npm may also reorder dependency entries in `package.json`.

Files whose managed configuration is already semantically correct are not rewritten, so their existing bytes remain unchanged.

## Development

Build, test, packaging, version-policy, and release instructions are maintained in the repository's [developer documentation](https://github.com/edumserrano/vsts-npm-auth-improved/tree/main/docs/dev-docs).
