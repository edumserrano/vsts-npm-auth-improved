import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: false,
    // Clack selects Unicode symbols at module-load time. Make prompt snapshots
    // deterministic when tests run outside a Unicode-detectable Windows terminal.
    env: {
      CI: "true",
    },
    // Suppress console output during tests. Alternatively mock the console methods like console.log,
    // console.error, etc. Without this there's several empty output lines in vitest output due to the
    // console.log() at the start of the cliAsync function in cli.ts
    silent: true,
    environment: "node",
    // Keep real-terminal transcripts deterministic while the emitted-package
    // scenario compiles the CommonJS artifact at its integration boundary.
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      // pretest:ui already cleans the report directory. Preserve its placeholder on
      // startup and the previous report while watch/UI reruns regenerate coverage.
      clean: false,
      cleanOnRerun: false,
      reporter: [
        "text-summary",
        ["html", { subdir: "html-report" }],
        ["lcovonly", { file: "lcov-report.info" }],
        ["cobertura", { file: "cobertura-report.xml" }],
        ["json-summary", { file: "coverage-summary.json" }],
      ],
      reportsDirectory: "./test-reporters/code-coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
    },
    reporters: ["default", "html", "junit"],
    outputFile: {
      html: "./test-reporters/html-report/index.html",
      junit: "./test-reporters/junit-report/vitest-test-results.xml",
    },
  },
  resolve: {
    alias: {
      "@create-vsts-npm-auth-improved": path.resolve(import.meta.dirname, "src/public-api.ts"),
      "@test-utils": path.resolve(import.meta.dirname, "tests/_test-utils"),
    },
  },
});
