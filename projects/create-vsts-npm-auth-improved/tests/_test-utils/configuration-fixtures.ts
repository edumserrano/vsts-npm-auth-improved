import path from "node:path";
import type { JsonObject } from "type-fest";

/**
 * Supplies deterministic package.json and .npmrc content plus fixture path
 * builders. The helpers centralize managed settings while allowing tests to
 * vary metadata, registry values, and package locations.
 */

export const DEFAULT_REGISTRY = "https://registry.example.test/";

const EXPECTED_REQUIRED_SCRIPTS = {
  "registry-auth":
    "npx --yes --registry=https://registry.npmjs.org/ vsts-npm-auth-improved -c ./.npmrc --read --no-force",
  "preinstall-packages": "npm run registry-auth",
  "install-packages": "npm i",
} as const;

type PackageJsonFixtureOverrides = Readonly<JsonObject>;

export const EXPECTED_MANAGED_NPM_CONFIG = {
  "package-lock": "true",
  audit: "false",
  fund: "false",
} as const;

export function packageJsonContent(
  overrides: PackageJsonFixtureOverrides = {},
): string {
  return JSON.stringify(
    {
      name: "test-package",
      ...overrides,
    },
    undefined,
    2,
  );
}

export function configuredPackageJsonContent(
  overrides: PackageJsonFixtureOverrides = {},
): string {
  return packageJsonContent({
    scripts: EXPECTED_REQUIRED_SCRIPTS,
    devDependencies: {
      "vsts-npm-auth-improved": "latest",
    },
    ...overrides,
  });
}

export function canonicalNpmrc(registry = DEFAULT_REGISTRY): string {
  return [
    `registry=${registry}`,
    "package-lock=true",
    "audit=false",
    "fund=false",
  ].join("\n");
}

/**
 * Parses the effective key/value state used by workflow assertions. npm owns
 * .npmrc serialization, so tests intentionally ignore comments, line endings,
 * key order, and other byte-level presentation details.
 */
export function parseNpmrcContent(content: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const sourceLine of content.replace(/^\uFEFF/, "").split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (line === "" || line.startsWith("#") || line.startsWith(";")) {
      continue;
    }

    const separator = line.indexOf("=");
    if (separator < 1) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line
      .slice(separator + 1)
      .replace(/\s+[;#].*$/u, "")
      .trim();
    parsed[key] = value;
  }
  return parsed;
}

export function packagePath(root: string, directory = ""): string {
  return path.join(root, directory, "package.json");
}

export function npmrcPath(root: string, directory = ""): string {
  return path.join(root, directory, ".npmrc");
}
