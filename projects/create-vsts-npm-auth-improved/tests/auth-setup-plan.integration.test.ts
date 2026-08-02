import { mkdir } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vitest";
import {
  buildAuthSetupPlan,
  writeAuthSetupPlan,
} from "../src/init-auth/auth-setup/auth-setup-plan";
import { summarizeAuthSetupPlan } from "../src/init-auth/auth-setup/auth-setup-summary";
import { NpmProject } from "@test-utils/npm-project";

afterEach(async () => {
  await NpmProject.cleanupAllAsync();
});

test("an invalid later package prevents registry prompts and all writes", async () => {
  const project = await NpmProject.createAsync("plan-invalid-later-package");
  const originalAlpha = JSON.stringify({ name: "alpha" });
  await project.createPackageAsync({
    directory: "alpha",
    packageJson: originalAlpha,
  });
  await project.createPackageAsync({
    directory: "beta",
    packageJson: "{ malformed",
  });
  const requestRegistry = vi.fn();

  const result = await buildAuthSetupPlan(
    project.root,
    [project.path("alpha/package.json"), project.path("beta/package.json")],
    requestRegistry,
  );

  expect(result).toMatchObject({
    status: "failed",
    failure: {
      type: "invalid-package-json",
      displayPath: "beta/package.json",
      issue: "invalid-json",
    },
  });
  expect(requestRegistry).not.toHaveBeenCalled();
  expect(await project.readFileAsync("alpha/package.json")).toBe(originalAlpha);
  expect(await project.readFileAsync("beta/package.json")).toBe("{ malformed");
  expect(await project.existsAsync("alpha/.npmrc")).toBe(false);
  expect(await project.existsAsync("beta/.npmrc")).toBe(false);
});

test("an unreadable selected npmrc prevents prompts and writes", async () => {
  const project = await NpmProject.createAsync("plan-unreadable-npmrc");
  const originalPackageJson = JSON.stringify({ name: "unreadable-npmrc" });
  await project.createPackageAsync({ packageJson: originalPackageJson });
  await mkdir(project.path(".npmrc"));
  const requestRegistry = vi.fn();

  const result = await buildAuthSetupPlan(
    project.root,
    [project.path("package.json")],
    requestRegistry,
  );

  expect(result).toMatchObject({
    status: "failed",
    failure: {
      type: "file-read-failed",
      displayPath: ".npmrc",
    },
  });
  expect(requestRegistry).not.toHaveBeenCalled();
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.readTreeAsync()).toEqual([".npmrc", "package.json"]);
});

test("cancelling a later registry prompt leaves every selected package untouched", async () => {
  const project = await NpmProject.createAsync("plan-later-cancellation");
  const originalPackageJson = JSON.stringify({ name: "unconfigured" });
  await project.createPackageAsync({
    directory: "alpha",
    packageJson: originalPackageJson,
  });
  await project.createPackageAsync({
    directory: "beta",
    packageJson: originalPackageJson,
  });
  const requestRegistry = vi
    .fn()
    .mockResolvedValueOnce({
      status: "provided",
      registry: "https://alpha.example/",
    })
    .mockResolvedValueOnce({ status: "cancelled" });

  const result = await buildAuthSetupPlan(
    project.root,
    [project.path("alpha/package.json"), project.path("beta/package.json")],
    requestRegistry,
  );

  expect(result).toEqual({ status: "cancelled" });
  expect(requestRegistry).toHaveBeenCalledTimes(2);
  for (const directory of ["alpha", "beta"]) {
    expect(await project.readFileAsync(`${directory}/package.json`)).toBe(
      originalPackageJson,
    );
    expect(await project.existsAsync(`${directory}/.npmrc`)).toBe(false);
  }
});

test("a complete plan reports paths and counts before adapter persistence", async () => {
  const project = await NpmProject.createAsync("plan-complete-persistence");
  const originalPackageJson = JSON.stringify({ name: "complete" });
  await project.createPackageAsync({ packageJson: originalPackageJson });
  const requestRegistry = vi.fn(async () => ({
    status: "provided" as const,
    registry: "https://project.example/",
  }));

  const result = await buildAuthSetupPlan(
    project.root,
    [project.path("package.json")],
    requestRegistry,
  );

  expect(result.status).toBe("ready");
  if (result.status !== "ready") {
    return;
  }
  expect(await project.readFileAsync("package.json")).toBe(originalPackageJson);
  expect(await project.existsAsync(".npmrc")).toBe(false);
  expect(result.plan.packages).toMatchObject([
    {
      displayPath: "package.json",
      packageJson: {
        displayPath: "package.json",
        disposition: "updated",
      },
      npmrc: {
        displayPath: ".npmrc",
        disposition: "created",
      },
    },
  ]);
  expect(summarizeAuthSetupPlan(result.plan)).toEqual({
    packageCount: 1,
    changedPackages: 1,
    unchangedPackages: 0,
    createdFiles: 1,
    updatedFiles: 1,
    unchangedFiles: 0,
  });

  await expect(writeAuthSetupPlan(result.plan)).resolves.toEqual({
    status: "written",
  });
  expect(JSON.parse(await project.readFileAsync("package.json"))).toMatchObject({
    name: "complete",
    devDependencies: { "vsts-npm-auth-improved": "alpha" },
  });
  expect(await project.readFileAsync(".npmrc")).toContain(
    "registry=https://project.example/",
  );
});
