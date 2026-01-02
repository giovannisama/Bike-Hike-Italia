#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const SRC_DIR = path.join(__dirname, "..", "src");
const TO_MILLIS_ALLOWLIST = new Set([
  path.join(SRC_DIR, "utils", "firestoreDate.ts"),
]);

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
    } else if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

function checkConsoleLog(filePath, lines) {
  const issues = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.includes("console.log(")) continue;
    const prev = lines[i - 1] || "";
    const prev2 = lines[i - 2] || "";
    const hasDevGuard =
      line.includes("__DEV__") ||
      prev.includes("__DEV__") ||
      prev2.includes("__DEV__");
    if (!hasDevGuard) {
      issues.push({
        type: "console.log without __DEV__",
        filePath,
        line: i + 1,
      });
    }
  }
  return issues;
}

function checkToMillis(filePath, content) {
  if (TO_MILLIS_ALLOWLIST.has(filePath)) return [];
  const issues = [];
  const regex = /\.toMillis\(/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const line = content.slice(0, match.index).split("\n").length;
    issues.push({
      type: "toMillis usage",
      filePath,
      line,
    });
  }
  return issues;
}

function main() {
  const files = walk(SRC_DIR);
  const issues = [];

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    issues.push(...checkConsoleLog(filePath, lines));
    issues.push(...checkToMillis(filePath, content));
  }

  if (issues.length > 0) {
    console.error("Guardrails failed:");
    for (const issue of issues) {
      console.error(
        `- ${issue.type} at ${path.relative(process.cwd(), issue.filePath)}:${issue.line}`
      );
    }
    process.exit(1);
  }

  console.log("Guardrails OK");
}

main();
