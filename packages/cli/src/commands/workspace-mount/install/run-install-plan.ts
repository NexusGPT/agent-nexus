import type { DepsIo } from "../../../workspace-direct-mount/deps-io";
import {
  FUSE_T_PIN,
  fuseTPkgName,
  fuseTPkgUrl,
  RCLONE_PIN,
  rcloneZipMember,
  rcloneZipUrl
} from "../../../workspace-direct-mount/install/install-pins";
import type {
  InstallStep,
  InstallSteps
} from "../../../workspace-direct-mount/install/install-plan";
import {
  WINFSP_PIN,
  winFspMsiName,
  winFspMsiUrl
} from "../../../workspace-direct-mount/install/win32/winfsp-pin";
import type { PreflightProblems } from "../../../workspace-direct-mount/rclone-preflight-problem";
import { rclonePreflight, winFspPresence } from "../rclone-preflight";
import { installFuseTCask, installFuseTPkg } from "./darwin/install-fuse-t";
import { withInstallLock } from "./install-lock";
import { installRcloneZip } from "./install-rclone-zip";
import { installWinFspMsi } from "./win32/install-winfsp-msi";

/**
 * Whether a step's work is already done, read under the lock. Only a POSITIVE
 * reading skips a step: the preflight passes a WinFsp key it could not read
 * (rclone is the better judge), which proves nothing installed, so the MSI
 * step asks for the key and this CPU's DLL instead.
 */
const DONE_UNDER_LOCK = {
  "rclone-zip": (_io, problems) => problems.rclone === null,
  "fuse-t-cask": (_io, problems) => problems.fuse === null,
  "fuse-t-pkg": (_io, problems) => problems.fuse === null,
  "winfsp-msi": (io) => winFspPresence(io) === "installed"
} as const satisfies Record<
  InstallStep["kind"],
  (io: DepsIo, problems: PreflightProblems) => boolean
>;

/**
 * Run a plan's steps in the order the plan gave them — worker before plug —
 * under the one machine-wide lock. This is the only place a step is turned
 * into the pin values its installer needs, so the URL, hash and file name
 * the person read on screen (render-step.ts reads the same pins) are the ones
 * that run. A step that fails throws its own refusal, naming which program
 * and why; the steps after it do not run.
 *
 * The plan was built from a probe taken before the lock. A second mount can
 * install in that window, so the preflight probe runs again once the lock is
 * held, and a step whose work is now done is skipped: no second download and
 * no rename over an rclone.exe the other mount is running, no second sudo
 * prompt for FUSE-T, no second UAC prompt for WinFsp.
 */
export async function runInstallPlan(io: DepsIo, steps: InstallSteps): Promise<void> {
  await withInstallLock(async () => {
    const underLock = rclonePreflight(io).problems;
    for (const step of steps) {
      if (DONE_UNDER_LOCK[step.kind](io, underLock)) continue;
      await runStep(io, step);
    }
  });
}

async function runStep(io: DepsIo, step: InstallStep): Promise<void> {
  switch (step.kind) {
    case "rclone-zip":
      return installRcloneZip(io, {
        url: rcloneZipUrl(step.target),
        sha256: RCLONE_PIN.sha256[step.target],
        member: rcloneZipMember(step.target)
      });
    case "fuse-t-cask":
      return installFuseTCask(io, FUSE_T_PIN.cask);
    case "fuse-t-pkg":
      return installFuseTPkg(io, {
        url: fuseTPkgUrl(),
        sha256: FUSE_T_PIN.sha256,
        name: fuseTPkgName(),
        password: step.password
      });
    case "winfsp-msi":
      return installWinFspMsi(io, {
        url: winFspMsiUrl(),
        sha256: WINFSP_PIN.sha256,
        name: winFspMsiName()
      });
    default:
      return step satisfies never;
  }
}
