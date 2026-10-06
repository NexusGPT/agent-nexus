/**
 * Print the bundle delta between two `skills-content.generated.json` payloads as
 * markdown, for `release-version.yml` to put in the release PR body.
 *
 * Run:   pnpm dlx tsx packages/cli/scripts/render-bundle-delta.ts <before.json> <after.json>
 *
 * Exit 2 when either payload cannot be read: a release PR that says nothing about
 * its bundle and one whose bundle did not change must not look the same.
 */

import fs from "node:fs";

import { type BundlePayload, renderBundleDelta } from "./skills-drift/bundle-delta";

function readPayload(file: string | undefined): BundlePayload | string {
  if (file === undefined) return "missing argument";
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as Partial<BundlePayload>;
    if (typeof parsed.sha !== "string" || typeof parsed.SKILLS !== "object") {
      return `${file} is not a skills payload (no sha / SKILLS)`;
    }
    return parsed as BundlePayload;
  } catch (error) {
    return `${file}: ${error instanceof Error ? error.message : String(error)}`;
  }
}

const before = readPayload(process.argv[2]);
const after = readPayload(process.argv[3]);
if (typeof before === "string" || typeof after === "string") {
  console.error(
    `render-bundle-delta: ${typeof before === "string" ? before : ""} ${typeof after === "string" ? after : ""}`.trim()
  );
  process.exit(2);
}
process.stdout.write(renderBundleDelta(before, after) + "\n");
