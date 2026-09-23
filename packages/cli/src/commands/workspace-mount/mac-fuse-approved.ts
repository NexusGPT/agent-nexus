import { execFileSync } from "node:child_process";

import { MACFUSE_LOADER } from "../../workspace-direct-mount/fuse-libraries";

/**
 * Whether macFUSE's kernel extension is approved: `load_macfuse` exits 0.
 *
 * 🔴 Three answers, not two. A loader that RAN and refused is a real refusal; a
 * loader that could not be run at all — absent from this macFUSE build, or not
 * executable by this user — establishes nothing. Collapsing the second into the
 * second sent a caller whose macFUSE was installed AND approved to Recovery mode
 * to approve it again, with no way forward. An unknown answer lets the mount
 * proceed: rclone meets the real library and reports the real reason, which is a
 * better test than a probe that could not run.
 */
export function macFuseApproved(): boolean | "unknown" {
  try {
    execFileSync(MACFUSE_LOADER, [], { stdio: "ignore" });
    return true;
  } catch (error) {
    // ENOENT / EACCES: the loader never ran, so it said nothing about approval.
    const code = error instanceof Error && "code" in error ? error.code : undefined;
    if (code === "ENOENT" || code === "EACCES") return "unknown";
    return false;
  }
}
