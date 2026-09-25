import type { RcloneEngine } from "../mount-registry";
import type { RcloneBuildVerdict } from "./rclone-build-verdict";

export type RclonePreflightProblem =
  | { readonly kind: "rclone-missing" }
  | {
      readonly kind: "no-mount-support";
      readonly verdict: Exclude<RcloneBuildVerdict, "mount-capable">;
    }
  | { readonly kind: "no-fuse-library" }
  | { readonly kind: "macfuse-not-approved" };

/**
 * The preflight's two answers, one slot each. The probe asks two questions —
 * "can this rclone mount?" then "is a FUSE library there?" — and each answers
 * with one problem or none, so a slot is never a list. The slot order is the
 * run order: worker before plug, so a re-run preflight finds both in place.
 */
export interface PreflightProblems {
  readonly rclone: Extract<
    RclonePreflightProblem,
    { kind: "rclone-missing" | "no-mount-support" }
  > | null;
  readonly fuse: Extract<
    RclonePreflightProblem,
    { kind: "no-fuse-library" | "macfuse-not-approved" }
  > | null;
}

/** The one sentence a preflight refusal opens with, naming the engine that ran it. */
export function preflightProblemMessage(
  problem: RclonePreflightProblem,
  engine: RcloneEngine
): string {
  const who = `--engine ${engine}`;
  switch (problem.kind) {
    case "rclone-missing":
      return `${who} needs rclone, and none was found on PATH.`;
    case "no-mount-support":
      return problem.verdict === "no-mount-support"
        ? `${who} needs an rclone built with FUSE support, and the one on PATH was built without it ` +
            "(its `rclone version` lists no `cmount` build tag — Homebrew's macOS build is the usual cause)."
        : `${who} needs an rclone built with FUSE support, and the one on PATH does not report its ` +
            "build tags (`rclone version` prints no `go/tags:` line) — it is too old, or not rclone.";
    case "no-fuse-library":
      return `${who} needs a FUSE library on macOS, and neither macFUSE nor FUSE-T is installed.`;
    case "macfuse-not-approved":
      return (
        `${who} found macFUSE, but its kernel extension is not approved yet (load_macfuse failed). ` +
        "Approve it under System Settings › Privacy & Security — on Apple Silicon that is a one-time " +
        "Recovery-mode step — then mount again."
      );
    default:
      return problem satisfies never;
  }
}
