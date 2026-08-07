import { Volume } from "memfs";

/**
 * Creates repeatable .npmrc fixtures in the specified memfs volume. It returns
 * the fixture path and parsed registry value. Thus, tests do not read a real
 * user configuration or write to the host file system.
 */

export type InMemoryNpmrcFile = {
  readonly path: string;
};

export type CreateInMemoryNpmrcFileOptions = {
  readonly vol: Volume;
  readonly path?: string;
  readonly contents?: string;
};

export function createInMemoryNpmrcFile(
  options: CreateInMemoryNpmrcFileOptions,
): InMemoryNpmrcFile {
  const { vol, path, contents } = options;
  const pathToUse = path ?? "./this-dir-exists-only-in-memfs/.npmrc";
  const defaultNpmrcContents =
    "registry=https://pkgs.dev.azure.com/org/_packaging/feed/npm/registry/";
  const npmrcContents = contents ?? defaultNpmrcContents;
  vol.fromJSON({
    [pathToUse]: npmrcContents,
  });

  return {
    path: pathToUse,
  };
}
