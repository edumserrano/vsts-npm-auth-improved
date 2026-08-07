/**
 * Enforces the test architecture for one project. Tests can access application
 * code only through the public CLI test helper. This script scans module
 * references in test files. It rejects paths to src or production dependencies
 * that are not approved external boundaries. Thus, it identifies unwanted
 * implementation coupling.
 */
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const testsRoot = path.join(projectRoot, "tests");
const sourceRoot = path.join(projectRoot, "src");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const publicAlias = `@${packageJson.name}`;
const productionDependencies = new Set(Object.keys(packageJson.dependencies ?? {}));
const allowedProductionDependencies = new Set(
  packageJson.name === "vsts-npm-auth-improved" ? ["execa"] : [],
);
const allowedPublicApiHelper = path.join(
  testsRoot,
  "_test-utils",
  packageJson.name.startsWith("create-") ? "init-auth-command.ts" : "auth-command.ts",
);
const violations = [];

for (const filePath of findTypeScriptFiles(testsRoot)) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const specifier of findModuleSpecifiers(source)) {
    if (specifier === publicAlias) {
      if (filePath !== allowedPublicApiHelper) {
        violations.push(
          `${relative(filePath)} imports the public application API outside ${relative(allowedPublicApiHelper)}`,
        );
      } else if (
        !new RegExp(
          `import\\s*{\\s*cliAsync\\s*}\\s*from\\s*["']${escapeRegExp(publicAlias)}["']`,
        ).test(source)
      ) {
        violations.push(
          `${relative(filePath)} may import only cliAsync from ${publicAlias}`,
        );
      }
      continue;
    }

    if (!specifier.startsWith(".")) {
      const dependencyName = packageNameFromSpecifier(specifier);
      if (
        productionDependencies.has(dependencyName) &&
        !allowedProductionDependencies.has(dependencyName)
      ) {
        violations.push(
          `${relative(filePath)} references production implementation dependency ${dependencyName}`,
        );
      }
      continue;
    }
    const resolved = path.resolve(path.dirname(filePath), specifier);
    if (isWithin(sourceRoot, resolved)) {
      violations.push(`${relative(filePath)} references internal application module ${specifier}`);
    }
  }
}

function findModuleSpecifiers(source) {
  const specifiers = new Set();
  const moduleReferencePattern =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bvi\.(?:mock|doMock|unmock|doUnmock|importActual|importMock)\s*\(\s*|\bimport\s*)["'`]([^"'`\r\n]+)["'`]/g;
  for (const match of source.matchAll(moduleReferencePattern)) {
    specifiers.add(match[1]);
  }
  return specifiers;
}

function packageNameFromSpecifier(specifier) {
  if (!specifier.startsWith("@")) {
    return specifier.split("/", 1)[0];
  }
  return specifier.split("/", 2).join("/");
}

if (violations.length > 0) {
  console.error("Tests must interact with application code only through cliAsync:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exitCode = 1;
}

function findTypeScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return findTypeScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".ts") ? [entryPath] : [];
  });
}

function isWithin(parent, candidate) {
  const relativePath = path.relative(parent, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath))
  );
}

function relative(filePath) {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, "/");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
