#!/usr/bin/env node
// Fails CI when the program's error variants drift from the localized error
// maps (issue #44 M-1). Every error in the IDL must have a string in each
// locale's errors.programError, and no stale keys may remain — a missing key
// silently degrades to the generic "something went wrong" toast, a stale key
// is dead copy that can never fire.
//
// Usage: node scripts/sync-error-i18n.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const idlPath = path.join(repoRoot, "app", "src", "idl", "safenudge.json");
const localePaths = ["pt-BR", "en"].map((locale) =>
  path.join(repoRoot, "app", "src", "i18n", `${locale}.json`)
);

const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
const idlErrors = new Set(idl.errors.map((e) => e.name));

let failed = false;

for (const localePath of localePaths) {
  const locale = JSON.parse(fs.readFileSync(localePath, "utf-8"));
  const map = locale.errors?.programError ?? {};
  const localeKeys = new Set(Object.keys(map));

  const missing = [...idlErrors].filter((name) => !localeKeys.has(name));
  const stale = [...localeKeys].filter((name) => !idlErrors.has(name));
  const empty = [...localeKeys].filter((name) => idlErrors.has(name) && !String(map[name]).trim());

  const rel = path.relative(repoRoot, localePath);
  if (missing.length || stale.length || empty.length) {
    failed = true;
    console.error(`✗ ${rel} is out of sync with the IDL error list:`);
    for (const name of missing) console.error(`    missing: errors.programError.${name}`);
    for (const name of stale) console.error(`    stale:   errors.programError.${name} (no such program error)`);
    for (const name of empty) console.error(`    empty:   errors.programError.${name}`);
  } else {
    console.log(`✓ ${rel} covers all ${idlErrors.size} program errors`);
  }
}

if (failed) {
  console.error(
    "\nRegenerate the IDL (anchor build), then add/remove the strings above in app/src/i18n/*.json."
  );
  process.exit(1);
}
