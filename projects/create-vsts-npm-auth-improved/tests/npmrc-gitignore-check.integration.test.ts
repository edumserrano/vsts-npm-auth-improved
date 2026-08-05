import { afterEach, expect, test } from "vitest";
import {
  AuthSetupPlan,
  FileChangeKind,
  PlannedNpmrcChange,
} from "../src/init-auth/auth-setup/auth-setup-plan";
import { checkChangedNpmrcFilesForGitignore } from "../src/init-auth/auth-setup/npmrc-gitignore-check";
import { NpmProject } from "@test-utils/npm-project";

afterEach(async () => {
  await NpmProject.cleanupAllAsync();
});

test("reports only ignored npmrc files created or updated by the plan", async () => {
  const project = await NpmProject.createAsync("changed-gitignored-npmrc");
  await project.writeFileAsync(".git/keep", "");
  await project.writeFileAsync(".gitignore", "**/.npmrc\n!packages/kept/.npmrc\n");
  for (const directory of ["created", "updated", "unchanged", "kept"]) {
    await project.writeFileAsync(`packages/${directory}/.npmrc`, "registry=https://example.test/");
  }
  const plan = planWithNpmrcFiles(project, [
    ["packages/created/.npmrc", "created"],
    ["packages/updated/.npmrc", "updated"],
    ["packages/unchanged/.npmrc", "unchanged"],
    ["packages/kept/.npmrc", "updated"],
  ]);

  await expect(checkChangedNpmrcFilesForGitignore(project.root, plan)).resolves.toEqual({
    status: "checked",
    ignoredDisplayPaths: ["packages/created/.npmrc", "packages/updated/.npmrc"],
  });
});

test("respects parent, nested, and negated gitignore rules", async () => {
  const project = await NpmProject.createAsync("npmrc-gitignore-sources");
  await project.writeFileAsync(".git/keep", "");
  await project.writeFileAsync(".gitignore", "workspace/ignored-by-parent/.npmrc\n");
  await project.writeFileAsync("workspace/packages/.gitignore", ".npmrc\n!kept/.npmrc\n");
  for (const relativePath of [
    "ignored-by-parent/.npmrc",
    "packages/ignored-by-nested/.npmrc",
    "packages/kept/.npmrc",
  ]) {
    await project.writeFileAsync(`workspace/${relativePath}`, "registry=https://example.test/");
  }
  const selectedRoot = project.path("workspace");
  const plan = planWithNpmrcFiles(
    project,
    [
      ["workspace/ignored-by-parent/.npmrc", "updated"],
      ["workspace/packages/ignored-by-nested/.npmrc", "created"],
      ["workspace/packages/kept/.npmrc", "updated"],
    ],
    "workspace/",
  );

  await expect(checkChangedNpmrcFilesForGitignore(selectedRoot, plan)).resolves.toEqual({
    status: "checked",
    ignoredDisplayPaths: ["ignored-by-parent/.npmrc", "packages/ignored-by-nested/.npmrc"],
  });
});

test("skips Git ignore discovery when the plan changed no npmrc files", async () => {
  const project = await NpmProject.createAsync("unchanged-npmrc");
  const plan = planWithNpmrcFiles(project, [[".npmrc", "unchanged"]]);

  await expect(checkChangedNpmrcFilesForGitignore(project.root, plan)).resolves.toEqual({
    status: "checked",
    ignoredDisplayPaths: [],
  });
});

function planWithNpmrcFiles(
  project: NpmProject,
  files: readonly (readonly [string, FileChangeKind])[],
  displayPathPrefix = "",
): AuthSetupPlan {
  return {
    packages: files.map(([filePath, disposition]) => ({
      displayPath: filePath.replace(/\.npmrc$/, "package.json"),
      packageJson: {
        displayPath: filePath.replace(/\.npmrc$/, "package.json"),
        disposition: "unchanged",
        filePath: project.path(filePath.replace(/\.npmrc$/, "package.json")),
        save: async () => undefined,
      },
      npmrc: {
        displayPath: filePath.slice(displayPathPrefix.length),
        disposition,
        filePath: project.path(filePath),
        save: async () => undefined,
      } satisfies PlannedNpmrcChange,
    })),
  };
}
