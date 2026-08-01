/**
 * Creates portable Node-style filesystem errors with a targeted error code so
 * tests can exercise permission, access, and I/O failure handling deterministically.
 */

export function nodeError(message: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}
