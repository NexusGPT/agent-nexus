import type { AwsConfigInput } from "./aws-config";
import { awsProfileFor } from "./mount-id";

const AWS_CONFIG_LINE_RE =
  /^credential_process = "([^"\r\n]+)" "([^"\r\n]+)" workspace credential-process ([0-9a-f]{16})$/m;

const WRAPPER_LINE_RE = /^credential_process = ([^"\r\n]+\.cmd)$/m;

/** A `[profile …]` header whose name ends in 16 hex digits; the caller checks it is `awsProfileFor` of them. */
const PROFILE_HEADER_RE = /^\[profile ([^\]\r\n]*?([0-9a-f]{16}))\]$/m;

export type ParsedAwsConfig =
  | { readonly kind: "command"; readonly input: AwsConfigInput }
  | { readonly kind: "wrapper"; readonly renewCmdFile: string }
  | null;

/**
 * Read an `aws.config` this module wrote back into what its line names, so a
 * check can ask whether those files still exist. `command` is the macOS/Linux
 * line: the node binary, the CLI entry and the mount id. `wrapper` is the
 * Windows line: the bare path of `renew.cmd`, which carries no mount id, so the
 * caller compares that path and the profile header against its own mount's.
 * Null for anything that is not exactly a line `awsConfigFor` emits under a
 * profile header it emits.
 */
export function parseAwsConfig(text: string): ParsedAwsConfig {
  const match = AWS_CONFIG_LINE_RE.exec(text);
  if (match) {
    const [, execPath, entry, mountId] = match;
    if (!text.includes(`[profile ${awsProfileFor(mountId)}]`)) return null;
    return { kind: "command", input: { execPath, entry, mountId } };
  }
  const wrapper = WRAPPER_LINE_RE.exec(text);
  if (!wrapper) return null;
  const header = PROFILE_HEADER_RE.exec(text);
  if (!header || header[1] !== awsProfileFor(header[2])) return null;
  return { kind: "wrapper", renewCmdFile: wrapper[1] };
}
