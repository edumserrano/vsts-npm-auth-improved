import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ["./tests/_test-utils/vitest-custom-matchers.ts"],
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
    include: ["tests/**/*.test.ts"],
    exclude: ["node_modules", "dist"],
    coverage: {
      provider: "v8",
      reporter: [
        "text-summary",
        ["html", { subdir: "html-report" }],
        ["lcovonly", { file: "lcov-report.info" }],
        ["cobertura", { file: "cobertura-report.xml" }],
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
      "@vsts-npm-auth-improved": path.resolve(import.meta.dirname, "src/public-api.ts"),
      "@test-utils": path.resolve(import.meta.dirname, "tests/_test-utils"),
    },
  },
});
