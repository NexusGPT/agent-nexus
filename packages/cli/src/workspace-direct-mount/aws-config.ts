import { type AwsConfigRefusal, awsConfigRefusalFor } from "./aws-config-refusal";
import { awsProfileFor } from "./mount-id";

export interface AwsConfigInput {
  /** The node binary that runs the CLI — `process.execPath` at mount time. */
  readonly execPath: string;
  /** The CLI's entry file — `process.argv[1]` at mount time. */
  readonly entry: string;
  readonly mountId: string;
}

export type AwsConfigResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly refusal: AwsConfigRefusal };

/**
 * The AWS config file rclone's SDK reads through `AWS_CONFIG_FILE`.
 *
 * Both paths are double-quoted because the SDK runs the value through
 * `sh -c` and a home directory may contain a space. The value deliberately
 * ENDS with the unquoted `workspace credential-process <mountId>`: the ini
 * reader strips outer quotes only when the WHOLE value is one quoted token, so
 * a value that ended on a quoted path would reach the shell unquoted and break
 * on the first space.
 */
export function awsConfigFor(input: AwsConfigInput): AwsConfigResult {
  for (const field of ["execPath", "entry"] as const) {
    const because = awsConfigRefusalFor(input[field]);
    if (because !== null) return { ok: false, refusal: { field, because } };
  }
  const text =
    `[profile ${awsProfileFor(input.mountId)}]\n` +
    `credential_process = "${input.execPath}" "${input.entry}" workspace credential-process ${input.mountId}\n`;
  return { ok: true, text };
}
