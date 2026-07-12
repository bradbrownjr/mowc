#!/usr/bin/env node
/**
 * DESIGN.md "Enforcement" section: no {@html} in .svelte files (SECURITY.md
 * XSS rule), and no hardcoded hex color literals outside styles.css (tokens
 * only). Run as part of `npm run check` in this workspace.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function findSvelteFiles(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...findSvelteFiles(full));
    } else if (entry.endsWith(".svelte")) {
      files.push(full);
    }
  }
  return files;
}

const htmlDirectivePattern = /\{@html/;
const hexColorPattern = /#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?\b/;

let failed = false;

for (const file of findSvelteFiles(srcDir)) {
  const content = readFileSync(file, "utf-8");
  const rel = path.relative(process.cwd(), file);

  if (htmlDirectivePattern.test(content)) {
    console.error(`${rel}: contains banned {@html} directive (SECURITY.md)`);
    failed = true;
  }

  if (hexColorPattern.test(content)) {
    console.error(`${rel}: contains a hardcoded hex color literal; use a token from styles.css (DESIGN.md)`);
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}

console.log("Enforcement checks passed: no {@html}, no hardcoded hex colors in client/src/**/*.svelte");
