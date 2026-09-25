import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import { fuseLibraryCandidates } from "../../workspace-direct-mount/fuse-libraries";
import {
  MANAGED_RCLONE,
  PATH_RCLONE,
  type RcloneBinary
} from "../../workspace-direct-mount/managed-rclone";
import { rcloneBuildVerdict } from "../../workspace-direct-mount/rclone-build-verdict";
import type { PreflightProblems } from "../../workspace-direct-mount/rclone-preflight-problem";

/** The binary the probe looked at — the only one the spawn may run — and what it found wrong. */
export interface RclonePreflight {
  readonly binary: RcloneBinary;
  readonly problems: PreflightProblems;
}

/**
 * The two questions asked before any credential is minted, answered as two
 * slots: can this rclone mount, and is a FUSE library there for it to load.
 * Both are always asked, so one plan can fix both at once; the old probe
 * stopped at the first problem and would have asked the person twice.
 *
 * The binary is resolved here, once, and returned: a managed copy first, else
 * the PATH name. Everything downstream — the version check, the spawn — uses
 * this value, never a second lookup.
 *
 * debt: a managed copy that exists but cannot run still wins over a working
 *       PATH rclone, and its refusal says "none was found on PATH". The offer
 *       reinstalls it, which heals a damaged file; name the managed path in
 *       the refusal when a copy that cannot run on this machine is reported.
 */
export function rclonePreflight(io: DepsIo): RclonePreflight {
  const binary = rcloneBinaryFor(io.exists);
  return { binary, problems: { rclone: rcloneProblem(io, binary), fuse: fuseProblem(io) } };
}

/**
 * ONE rule for which rclone runs: the managed copy when it exists, else the
 * PATH name. The brand's only minting site, and unexported, so the probe above
 * is the only way to hold an RcloneBinary: the brand then means "the probe saw
 * this one".
 */
function rcloneBinaryFor(exists: (file: string) => boolean): RcloneBinary {
  return (exists(MANAGED_RCLONE) ? MANAGED_RCLONE : PATH_RCLONE) as RcloneBinary;
}

/**
 * The `cmount` build tag is the mount capability on macOS and Windows only.
 * Linux rclone mounts through its own FUSE package (`cmd/mount`), which carries
 * no build tag, so on Linux the tag list says nothing and is not read — and
 * `rclone` is the DEFAULT engine there, so refusing an old build that prints no
 * tag line would break a plain `nexus workspace mount <slug>` for a user who
 * never opted into anything.
 */
function rcloneProblem(io: DepsIo, binary: RcloneBinary): PreflightProblems["rclone"] {
  const version = io.rcloneVersion(binary);
  if (version === null) return { kind: "rclone-missing" };
  if (io.platform === "linux") return null;
  const verdict = rcloneBuildVerdict(version);
  return verdict === "mount-capable" ? null : { kind: "no-mount-support", verdict };
}

/**
 * Walk the loader's candidates in rclone's own order and stop at the first
 * file that exists, exactly as rclone will at launch. A macFUSE hit is only a
 * plug once its kernel extension is approved; `unknown` passes, because a
 * loader that could not run has said nothing, and rclone meeting the real
 * library is a better test than a probe that could not run. FUSE-T and a
 * user's own `CGOFUSE_LIBFUSE_PATH` need nothing more. Linux has FUSE in the
 * kernel; Windows needs WinFsp, which is not probed — the install hint names it.
 */
function fuseProblem(io: DepsIo): PreflightProblems["fuse"] {
  if (io.platform !== "darwin") return null;
  const found = fuseLibraryCandidates(io.env).find((candidate) => io.exists(candidate.path));
  if (found === undefined) return { kind: "no-fuse-library" };
  switch (found.kind) {
    case "custom":
    case "fuse-t":
      return null;
    case "macfuse":
      return io.macFuseApproved() === false ? { kind: "macfuse-not-approved" } : null;
    default:
      return found satisfies never;
  }
}
