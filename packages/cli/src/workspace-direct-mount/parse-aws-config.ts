import type { AwsConfigInput } from "./aws-config";
import { awsProfileFor } from "./mount-id";

const AWS_CONFIG_LINE_RE =
  /^credential_process = "([^"\r\n]+)" "([^"\r\n]+)" workspace credential-process ([0-9a-f]{16})$/m;

/**
 * Read the paths back out of an `aws.config` this module wrote, so a check can
 * ask whether the node binary and the CLI entry the line names still exist.
 * Null for anything that is not exactly the line `awsConfigFor` emits.
 */
export function parseAwsConfig(text: string): AwsConfigInput | null {
  const match = AWS_CONFIG_LINE_RE.exec(text);
  if (!match) return null;
  const [, execPath, entry, mountId] = match;
  if (!text.includes(`[profile ${awsProfileFor(mountId)}]`)) return null;
  return { execPath, entry, mountId };
}
