import path from "node:path";
import { beforeEach, expect, test } from "vitest";
import {
  loadNpmPackageJsonFileWithDependencies,
  NpmPackageJsonFileError,
} from "../src/init-auth/package-files/npm-package-json-file";

type TestDependencies = Parameters<typeof loadNpmPackageJsonFileWithDependencies>[1];

const managedScripts = {
  "registry-auth":
    "npm exec --yes --registry=https://registry.npmjs.org/ --package=vsts-npm-auth-improved@alpha -- vsts-npm-auth-improved -c ./.npmrc --read",
  "preinstall-packages": "npm run registry-auth",
  "install-packages": "npm i",
} as const;

class FakePackageJson {
  public readonly saveCalls: number[] = [];
  public readonly updateCalls: Readonly<Record<string, unknown>>[] = [];

  public constructor(
    public readonly content: unknown,
    private readonly saveFailure?: unknown,
    private readonly updateFailure?: unknown,
  ) {}

  public async save(): Promise<void> {
    this.saveCalls.push(this.saveCalls.length + 1);
    if (this.saveFailure !== undefined) {
      throw this.saveFailure;
    }
  }

  public update(content: Readonly<Record<string, unknown>>): FakePackageJson {
    this.updateCalls.push(content);
    if (this.updateFailure !== undefined) {
      throw this.updateFailure;
    }
    return this;
  }
}

let fakePackageJson: FakePackageJson;
let loadFailure: unknown;
let loadedDirectories: string[];

beforeEach(() => {
  fakePackageJson = new FakePackageJson({});
  loadFailure = undefined;
  loadedDirectories = [];
});

test("loads the package directory and sends the complete safe update through npm", async () => {
  const packageDirectory = path.resolve("fixtures", "package");
  fakePackageJson = new FakePackageJson({
    name: "preserved",
    private: true,
    scripts: {
      test: "vitest",
      "install-packages": "wrong install",
      lint: "eslint .",
      "registry-auth": "wrong auth",
      "preinstall-packages": "wrong preinstall",
    },
    dependencies: { zebra: "1", alpha: "2" },
    devDependencies: { typescript: "7" },
    optionalDependencies: { optional: "3" },
    peerDependencies: { peer: "4" },
  });

  const adapter = await loadNpmPackageJsonFileWithDependencies(
    { packageDirectory },
    createDependencies(),
  );

  expect(loadedDirectories).toEqual([packageDirectory]);
  expect(adapter).toMatchObject({
    disposition: "updated",
    filePath: path.join(packageDirectory, "package.json"),
  });
  expect(fakePackageJson.updateCalls).toEqual([
    {
      scripts: {
        ...managedScripts,
        test: "vitest",
        lint: "eslint .",
      },
      dependencies: { zebra: "1", alpha: "2" },
      devDependencies: {
        typescript: "7",
        "vsts-npm-auth-improved": "alpha",
      },
      optionalDependencies: { optional: "3" },
      peerDependencies: { peer: "4" },
    },
  ]);

  await adapter.save();
  expect(fakePackageJson.saveCalls).toHaveLength(1);
});

test("replaces unsupported script and development dependency containers", async () => {
  fakePackageJson = new FakePackageJson({
    scripts: ["old"],
    devDependencies: "old",
    dependencies: "leave-to-npm",
    optionalDependencies: null,
    peerDependencies: ["leave-to-npm"],
  });

  const adapter = await loadNpmPackageJsonFileWithDependencies(
    { packageDirectory: path.resolve("fixtures", "invalid-containers") },
    createDependencies(),
  );

  expect(adapter.disposition).toBe("updated");
  expect(fakePackageJson.updateCalls).toEqual([
    {
      scripts: managedScripts,
      devDependencies: {
        "vsts-npm-auth-improved": "alpha",
      },
    },
  ]);
});

