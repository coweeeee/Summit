#!/usr/bin/env node
//
// Copies the canonical legal content into web/ so the public site can render
// the same documents the app does.
//
// WHY A COPY RATHER THAN AN IMPORT: web/ is deliberately outside the pnpm
// workspace (see web/README.md — pulling it in risks the dependency graph that
// took real effort to repair), and Vercel builds from web/ alone, so a relative
// import reaching up into artifacts/mobile would not be deployed. A generated
// copy sidesteps both problems without weakening either.
//
// The copy is VERBATIM apart from a header. That is the whole point: there is
// nothing to get subtly wrong in the transform, and the drift check is a plain
// string comparison. lib/legalContent.ts imports nothing, precisely so this
// works.
//
// Run: pnpm sync:web-legal
// A test fails if this has not been run after editing the canonical file.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const SOURCE = join(root, "artifacts/mobile/lib/legalContent.ts");
export const TARGET = join(root, "web/legal-content.generated.ts");

export const HEADER = `// GENERATED FILE — DO NOT EDIT.
//
// Verbatim copy of artifacts/mobile/lib/legalContent.ts, which is the canonical
// source for both the in-app screens and this public site. Edit that file and
// run \`pnpm sync:web-legal\`; a test fails if these two have drifted.
//
// Copied rather than imported because web/ sits outside the pnpm workspace and
// Vercel builds from web/ alone — see scripts/sync-web-legal.mjs.

`;

export function render() {
  return HEADER + readFileSync(SOURCE, "utf8");
}

// Only write when invoked directly, so the test can import the expected output
// without touching the filesystem.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = render();
  let before = "";
  try {
    before = readFileSync(TARGET, "utf8");
  } catch {
    /* first run */
  }
  if (before === out) {
    console.log("web/legal-content.generated.ts already up to date");
  } else {
    writeFileSync(TARGET, out);
    console.log(`wrote ${TARGET}`);
  }
}
