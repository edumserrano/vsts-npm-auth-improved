"use strict";

const [tool, minimumVersion] = process.argv.slice(2);

const currentVersions = {
  node: process.versions.node,
  npm: process.env.npm_config_user_agent?.match(/^npm\/([^ ]+)/)?.[1],
};

if (!(tool in currentVersions) || !minimumVersion) {
  console.error("Usage: node check-required-version.cjs <node|npm> <minimum-version>");
  process.exit(1);
}

const currentVersion = currentVersions[tool];
const displayName = tool === "node" ? "Node.js" : "npm";

const isAtLeast = (actual, minimum) => {
  const current = actual.replace(/^v/, "").split(".").map(Number);
  const required = minimum.replace(/^v/, "").split(".").map(Number);

  for (let index = 0; index < Math.max(current.length, required.length); index += 1) {
    const currentPart = current[index] ?? 0;
    const requiredPart = required[index] ?? 0;

    if (currentPart !== requiredPart) {
      return currentPart > requiredPart;
    }
  }

  return true;
};

if (!currentVersion || !isAtLeast(currentVersion, minimumVersion)) {
  console.error(
    `${displayName} >=${minimumVersion} is required. Current version: ${currentVersion ?? "unknown"}`,
  );
  process.exit(1);
}