test("discards invalid entries from managed containers before calling npm", async () => {
  fakePackageJson = new FakePackageJson({
    scripts: { test: "vitest", invalid: true },
    devDependencies: { typescript: "7", invalid: false },
  });

  await loadNpmPackageJsonFileWithDependencies(
    { packageDirectory: path.resolve("fixtures", "invalid-entries") },
    createDependencies(),
  );

  expect(fakePackageJson.updateCalls).toEqual([
    {
      scripts: { ...managedScripts, test: "vitest" },
      devDependencies: {
        typescript: "7",
        "vsts-npm-auth-improved": "alpha",
      },
    },
  ]);
});

test("reports semantic idempotency without updating or saving", async () => {
  fakePackageJson = new FakePackageJson({
    scripts: { ...managedScripts, test: "vitest" },
    devDependencies: {
      "vsts-npm-auth-improved": "alpha",
      typescript: "7",
    },
  });

  const adapter = await loadNpmPackageJsonFileWithDependencies(
    { packageDirectory: path.resolve("fixtures", "unchanged") },
    createDependencies(),
  );
  await adapter.save();

  expect(adapter.disposition).toBe("unchanged");
  expect(fakePackageJson.updateCalls).toEqual([]);
  expect(fakePackageJson.saveCalls).toEqual([]);
});

test.each([null, [], "package", 42, true])(
  "translates a non-object package root (%j)",
  async content => {
    fakePackageJson = new FakePackageJson(content);
    const packageDirectory = path.resolve("fixtures", "non-object");

    await expect(
      loadNpmPackageJsonFileWithDependencies({ packageDirectory }, createDependencies()),
    ).rejects.toMatchObject({
      filePath: path.join(packageDirectory, "package.json"),
      issue: "root-not-object",
      name: "NpmPackageJsonFileError",
      operation: "read",
    } satisfies Partial<NpmPackageJsonFileError>);
  },
);

test.each([
  ["missing", Object.assign(new Error("missing"), { code: "ENOENT" }), undefined],
  ["unreadable", Object.assign(new Error("denied"), { code: "EACCES" }), undefined],
  ["malformed", Object.assign(new Error("invalid JSON"), { code: "EJSONPARSE" }), "invalid-json"],
] as const)("translates %s package loading failures", async (_label, cause, issue) => {
  loadFailure = cause;
  const packageDirectory = path.resolve("fixtures", _label);

  await expect(
    loadNpmPackageJsonFileWithDependencies({ packageDirectory }, createDependencies()),
  ).rejects.toMatchObject({
    cause,
    filePath: path.join(packageDirectory, "package.json"),
    issue,
    name: "NpmPackageJsonFileError",
    operation: "read",
  } satisfies Partial<NpmPackageJsonFileError>);
});

test("translates update and save failures at their adapter boundary", async () => {
  const updateCause = new Error("update exploded");
  fakePackageJson = new FakePackageJson({}, undefined, updateCause);
  const packageDirectory = path.resolve("fixtures", "update-failure");

  await expect(
    loadNpmPackageJsonFileWithDependencies({ packageDirectory }, createDependencies()),
  ).rejects.toMatchObject({
    cause: updateCause,
    operation: "read",
  } satisfies Partial<NpmPackageJsonFileError>);

  const saveCause = new Error("save exploded");
  fakePackageJson = new FakePackageJson({}, saveCause);
  const adapter = await loadNpmPackageJsonFileWithDependencies(
    { packageDirectory },
    createDependencies(),
  );
  await expect(adapter.save()).rejects.toMatchObject({
    cause: saveCause,
    filePath: path.join(packageDirectory, "package.json"),
    name: "NpmPackageJsonFileError",
    operation: "write",
  } satisfies Partial<NpmPackageJsonFileError>);
});

function createDependencies(): TestDependencies {
  return {
    PackageJson: {
      async load(packageDirectory) {
        loadedDirectories.push(packageDirectory);
        if (loadFailure !== undefined) {
          throw loadFailure;
        }
        return fakePackageJson;
      },
    },
  };
}
