import path from "node:path";
import { fs, vol } from "memfs";
import mockRequire from "mock-require";
import { afterEach, beforeEach, vi } from "vitest";

/**
 * Replaces Node's filesystem with one fresh memfs volume per test and provides
 * a matching virtual current working directory. Node's native process.chdir
 * can only enter host directories, so cwd/chdir must cross the same boundary.
 */

vi.mock("node:fs", async () => {
  const { fs: memoryFs } = await import("memfs");
  return { ...memoryFs, default: memoryFs };
});

vi.mock("node:fs/promises", async () => {
  const { fs: memoryFs } = await import("memfs");
  return { ...memoryFs.promises, default: memoryFs.promises };
});

// The npm configuration packages are CommonJS and load Node's filesystem via
// createRequire, outside Vitest's ESM module mocker.
mockRequire("fs", fs);
mockRequire("node:fs", fs);
mockRequire("fs/promises", fs.promises);
mockRequire("node:fs/promises", fs.promises);

const hostTestSuiteCwd = process.cwd();
let virtualCwd = hostTestSuiteCwd;
let cwdSpy: ReturnType<typeof vi.spyOn> | undefined;
let chdirSpy: ReturnType<typeof vi.spyOn> | undefined;

beforeEach(() => {
  vol.reset();
  fs.mkdirSync(hostTestSuiteCwd, { recursive: true });
  virtualCwd = hostTestSuiteCwd;

  cwdSpy = vi.spyOn(process, "cwd").mockImplementation(() => virtualCwd);
  chdirSpy = vi.spyOn(process, "chdir").mockImplementation(directory => {
    const resolvedDirectory = path.resolve(virtualCwd, directory);
    const stats = fs.statSync(resolvedDirectory);
    if (!stats.isDirectory()) {
      throw Object.assign(new Error(`ENOTDIR: not a directory, chdir '${resolvedDirectory}'`), {
        code: "ENOTDIR",
        errno: -4052,
        path: resolvedDirectory,
        syscall: "chdir",
      });
    }
    virtualCwd = resolvedDirectory;
  });
});

afterEach(() => {
  chdirSpy?.mockRestore();
  cwdSpy?.mockRestore();
  chdirSpy = undefined;
  cwdSpy = undefined;
  vol.reset();
});
