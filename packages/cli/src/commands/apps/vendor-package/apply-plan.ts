import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { VENDOR_DIRECTORY } from "@nexus/vibe-app-vendoring";

import type { VendorPlan } from "./vendor-plan";

export function applyPlan(
  dir: string,
  plan: VendorPlan,
  tarball: { name: string; bytes: Buffer }
): void {
  // The tarball goes down FIRST: every rewrite below points at it, so a run that
  // dies in the middle leaves a manifest whose target exists rather than one
  // pointing at nothing.
  mkdirSync(join(dir, VENDOR_DIRECTORY), { recursive: true });
  writeFileSync(join(dir, VENDOR_DIRECTORY, tarball.name), tarball.bytes);
  for (const write of plan.writes) {
    mkdirSync(dirname(join(dir, write.path)), { recursive: true });
    writeFileSync(join(dir, write.path), write.content);
  }
  for (const removal of plan.removals) rmSync(join(dir, removal), { force: true });
}
