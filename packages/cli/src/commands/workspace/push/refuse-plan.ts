import fs from "node:fs";
import path from "node:path";

import { refuse } from "../../../errors";
import { formatBytes } from "./format-bytes";
import { PACK_MAX_BYTES } from "./pack-limits";
import type { PushPlan } from "./push-plan";

/** A source that does not exist is the caller's mistake, refused before any request. */
export function missingSource(sources: readonly string[]): string | undefined {
  return sources.find((source) => !fs.existsSync(path.resolve(source)));
}

/** The plan's own refusals, each before any request: nothing to send, or something that must not be. */
export function refusePlan(plan: PushPlan): number | null {
  if (plan.dangling.length > 0) {
    return refuse(`Symlink target does not exist: ${plan.dangling.join(", ")}`);
  }
  if (plan.loops.length > 0) {
    return refuse(
      `Symlink leads back into the folder being pushed: ${plan.loops.join(", ")}`,
      "Remove the link, or push the folder it points at directly."
    );
  }
  if (plan.duplicates.length > 0) {
    const named = plan.duplicates
      .map((d) => `${d.remotePath} (${d.first} and ${d.second})`)
      .join("; ");
    return refuse(
      `Two sources land on one destination: ${named}`,
      "Push them in two runs, or into two folders (<slug>:<folder>)."
    );
  }
  if (plan.invalid.length > 0) {
    const named = plan.invalid
      .map((entry) => `${entry.remotePath} (${entry.localPath}): ${entry.reason}`)
      .join("; ");
    return refuse(
      `${plan.invalid.length} destination${plan.invalid.length === 1 ? "" : "s"} the workspace cannot hold: ${named}`,
      "Rename the file, or push it into a folder whose name the rules allow."
    );
  }
  if (plan.unreadable.length > 0) {
    return refuse(
      `Cannot read ${plan.unreadable.join(", ")}`,
      "Check the file's permissions, or leave it out of the push."
    );
  }
  if (plan.oversized.length > 0) {
    const named = plan.oversized
      .map((entry) => `${entry.localPath} (${formatBytes(entry.size)})`)
      .join(", ");
    return refuse(
      `${plan.oversized.length} file${plan.oversized.length === 1 ? "" : "s"} at or above ${formatBytes(PACK_MAX_BYTES)} cannot be pushed: ${named}`,
      "Mount the workspace and copy it through the drive — the mount has no per-request ceiling."
    );
  }
  if (plan.entries.length === 0) {
    return refuse(
      "Nothing to push: the sources hold no files" +
        (plan.hiddenSkipped > 0 ? ` (${plan.hiddenSkipped} hidden, left out)` : ""),
      plan.hiddenSkipped > 0 ? "Pass --include-hidden to push dot-files too." : undefined
    );
  }
  return null;
}
