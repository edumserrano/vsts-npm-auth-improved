/**
 * Creates portable Node-style file-system errors with a specified error code.
 * Thus, tests can repeat permission, access, and I/O failure conditions.
 */

export function nodeError(message: string, code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(message), { code });
}
