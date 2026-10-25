import { fuseLibraryCandidates } from "../../workspace-direct-mount/darwin/fuse-libraries";
import type { DepsIo } from "../../workspace-direct-mount/deps-io";
import { winFspRestartPending } from "../../workspace-direct-mount/install/win32/winfsp-restart-marker";
import {
  managedRcloneFor,
  PATH_RCLONE,
  type RcloneBinary
} from "../../workspace-direct-mount/managed-rclone";
import { type MountPlatform, mountPlatformOf } from "../../workspace-direct-mount/mount-platform";
import { rcloneBuildVerdict } from "../../workspace-direct-mount/rclone-build-verdict";
import type { PreflightProblems } from "../../workspace-direct-mount/rclone-preflight-problem";
import { isWinFspArch, winFspLibraryFor } from "../../workspace-direct-mount/win32/winfsp-library";

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
  const binary = rcloneBinaryFor(io);
  return { binary, problems: { rclone: rcloneProblem(io, binary), fuse: fuseProblem(io) } };
}

/**
 * Where an `rclone` found by name may stand in for a missing managed copy.
 * Never on Windows: a bare name is looked up in the working folder before PATH
 * there, and the offer installs the pinned copy with no administrator, so the
 * drive runs only the copy the CLI put in place.
 */
const PATH_RCLONE_ON = {
  darwin: true,
  linux: true,
  win32: false
} as const satisfies Record<MountPlatform, boolean>;

/**
 * ONE rule for which rclone runs: the managed copy when it exists, else the
 * PATH name where that is allowed — else the managed path still, which the
 * probe then reports missing and the offer fills. The brand's only minting
 * site, and unexported, so the probe above is the only way to hold an
 * RcloneBinary: the brand then means "the probe saw this one".
 */
function rcloneBinaryFor(io: DepsIo): RcloneBinary {
  const platform = mountPlatformOf(io.platform);
  const managed = managedRcloneFor(platform);
  const chosen = io.exists(managed) || !PATH_RCLONE_ON[platform] ? managed : PATH_RCLONE;
  return chosen as RcloneBinary;
}

/**
 * The `cmount` build tag is the mount capability on macOS and Windows only.
 * Linux rclone mounts through its own FUSE package (`cmd/mount`), which carries
 * no build tag, so on Linux the tag list says nothing and is not read — and a
 * plain `nexus workspace mount <slug>` runs rclone there (direct, or the rclone
 * engine it falls back to), so refusing an old build that prints no tag line
 * would break it for a user who never opted into anything.
 */
function rcloneProblem(io: DepsIo, binary: RcloneBinary): PreflightProblems["rclone"] {
  const version = io.rcloneVersion(binary);
  if (version === null) return { kind: "rclone-missing" };
  // The file is there and the OS refused it: named, never reinstalled in a loop.
  if (typeof version === "object")
    return { kind: "rclone-blocked", path: binary, code: version.refused };
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
 * kernel. Windows needs WinFsp: its registry key names the install directory,
 * and the DLL rclone loads for this CPU must sit under it — a driver whose
 * registry read could not run passes, the same rule as an unknown macFUSE.
 */
const FUSE_PROBE_FOR = {
  darwin: darwinFuseProblem,
  // FUSE is in the Linux kernel, but WSL1 and most containers expose no
  // device: without it rclone fails after the network call with a raw tail.
  linux: (io) => (io.exists("/dev/fuse") ? null : { kind: "no-fuse-device" }),
  win32: win32FuseProblem
} as const satisfies Record<MountPlatform, (io: DepsIo) => PreflightProblems["fuse"]>;

function fuseProblem(io: DepsIo): PreflightProblems["fuse"] {
  return FUSE_PROBE_FOR[mountPlatformOf(io.platform)](io);
}

/**
 * WinFsp on this machine: its key and this CPU's DLL (`installed`), missing
 * (`absent`), or a registry read that could not run (`unknown`). A CPU WinFsp
 * ships no DLL for is not this probe's to judge: the key alone reads installed,
 * and rclone will say.
 */
export function winFspPresence(io: DepsIo): "installed" | "absent" | "unknown" {
  const installDir = io.winFspInstallDir();
  if (installDir === "unknown") return "unknown";
  if (installDir === null) return "absent";
  if (!isWinFspArch(io.arch)) return "installed";
  return io.exists(winFspLibraryFor(installDir.dir, io.arch)) ? "installed" : "absent";
}

function win32FuseProblem(io: DepsIo): PreflightProblems["fuse"] {
  if (winFspRestartPending((file) => io.exists(file))) return { kind: "winfsp-restart-pending" };
  return winFspPresence(io) === "absent" ? { kind: "no-winfsp" } : null;
}

function darwinFuseProblem(io: DepsIo): PreflightProblems["fuse"] {
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
