import type { RcloneEngine } from "../mount-registry";
import type { RcloneBuildVerdict } from "./rclone-build-verdict";

export type RclonePreflightProblem =
  | { readonly kind: "rclone-missing" }
  | {
      readonly kind: "no-mount-support";
      readonly verdict: Exclude<RcloneBuildVerdict, "mount-capable">;
    }
  /** The file is there and the OS would not run it: the errno names the block, and a reinstall cannot lift it. */
  | { readonly kind: "rclone-blocked"; readonly path: string; readonly code: string }
  | { readonly kind: "no-fuse-library" }
  | { readonly kind: "macfuse-not-approved" }
  /** Windows: WinFsp's registry key is absent, or its DLL for this CPU is not under the install directory. */
  | { readonly kind: "no-winfsp" }
  /** Windows: this boot's WinFsp install asked for a restart that has not happened yet. */
  | { readonly kind: "winfsp-restart-pending" }
  /** Linux: no `/dev/fuse` — WSL1, or a container started without the device. */
  | { readonly kind: "no-fuse-device" };

/**
 * The preflight's two answers, one slot each. The probe asks two questions —
 * "can this rclone mount?" then "is a FUSE library there?" — and each answers
 * with one problem or none, so a slot is never a list. The slot order is the
 * run order: worker before plug, so a re-run preflight finds both in place.
 */
export interface PreflightProblems {
  readonly rclone: Extract<
    RclonePreflightProblem,
    { kind: "rclone-missing" | "no-mount-support" | "rclone-blocked" }
  > | null;
  readonly fuse: Extract<
    RclonePreflightProblem,
    {
      kind:
        | "no-fuse-library"
        | "macfuse-not-approved"
        | "no-winfsp"
        | "winfsp-restart-pending"
        | "no-fuse-device";
    }
  > | null;
}

/**
 * Who asked for rclone: an engine named with --engine, or `auto`, which chose
 * direct for a person who typed no flag — so its sentences name no flag.
 */
export type PreflightAsker = RcloneEngine | "auto";

/** The one sentence a preflight refusal opens with, naming the engine that ran it. */
export function preflightProblemMessage(
  problem: RclonePreflightProblem,
  asker: PreflightAsker
): string {
  const who = asker === "auto" ? "This mount" : `--engine ${asker}`;
  switch (problem.kind) {
    case "rclone-missing":
      return `${who} needs rclone, and none was found on PATH.`;
    case "no-mount-support":
      return problem.verdict === "no-mount-support"
        ? `${who} needs an rclone built with FUSE support, and the one on PATH was built without it ` +
            "(its `rclone version` lists no `cmount` build tag — Homebrew's macOS build is the usual cause)."
        : `${who} needs an rclone built with FUSE support, and the one on PATH does not report its ` +
            "build tags (`rclone version` prints no `go/tags:` line) — it is too old, or not rclone.";
    case "rclone-blocked":
      return (
        `${who} found rclone at ${problem.path}, but the OS refused to run it (${problem.code}): ` +
        "a policy blocks it (on Windows Smart App Control, AppLocker or an antivirus; on macOS or Linux " +
        "a noexec mount or SELinux). Ask your administrator to allow it; reinstalling will not help."
      );
    case "no-fuse-library":
      return `${who} needs a FUSE library on macOS, and neither macFUSE nor FUSE-T is installed.`;
    case "macfuse-not-approved":
      return (
        `${who} found macFUSE, but its kernel extension is not approved yet (load_macfuse failed). ` +
        "Approve it under System Settings › Privacy & Security — on Apple Silicon that is a one-time " +
        "Recovery-mode step — then mount again."
      );
    case "no-winfsp":
      return `${who} needs WinFsp, the Windows file-system driver rclone mounts through, and it is not installed.`;
    case "winfsp-restart-pending":
      return `${who} needs WinFsp, which was installed and asked for a restart: restart Windows, then mount again.`;
    case "no-fuse-device":
      return (
        `${who} needs the FUSE device /dev/fuse, and this machine has none: WSL1 and most containers ` +
        "expose none. On WSL use WSL2; on Debian or Ubuntu: sudo apt-get install fuse3."
      );
    default:
      return problem satisfies never;
  }
}
