import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const requiredPaths = [
  "package.json",
  "tsconfig.base.json",
  ".env.example",
  "README.md",
  "packages/siwd-core/package.json",
  "packages/siwd-verify/package.json",
  "packages/siwd-browser/package.json",
  "apps/demo/package.json",
  "vectors/.gitkeep"
];

const missing = requiredPaths.filter((relativePath) => !existsSync(join(root, relativePath)));

if (missing.length > 0) {
  console.error(`Missing scaffold paths:\n${missing.map((path) => `- ${path}`).join("\n")}`);
  process.exit(1);
}

const workspacePackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const expectedWorkspaces = ["packages/*", "apps/*"];

if (!Array.isArray(workspacePackage.workspaces)) {
  console.error("Root package.json must define npm workspaces.");
  process.exit(1);
}

for (const expected of expectedWorkspaces) {
  if (!workspacePackage.workspaces.includes(expected)) {
    console.error(`Root package.json is missing workspace '${expected}'.`);
    process.exit(1);
  }
}

console.log("Scaffold audit passed.");

