import { color, isJsonMode, printRecord } from "../../../output";
import { type GetDeploymentResponse, VIBE_DEFAULT_CONTAINER_PORT } from "../../../vibe-wire-types";
import { colorizeStatus } from "./colorize-status";
import { formatReplacedBy } from "./format-replaced-by";
import { formatTimestamp } from "./format-timestamp";

export function printDeploymentDetail(data: GetDeploymentResponse): void {
  if (isJsonMode()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const d = data.deployment;
  printRecord(d, [
    { key: "id", label: "Deployment" },
    { key: "versionNumber", label: "Version", format: (v) => `v${String(v)}` },
    { key: "status", label: "Status", format: (v) => colorizeStatus(String(v)) },
    { key: "triggerSha", label: "Commit", format: (v) => String(v).slice(0, 7) },
    { key: "imageRef", label: "Image", format: (v) => (v === "" ? "—" : String(v)) },
    // "not detected" rather than "—": a dash reads as "nothing to show", and
    // the reader is usually here BECAUSE the port is wrong. Saying the build
    // observed nothing — and naming the default that therefore applies — is
    // the answer to the question that brought them, in one line.
    {
      key: "detectedPort",
      label: "Detected port",
      format: (v) =>
        v === null || v === undefined
          ? color.dim(`not detected — using ${String(VIBE_DEFAULT_CONTAINER_PORT)}`)
          : String(v)
    },
    // Only on a DISPLACED row, where it is the answer to "why did this never
    // go live". On every other status it would be a permanent "—" that says
    // nothing.
    ...(d.status === "DISPLACED"
      ? [
          {
            key: "displacedBy" as const,
            label: "Replaced by",
            format: () => formatReplacedBy(d.displacedBy)
          }
        ]
      : []),
    { key: "errorReason", label: "Error", format: (v) => (v === null ? "—" : String(v)) },
    { key: "createdAt", label: "Created", format: (v) => formatTimestamp(String(v)) }
  ]);

  if (d.forceRebuild) {
    console.log(color.dim("\nBuilt with --force-rebuild — hence the -v suffix on the image tag."));
  }

  if (data.buildJob === null) {
    console.log(color.dim("\nNo build job."));
    return;
  }

  const b = data.buildJob;
  console.log(color.bold("\nBuild job"));
  printRecord(b, [
    { key: "id", label: "Id" },
    { key: "status", label: "Status", format: (v) => colorizeStatus(String(v)) },
    { key: "builder", label: "Builder", format: (v) => (v === null ? "—" : String(v)) },
    { key: "durationMs", label: "Duration", format: (v) => (v === null ? "—" : `${String(v)}ms`) },
    { key: "logsRef", label: "Logs", format: (v) => (v === "" ? "—" : String(v)) },
    { key: "errorReason", label: "Error", format: (v) => (v === null ? "—" : String(v)) }
  ]);
}
