/**
 * The build-job row view, shared by all four transition verbs.
 *
 * It prints `status` through `colorizeStatus`, the exhaustive `Record` over both
 * the deployment and build-job vocabularies. `admin-vibe-deployment` does NOT —
 * it carries its own if-chain, and the two disagree on four of the eight
 * deployment statuses. That divergence is recorded at the other site, where the
 * if-chain is, rather than here.
 */

import { type AdminVibeBuildJobResponse } from "../../../admin-wire-types";
import { printRecord } from "../../../output";
import { colorizeStatus } from "../../apps/_shared/colorize-status";

export function printBuildJobRecord(data: AdminVibeBuildJobResponse): void {
  printRecord(data, [
    { key: "id", label: "Build job" },
    { key: "vibeDeploymentId", label: "Deployment" },
    { key: "organizationId", label: "Organization" },
    { key: "status", label: "Status", format: (v) => colorizeStatus(String(v)) },
    { key: "builder", label: "Builder" },
    { key: "logsRef", label: "Logs ref", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "durationMs", label: "Duration (ms)", format: (v) => (v == null ? "—" : String(v)) },
    { key: "errorReason", label: "Error reason", format: (v) => (v == null ? "—" : String(v)) },
    { key: "createdAt", label: "Created" },
    { key: "updatedAt", label: "Updated" }
  ]);
}
