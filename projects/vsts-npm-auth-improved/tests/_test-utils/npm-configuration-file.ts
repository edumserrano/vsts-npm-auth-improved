import ini from "ini";
import { Volume } from "memfs";

/**
 * Creates deterministic .npmrc fixtures inside the supplied memfs volume and
 * returns both the fixture path and parsed registry value. This keeps tests
 * from reading a real user configuration or writing to the host filesystem.
 */

export type InMemoryNpmrcFile = {
  readonly path: string;
  readonly registryValue: string;
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

  const parsed = ini.parse(npmrcContents);
  const registry = parsed.registry || "";
  return {
    path: pathToUse,
    registryValue: registry,
  };
}
