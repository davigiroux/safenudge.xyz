#!/usr/bin/env node
// Fails CI when the app uses a translation key that a locale file lacks.
// i18next renders a missing key as the raw key, and neither tsc nor the build
// notices. Only string-literal keys are checked; keys built at runtime are not.
//
// Usage: node scripts/check-i18n-keys.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(repoRoot, "app", "src");
const locales = Object.fromEntries(
  ["pt-BR", "en"].map((name) => [
    name,
    JSON.parse(fs.readFileSync(path.join(srcDir, "i18n", `${name}.json`), "utf-8")),
  ])
);
const namespaces = new Set(Object.keys(locales.en));

function hasKey(locale, key) {
  let node = locale;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object" || !(part in node)) return false;
    node = node[part];
  }
  return true;
}

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

const KEY_LITERAL = /['"`]([a-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)['"`]/g;
const missing = [];
let checked = 0;

for (const file of sourceFiles(srcDir)) {
  const source = fs.readFileSync(file, "utf-8");
  for (const [, key] of source.matchAll(KEY_LITERAL)) {
    if (!namespaces.has(key.split(".")[0])) continue;
    checked += 1;
    for (const [name, locale] of Object.entries(locales)) {
      if (!hasKey(locale, key)) {
        missing.push(`${path.relative(repoRoot, file)}: "${key}" is not in ${name}.json`);
      }
    }
  }
}

if (missing.length > 0) {
  console.error(`✗ ${missing.length} translation key(s) used in the app are missing:`);
  for (const line of [...new Set(missing)]) console.error(`  ${line}`);
  process.exit(1);
}
console.log(`✓ ${checked} translation key uses, all present in pt-BR.json and en.json`);
