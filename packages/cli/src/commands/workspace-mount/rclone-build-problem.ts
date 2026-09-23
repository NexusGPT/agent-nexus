import { rcloneBuildVerdict } from "../../workspace-direct-mount/rclone-build-verdict";
import type { RclonePreflightProblem } from "../../workspace-direct-mount/rclone-preflight-problem";

/**
 * The `cmount` build tag is the mount capability on macOS and Windows only.
 * Linux rclone mounts through its own FUSE package (`cmd/mount`), which carries
 * no build tag at all, so on Linux the tag list says NOTHING about whether this
 * binary can mount and is not read.
 *
 * 🚨 THE LINUX ARM IS A COMPATIBILITY FLOOR, NOT TUNING. `rclone` is the DEFAULT
 * engine on Linux, and before this branch the whole gate was "`rclone version`
 * exits 0". Refusing a `no-tags-line` verdict there — an rclone old enough not
 * to print `go/tags:` — would break a plain `nexus workspace mount <slug>` for
 * a user who never opted into anything.
 */
export function buildProblem(version: string): RclonePreflightProblem | null {
  if (process.platform === "linux") return null;
  const build = rcloneBuildVerdict(version);
  return build === "mount-capable" ? null : { kind: "no-mount-support", verdict: build };
}
