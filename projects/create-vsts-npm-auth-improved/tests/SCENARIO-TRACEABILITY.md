# Internal-test migration traceability

This file records how scenarios from the deleted implementation-level suites
remain covered through the public `cliAsync` boundary. Assertions about internal
object shapes, dependency-constructor arguments, and calls between application
modules are deliberately replaced by exit codes, terminal output, prompt
behavior, and filesystem state.

## Auth setup planning

| Deleted scenario                                                    | Public CLI coverage                                                                           |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Load all selected packages before prompting                         | `init-auth-safety`: later malformed package prevents the first registry prompt and all writes |
| Prompt only for packages without a project registry                 | `init-auth-success`: mixed created, updated, and unchanged outcomes                           |
| Prompt despite an inherited registry                                | `init-auth-npmrc-content`: inherited global, user, and environment registry cases             |
| Invalid later package prevents all writes                           | `init-auth-safety`: rejects a later invalid package before prompting or writing                |
| Unreadable selected `.npmrc` prevents prompts and writes            | `init-auth-safety`: `.npmrc` read failure                                                     |
| Cancelling a later registry prompt performs no writes               | `init-auth-cancellation`: later registry cancellation                                         |
| Skip unchanged files and report changed files in persistence order  | `init-auth-success`: mixed outcomes and complete second-run idempotency                       |
| Later rejected save identifies the failed path after earlier writes | `init-auth-safety`: later write failure preserves earlier completed writes                    |
| Complete plan summary contains paths and counts                     | `init-auth-success`: mixed-outcome transcript snapshot                                        |

## npm configuration

| Deleted scenario                                                        | Public CLI coverage                                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Missing, empty, and whitespace-only project configuration               | `init-auth-npmrc-content`: separate missing, empty, and whitespace scenarios                    |
| Global, user, and environment registry inheritance                      | `init-auth-npmrc-content`: separate inherited-registry scenarios with unchanged inherited files |
| Synthetic adapter `argv` registry precedence                            | Not reachable from `cliAsync`; the application never supplies adapter-only registry arguments   |
| Scoped registry is not a project registry                               | `init-auth-npmrc-content`: scoped-registry scenario                                             |
| Final duplicate registry wins                                           | `init-auth-npmrc-content`: duplicate-registry scenario                                          |
| Managed values change while unrelated values and credentials remain     | `init-auth-npmrc-content`: managed-value preservation scenario                                  |
| Standalone, nested, and workspace member target adjacent `.npmrc` files | `init-auth-npmrc-content`: adjacent `.npmrc` matrix                                             |
| Already-correct configuration is unchanged                              | `init-auth-success` and `init-auth-npmrc-idempotency`: second-run scenarios                     |
| Loading and saving failures identify the `.npmrc` operation             | `init-auth-safety`: `.npmrc` read and write failures                                            |

## package.json configuration

| Deleted scenario                                                      | Public CLI coverage                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Add managed fields, correct conflicts, and replace invalid containers | `init-auth-package-json-content`: separate content scenarios                    |
| Reconcile every dependency section through npm sorting                | `init-auth-package-json-content`: BOM-prefixed all-dependency-sections scenario |
| Discard invalid managed entries and retain valid entries              | `init-auth-package-json-content`: invalid-managed-entry scenario                |
| A second run is semantically and byte-for-byte unchanged              | `init-auth-success`: complete second-run idempotency                            |
| Missing or unreadable package after discovery                         | `init-auth-safety`: separate missing and unreadable post-discovery scenarios    |
| Malformed JSON                                                        | `init-auth-safety`: malformed JSON scenario                                     |
| Non-object roots (`null`, array, string, number, boolean)             | `init-auth-safety`: one CLI case for every serializable root shape              |
| In-memory `undefined` package content                                 | Not representable by a `package.json` file and therefore not a CLI scenario     |
| Package update/load failure                                           | `init-auth-safety`: package read/planning failure outcomes                      |
| Package save failure before any write                                 | `init-auth-safety`: targeted package write failure                              |
| Later package save failure after partial completion                   | `init-auth-safety`: later write failure with earlier completed writes           |
