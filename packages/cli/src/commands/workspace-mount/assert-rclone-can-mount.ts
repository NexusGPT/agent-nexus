import { execFileSync } from "node:child_process";

import { failure } from "../../errors";
import type { RcloneEngine } from "../../mount-registry";
import { rcloneInstallHint } from "../../workspace-direct-mount/rclone-install-hint";
import {
  preflightProblemMessage,
  type RclonePreflightProblem
} from "../../workspace-direct-mount/rclone-preflight-problem";
import { fuseLibraryProblem } from "./fuse-library-problem";
import { buildProblem } from "./rclone-build-problem";

// ── rclone preflight ──────────────────────────────────────────────────────────
//
// Run before any mint by every engine that spawns rclone. The binary probed is
// the PATH-resolved `rclone` the spawn below will run, so the two cannot
// disagree on a machine where a Homebrew build sits ahead of the official one.

function rclonePreflight(): RclonePreflightProblem | null {
  let version: string;
  try {
    version = execFileSync("rclone", ["version"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch {
    return { kind: "rclone-missing" };
  }
  return buildProblem(version) ?? fuseLibraryProblem();
}

/** Refuse, naming the fix, before a mint that a failed spawn would waste. */
export function assertRcloneCanMount(engine: RcloneEngine): void {
  const problem = rclonePreflight();
  if (problem === null) return;
  throw failure(
    "local-failed",
    preflightProblemMessage(problem, engine),
    rcloneInstallHint(process.platform)
  );
}
