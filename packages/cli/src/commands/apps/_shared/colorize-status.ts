import { color } from "../../../output";

/**
 * Colorize a deployment or build-job status: terminal-good green,
 * terminal-bad red, in-flight yellow. Unknown values pass through plain.
 */
export function colorizeStatus(status: string): string {
  if (status === "HEALTHY" || status === "SUCCEEDED") return color.green(status);
  if (status === "FAILED" || status === "ROLLED_BACK" || status === "TIMED_OUT") {
    return color.red(status);
  }
  if (
    status === "BUILDING" ||
    status === "DEPLOYING" ||
    status === "RUNNING" ||
    status === "PENDING" ||
    status === "AWAITING_APPROVAL"
  ) {
    return color.yellow(status);
  }
  return status;
}
