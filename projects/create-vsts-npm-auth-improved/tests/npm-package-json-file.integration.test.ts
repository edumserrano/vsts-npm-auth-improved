import path from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  loadNpmPackageJsonFile,
  NpmPackageJsonFileError,
} from "../src/init-auth/package-files/npm-package-json-file";
import { NpmProject } from "@test-utils/npm-project";

const managedScripts = {
  "registry-auth":
    "npm exec --yes --registry=https://registry.npmjs.org/ -- vsts-npm-auth-improved@alpha -- -c ./.npmrc --read",
  "preinstall-packages": "npm run registry-auth",
  "install-packages": "npm i",
} as const;

afterEach(async () => {
  await NpmProject.cleanupAllAsync();
});

test.each([
  {
    expected: {
      name: "new-fields",
      scripts: managedScripts,
      devDependencies: { "vsts-npm-auth-improved": "alpha" },
    },
    initial: { name: "new-fields" },
    label: "adds managed fields",
  },
  {
    expected: {
      name: "conflicts",
      private: true,
      scripts: { ...managedScripts, test: "vitest", lint: "eslint ." },
      custom: { nested: true },
      devDependencies: {
        existing: "2",
        "vsts-npm-auth-improved": "alpha",
      },
    },
    initial: {
      name: "conflicts",
      private: true,
      scripts: {
        test: "vitest",
        "install-packages": "wrong install",
        lint: "eslint .",
        "registry-auth": "wrong auth",
        "preinstall-packages": "wrong preinstall",
      },
      custom: { nested: true },
      devDependencies: {
        "vsts-npm-auth-improved": "0.1.0",
        existing: "2",
      },
    },
    label: "corrects conflicts while preserving unrelated content",
  },
  {
    expected: {
      name: "invalid-containers",
      scripts: managedScripts,
      devDependencies: { "vsts-npm-auth-improved": "alpha" },
    },
    initial: {
      name: "invalid-containers",
      scripts: ["old"],
      devDependencies: "old",
    },
    label: "replaces invalid containers",
  },
])("$label", async ({ expected, initial, label }) => {
  const project = await NpmProject.createAsync(label);
  await project.createPackageAsync({ packageJson: JSON.stringify(initial) });

  const adapter = await loadNpmPackageJsonFile({
    packageDirectory: project.root,
  });
  expect(adapter).toMatchObject({
    disposition: "updated",
    filePath: path.join(project.root, "package.json"),
  });
  await adapter.save();

  expect(JSON.parse(await project.readFileAsync("package.json"))).toEqual(expected);
});

test("passes all dependency sections through npm sorting and reconciliation", async () => {
  const project = await NpmProject.createAsync("all-dependency-types");
  await project.createPackageAsync({
    packageJson: `\uFEFF${JSON.stringify({
      name: "all-dependency-types",
      scripts: { test: "vitest" },
      dependencies: { zebra: "1", sharedOptional: "2", alpha: "3" },
      devDependencies: { zebraDev: "4", alphaDev: "5" },
      optionalDependencies: { sharedOptional: "6", alphaOptional: "7" },
      peerDependencies: { zebraPeer: "8", alphaPeer: "9" },
    })}`,
  });

  const adapter = await loadNpmPackageJsonFile({
    packageDirectory: project.root,
  });
  await adapter.save();

  const content = await project.readFileAsync("package.json");
  expect(content.startsWith("\uFEFF")).toBe(false);
  expect(JSON.parse(content)).toEqual({
    name: "all-dependency-types",
    scripts: { ...managedScripts, test: "vitest" },
    dependencies: { alpha: "3", zebra: "1" },
    devDependencies: {
      alphaDev: "5",
      "vsts-npm-auth-improved": "alpha",
      zebraDev: "4",
    },
    optionalDependencies: { alphaOptional: "7", sharedOptional: "6" },
    peerDependencies: { alphaPeer: "9", zebraPeer: "8" },
  });
});

test("is semantically idempotent on a second run without saving again", async () => {
  const project = await NpmProject.createAsync("second-run");
  await project.createPackageAsync({
    packageJson: JSON.stringify({
      name: "second-run",
      scripts: { test: "vitest" },
      devDependencies: { typescript: "7" },
    }),
  });

  const firstRun = await loadNpmPackageJsonFile({
    packageDirectory: project.root,
  });
  await firstRun.save();
  const savedContent = await project.readFileAsync("package.json");

  const secondRun = await loadNpmPackageJsonFile({
    packageDirectory: project.root,
  });
  expect(secondRun.disposition).toBe("unchanged");
  await secondRun.save();
  expect(await project.readFileAsync("package.json")).toBe(savedContent);
});
test("maps a missing package file to a read failure", async () => {
  const project = await NpmProject.createAsync("missing-package-json");

  await expect(loadNpmPackageJsonFile({ packageDirectory: project.root })).rejects.toMatchObject({
    filePath: project.path("package.json"),
    issue: undefined,
    name: "NpmPackageJsonFileError",
    operation: "read",
  } satisfies Partial<NpmPackageJsonFileError>);
});

test("maps malformed JSON to an invalid-json failure", async () => {
  const project = await NpmProject.createAsync("malformed-package-json");
  await project.createPackageAsync({ packageJson: '{"name":' });

  await expect(loadNpmPackageJsonFile({ packageDirectory: project.root })).rejects.toMatchObject({
    filePath: project.path("package.json"),
    issue: "invalid-json",
    name: "NpmPackageJsonFileError",
    operation: "read",
  } satisfies Partial<NpmPackageJsonFileError>);
});

test.each(["null", "[]", '"package"', "42", "true"])(
  "maps the non-object root %s",
  async packageJson => {
    const project = await NpmProject.createAsync(`non-object-${packageJson}`);
    await project.createPackageAsync({ packageJson });

    await expect(loadNpmPackageJsonFile({ packageDirectory: project.root })).rejects.toMatchObject({
      filePath: project.path("package.json"),
      issue: "root-not-object",
      name: "NpmPackageJsonFileError",
      operation: "read",
    } satisfies Partial<NpmPackageJsonFileError>);
  },
);
