import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: false,
    setupFiles: ["./tests/_test-utils/vitest-custom-matchers.ts"],
    // Clack selects Unicode symbols when the module loads. Set the terminal
    // environment to make prompt snapshots repeatable on Windows.
    env: {
      CI: "true",
    },
    // Suppress console output during tests. As an alternative, mock console
    // methods such as console.log and console.error. The console.log call at the
    // start of cliAsync otherwise adds empty lines to the Vitest output.
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
      "@vsts-npm-auth-improved": path.resolve(import.meta.dirname, "src/public-api.ts"),
      "@test-utils": path.resolve(import.meta.dirname, "tests/_test-utils"),
    },
  },
});
