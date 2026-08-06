# Plan: add `-N`, `-T`, `-E`, and multi-config support

## Objective

Expose the upstream `vsts-npm-auth` NonInteractive, TargetConfig, and ExpirationMinutes options
through the public `vsts-npm-auth-improved auth` command, and extend the existing config-path option
to accept multiple npm configuration files, without changing the behavior of existing invocations.

The internal `VstsNpmAuthOptions` adapter already translates these values to `-N`, `-T`, and `-E`.
The remaining work is to expose, validate, and pass them from the public Commander command.

## Public options

- `-c, --config-path <paths>`: continue accepting a single project `.npmrc`, and additionally accept
  a comma-separated list such as `-c ./client/.npmrc,./server/.npmrc`. Trim surrounding whitespace,
  preserve the supplied order, reject empty lists or empty entries, and validate that every file
  exists and contains a non-empty global `registry`. Pass the resulting path list through the
  adapter, which emits upstream `-C` with comma-separated paths.
- `-N, --non-interactive`: pass `-N` to `vsts-npm-auth` so its credential provider does not prompt
  for credentials. This controls upstream credential prompting only. It does not suppress the
  wrapper's config-path, token-scope, or force prompts; unattended callers must continue to provide
  those existing choices explicitly.
- `-T, --target-config <path>`: pass the npm configuration path that should receive generated
  credentials. When omitted, preserve the upstream default user npm configuration, normally
  `~/.npmrc`.
- `-E, --expiration-minutes <minutes>`: pass the requested lifetime for a newly acquired token.
  Accept positive integer minutes only. When omitted, do not pass `-E`, preserving the upstream
  default of 129,600 minutes (90 days).

## Implementation steps

1. In `projects/vsts-npm-auth-improved/src/auth/auth-command.ts`, update the config-path value label
   and register the three new Commander options in `AuthCommandOptions`.
2. In `projects/vsts-npm-auth-improved/src/auth/get-auth-options.ts`, parse `--config-path` into an
   ordered path list. Keep the interactive prompt as a single-path prompt, returning a one-item list
   so prompted and command-line values share the same downstream representation.
3. Validate every selected `.npmrc` before launching `vsts-npm-auth`. Report the path associated
   with a missing file or missing global registry, and do not start authentication if any file is
   invalid.
4. Add a Commander argument parser for `--expiration-minutes` that rejects zero, negative,
   fractional, non-numeric, infinite, and unsafe-integer values with a clear CLI error.
5. Extend the call into `runVstsNpmAuthWithRetryAsync` so the config path list, `nonInteractive`,
   `targetConfig`, and `expirationMinutes` are included in `VstsNpmAuthOptions` alongside the
   existing read-only and force values.
6. Ensure the forced retry preserves the config path list and all three new values, changing only
   `force` to `true`.
7. Make authentication output source- and destination-aware: summarize all selected registries,
   mention the supplied target config when `-T` is present, and retain the existing `~/.npmrc`
   wording otherwise.
8. Update `projects/vsts-npm-auth-improved/README.md` with multi-config syntax, the new flags,
   defaults, prompt semantics, and examples for multiple project configurations, unattended
   authentication, a custom target config, and a custom token lifetime.

## Tests

Add public-boundary cases in `projects/vsts-npm-auth-improved/tests/auth-command-cli.test.ts` that
verify:

- each short and long option is accepted;
- a single `--config-path` value retains its current behavior;
- comma-separated config paths are trimmed, kept in order, and forwarded as one upstream `-C`
  value;
- empty config entries and any invalid `.npmrc` fail before `vsts-npm-auth` is launched;
- `execa` receives `-N`, `-T <path>`, and `-E <minutes>` in the expected order;
- omitting the options preserves the existing upstream arguments and 90-day default behavior;
- invalid expiration values fail before `vsts-npm-auth` is launched;
- the automatic forced retry preserves every config path plus non-interactive, target-config, and
  expiration arguments;
- output identifies a custom target configuration when supplied; and
- help snapshots list the new options accurately.

Run the complete package test suite and rebuild the release tarball after updating snapshots.

## Non-goals

- Adding upstream `-V` verbosity support.
- Adding upstream short aliases for the existing read-only or force options.
- Changing CI or non-Windows early-exit behavior.
- Making `--non-interactive` suppress this wrapper's own prompts.

## Acceptance criteria

- Existing commands behave exactly as before when the new options are omitted.
- Existing single-file `-c, --config-path` commands remain compatible.
- Multiple comma-separated `.npmrc` paths are validated and forwarded through upstream `-C`.
- `-N`, `-T`, and `-E` are visible in `auth --help` and documented in the package README.
- The exact corresponding upstream arguments are passed to `vsts-npm-auth`.
- Expiration remains 90 days by default.
- All builds, tests, snapshots, and package-tarball checks pass.
