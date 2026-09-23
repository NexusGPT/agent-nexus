import fs from "node:fs";

import { FUSE_T_LIBRARY, MACFUSE_LIBRARY } from "../../workspace-direct-mount/fuse-libraries";
import type { RclonePreflightProblem } from "../../workspace-direct-mount/rclone-preflight-problem";
import { macFuseApproved } from "./mac-fuse-approved";

/**
 * rclone loads exactly one of two FUSE libraries on macOS, macFUSE first. Linux
 * has FUSE in the kernel and needs no library check; Windows needs WinFsp, which
 * is not probed — the install hint names it.
 */
export function fuseLibraryProblem(): RclonePreflightProblem | null {
  if (process.platform !== "darwin") return null;
  if (fs.existsSync(MACFUSE_LIBRARY)) {
    // `unknown` passes: we could not check, so we do not accuse.
    return macFuseApproved() === false ? { kind: "macfuse-not-approved" } : null;
  }
  return fs.existsSync(FUSE_T_LIBRARY) ? null : { kind: "no-fuse-library" };
}
