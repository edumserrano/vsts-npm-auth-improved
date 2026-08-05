const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(process.argv[2] ?? process.cwd());
const testsRoot = path.join(projectRoot, "tests");
const sourceRoot = path.join(projectRoot, "src");
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
const publicAlias = `@${packageJson.name}`;
const allowedPublicApiHelper = path.join(
  testsRoot,
  "_test-utils",
  packageJson.name.startsWith("create-") ? "init-auth-command.ts" : "auth-command.ts",
);
const violations = [];

for (const filePath of findTypeScriptFiles(testsRoot)) {
  const source = fs.readFileSync(filePath, "utf8");
  for (const match of source.matchAll(/["'`]([^"'`\r\n]+)["'`]/g)) {
    const specifier = match[1];
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
      continue;
    }
    const resolved = path.resolve(path.dirname(filePath), specifier);
    if (isWithin(sourceRoot, resolved)) {
      violations.push(`${relative(filePath)} references internal application module ${specifier}`);
    }
  }
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
