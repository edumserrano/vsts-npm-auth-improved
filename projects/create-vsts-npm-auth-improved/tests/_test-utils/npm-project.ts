import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Creates isolated npm project fixtures below one temporary parent directory.
 * It validates each fixture path and records and normalizes file-system state.
 * It prevents cleanup outside the test-owned name and directory boundary.
 */

const ownedRootsParent = path.join(
  os.tmpdir(),
  "create-vsts-npm-auth-improved-tests",
);
const ownedRootPrefix = "npm-project-";

export type NpmPackageFixture = {
  readonly directory?: string;
  readonly npmrc?: string;
  readonly packageJson: string;
};

export class NpmProject {
  private static readonly activeProjects = new Set<NpmProject>();
  private removed = false;

  private constructor(public readonly root: string) {}

  public static async createAsync(name: string): Promise<NpmProject> {
    const validatedName = validateFixtureName(name);
    await mkdir(ownedRootsParent, { recursive: true });
    const root = await mkdtemp(
      path.join(ownedRootsParent, `${ownedRootPrefix}${validatedName}-`),
    );
    const project = new NpmProject(root);
    project.assertOwnedRoot();
    NpmProject.activeProjects.add(project);
    return project;
  }

  public static async cleanupAllAsync(): Promise<void> {
    const projects = [...NpmProject.activeProjects];
    await Promise.all(projects.map(project => project.cleanupAsync()));
  }

  public path(relativePath = ""): string {
    const resolvedPath = path.resolve(this.root, relativePath);
    const relativeToRoot = path.relative(this.root, resolvedPath);
    if (
      relativeToRoot === ".." ||
      relativeToRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeToRoot)
    ) {
      throw new Error(
        `Fixture path must remain inside the test-owned root: ${relativePath}`,
      );
    }
    return resolvedPath;
  }

  public async createPackageAsync(fixture: NpmPackageFixture): Promise<void> {
    const directory = fixture.directory ?? "";
    await this.writeFileAsync(
      path.join(directory, "package.json"),
      fixture.packageJson,
    );
    if (fixture.npmrc !== undefined) {
      await this.writeFileAsync(path.join(directory, ".npmrc"), fixture.npmrc);
    }
  }

  public async writeFileAsync(
    relativePath: string,
    content: string,
  ): Promise<void> {
    const filePath = this.path(relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }

  public async readFileAsync(relativePath: string): Promise<string> {
    return readFile(this.path(relativePath), "utf8");
  }

  public async existsAsync(relativePath: string): Promise<boolean> {
    try {
      await access(this.path(relativePath));
      return true;
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") {
        return false;
      }
      throw error;
    }
  }

  public async readTreeAsync(): Promise<string[]> {
    return readTreeAsync(this.root);
  }

  public normalizePath(filePath: string): string {
    const relativePath = path.relative(this.root, path.resolve(filePath));
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      throw new Error(`Path is outside the test-owned root: ${filePath}`);
    }
    return relativePath === ""
      ? "<test-root>"
      : `<test-root>/${relativePath.replaceAll(path.sep, "/")}`;
  }

  public async cleanupAsync(): Promise<void> {
    if (this.removed) {
      return;
    }
    this.assertOwnedRoot();
    await rm(this.root, { recursive: true, force: true });
    this.removed = true;
    NpmProject.activeProjects.delete(this);
  }

  private assertOwnedRoot(): void {
    const resolvedRoot = path.resolve(this.root);
    if (
      path.dirname(resolvedRoot) !== ownedRootsParent ||
      !path.basename(resolvedRoot).startsWith(ownedRootPrefix)
    ) {
      throw new Error(`Refusing to remove non-test-owned path: ${resolvedRoot}`);
    }
  }
}

async function readTreeAsync(root: string, relativeDirectory = ""): Promise<string[]> {
  const directoryPath = path.join(root, relativeDirectory);
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name),
  )) {
    const relativePath = path.join(relativeDirectory, entry.name);
    paths.push(relativePath.replaceAll(path.sep, "/"));
    if (entry.isDirectory()) {
      paths.push(...(await readTreeAsync(root, relativePath)));
    }
  }
  return paths;
}

function validateFixtureName(name: string): string {
  const normalized = name.trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-");
  const validated = normalized.replace(/^-+|-+$/g, "");
  if (validated === "") {
    throw new Error("A test fixture name containing letters or numbers is required.");
  }
  return validated;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
