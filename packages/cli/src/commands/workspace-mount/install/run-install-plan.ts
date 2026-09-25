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
import { installFuseTCask, installFuseTPkg } from "./install-fuse-t";
import { withInstallLock } from "./install-lock";
import { installRcloneZip } from "./install-rclone-zip";

/**
 * Run a plan's steps in the order the plan gave them — worker before plug —
 * under the one machine-wide lock. This is the only place a step is turned
 * into the pin values its installer needs, so the URL, hash and file name
 * the person read on screen (render-step.ts reads the same pins) are the ones
 * that run. A step that fails throws its own refusal, naming which program
 * and why; the steps after it do not run.
 */
export async function runInstallPlan(io: DepsIo, steps: InstallSteps): Promise<void> {
  await withInstallLock(async () => {
    for (const step of steps) await runStep(io, step);
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
    default:
      return step satisfies never;
  }
}
