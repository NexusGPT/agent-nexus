/**
 * The deployment-row view, shared by all six transition verbs.
 *
 * Every verb answers with the whole row rather than an acknowledgement, so no
 * verb needs a read-back and all six print through here.
 */

import type { AdminVibeDeploymentResponse } from "../../../admin-wire-types";
import { color, printRecord } from "../../../output";

export function printDeploymentRecord(data: AdminVibeDeploymentResponse): void {
  printRecord(data, [
    { key: "id", label: "Deployment" },
    { key: "vibeAppId", label: "App" },
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: formatDeploymentStatus },
    // `versionNumber` beside `color`, because that pairing IS the reason the
    // contract carries both: the version is what a human names a deployment by,
    // the colour is the internal blue/green slot it happens to occupy.
    { key: "versionNumber", label: "Version", format: (v) => `v${String(v)}` },
    { key: "color", label: "Color" },
    { key: "triggerSha", label: "Trigger sha" },
    { key: "imageRef", label: "Image ref", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "errorReason", label: "Error reason", format: (v) => (v == null ? "—" : String(v)) },
    {
      key: "createdByUserId",
      label: "Created by",
      format: (v) => (v == null ? "system" : String(v))
    },
    { key: "createdAt", label: "Created" },
    { key: "updatedAt", label: "Updated" }
  ]);
}

/**
 * 🔴 THIS IF-CHAIN DISAGREES WITH `apps/_shared/colorize-status.ts` ON HALF THE
 * DEPLOYMENT VOCABULARY, AND IT IS MOVED HERE UNCHANGED RATHER THAN RECONCILED.
 *
 * `colorizeStatus` is a `Record` over both the deployment and build-job unions,
 * held exhaustive by the typecheck, and `admin-vibe-build-job.ts` — a sibling in
 * this same family — already prints through it. This function is reached only by
 * `admin vibe-deployment`. Measured over the eight deployment statuses, with a
 * control proving the probe can see colour at all (`NO_COLOR` in `output-color.ts` is
 * computed at module load from `process.stdout.isTTY`, so an un-stubbed probe
 * reads PLAIN for every row and scores zero divergence):
 *
 *     status             here      colorizeStatus
 *     BUILDING           plain     yellow      <- differs
 *     AWAITING_APPROVAL  yellow    yellow
 *     DEPLOYING          plain     yellow      <- differs
 *     HEALTHY            green     green
 *     FAILED             red       red
 *     ROLLED_BACK        red       red
 *     SUPERSEDED         plain     dim         <- differs
 *     CANCELLED          plain     dim         <- differs
 *
 * Four of eight. Switching to `colorizeStatus` would be the right call on the
 * merits — it is exhaustive, it cannot silently drop a status added upstream,
 * and it is what the rest of this vocabulary already uses — but it CHANGES WHAT
 * THIS COMMAND PRINTS, so it is not a move a pure decomposition may make. It
 * needs its own change, with the colour difference as the stated subject.
 */
function formatDeploymentStatus(v: unknown): string {
  const status = String(v);
  if (status === "FAILED" || status === "ROLLED_BACK") return color.red(status);
  if (status === "AWAITING_APPROVAL") return color.yellow(status);
  if (status === "HEALTHY") return color.green(status);
  return status;
}
