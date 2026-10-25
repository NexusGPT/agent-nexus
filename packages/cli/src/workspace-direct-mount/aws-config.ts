import { type AwsConfigRefusal, awsConfigRefusalFor } from "./aws-config-refusal";
import { awsProfileFor } from "./mount-id";
import type { MountPlatform } from "./mount-platform";
import { renewCmdFor } from "./win32/renew-cmd";

export interface AwsConfigInput {
  /** The node binary that runs the CLI — `process.execPath` at mount time. */
  readonly execPath: string;
  /** The CLI's entry file — `process.argv[1]` at mount time. */
  readonly entry: string;
  readonly mountId: string;
}

type Refused = { readonly ok: false; readonly refusal: AwsConfigRefusal };
/** macOS and Linux: the command is the line itself, so there is no wrapper. */
type CommandLineConfig = { readonly ok: true; readonly text: string; readonly renewCmd: null };
/** Windows: the line names `renew.cmd`, whose text is `renewCmd`. */
type WrapperConfig = { readonly ok: true; readonly text: string; readonly renewCmd: string };

/** What each platform's writer returns: a wrapper exactly where the platform needs one. */
type ConfigOn<P extends MountPlatform> =
  | (P extends "win32" ? WrapperConfig : CommandLineConfig)
  | Refused;

export type AwsConfigResult = ConfigOn<MountPlatform>;

/**
 * macOS and Linux: both paths are double-quoted because the SDK runs the value
 * through `sh -c` and a home directory may contain a space. The value
 * deliberately ENDS with the unquoted `workspace credential-process <mountId>`:
 * the ini reader strips outer quotes only when the WHOLE value is one quoted
 * token, so a value that ended on a quoted path would reach the shell unquoted
 * and break on the first space. No wrapper file.
 */
function shConfigFor(input: AwsConfigInput, platform: MountPlatform): ConfigOn<"darwin"> {
  for (const field of ["execPath", "entry"] as const) {
    const because = awsConfigRefusalFor(input[field], field, platform);
    if (because !== null) return { ok: false, refusal: { field, because } };
  }
  const text =
    `[profile ${awsProfileFor(input.mountId)}]\n` +
    `credential_process = "${input.execPath}" "${input.entry}" workspace credential-process ${input.mountId}\n`;
  return { ok: true, text, renewCmd: null };
}

/**
 * Windows: the SDK runs the value through `cmd.exe /C`. Go quotes that one
 * argument when it holds a space, and cmd.exe keeps those quotes only when the
 * whole line is one quoted path to an existing program — so the value is the
 * BARE path of `renew.cmd`, never quoted here, and the command itself is the
 * wrapper's text (see {@link renewCmdFor}).
 */
function cmdConfigFor(
  input: AwsConfigInput,
  platform: MountPlatform,
  renewCmdFile: string
): ConfigOn<"win32"> {
  const checked = [
    ["execPath", input.execPath],
    ["entry", input.entry],
    ["renewCmd", renewCmdFile]
  ] as const;
  for (const [field, value] of checked) {
    const because = awsConfigRefusalFor(value, field, platform);
    if (because !== null) return { ok: false, refusal: { field, because } };
  }
  const text =
    `[profile ${awsProfileFor(input.mountId)}]\n` + `credential_process = ${renewCmdFile}\n`;
  return { ok: true, text, renewCmd: renewCmdFor(input) };
}

/** Each row must return its own platform's shape: a swapped row does not compile. */
const CONFIG_FOR = {
  darwin: shConfigFor,
  linux: shConfigFor,
  win32: cmdConfigFor
} as const satisfies {
  readonly [P in MountPlatform]: (
    input: AwsConfigInput,
    platform: MountPlatform,
    renewCmdFile: string
  ) => ConfigOn<P>;
};

/**
 * The AWS config file rclone's SDK reads through `AWS_CONFIG_FILE`, plus the
 * `renew.cmd` text to write at `renewCmdFile` — null where the platform runs
 * the command from the line itself.
 *
 *   macOS/Linux  credential_process = "<node>" "<entry>" workspace credential-process <mountId>
 *   Windows      credential_process = <renewCmdFile>
 */
export function awsConfigFor(
  input: AwsConfigInput,
  renewCmdFile: string,
  platform: MountPlatform
): AwsConfigResult {
  return CONFIG_FOR[platform](input, platform, renewCmdFile);
}
