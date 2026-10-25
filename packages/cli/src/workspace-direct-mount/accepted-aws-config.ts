import { failure } from "../errors";
import { awsConfigFor } from "./aws-config";
import { AWS_CONFIG_REFUSAL_TEXT, type AwsConfigRefusal } from "./aws-config-refusal";
import type { Blocked } from "./direct-local-block";
import type { MountId } from "./mount-id";
import { type MountPlatform, mountPlatformOf } from "./mount-platform";
import { orTheGateway } from "./or-the-gateway";
import { sessionPathsFor } from "./session-paths";
import { stableNodePath } from "./stable-node-path";

declare const acceptedAwsConfig: unique symbol;

/**
 * The aws.config text `directAwsConfig` accepted, and the `renew.cmd` text
 * beside it (null off Windows). `mountDirect` writes both to the session
 * directory verbatim, and the brand is what keeps text that skipped
 * `awsConfigFor`'s refusals out of those writes.
 */
export type AcceptedAwsConfig = {
  readonly text: string;
  readonly renewCmd: string | null;
} & { readonly [acceptedAwsConfig]: true };

/** How a refusal names the path it read, and the way round it. */
const REFUSED_PATH = {
  execPath: {
    name: "execPath",
    fix: "Install node and the CLI under a path without that character"
  },
  entry: { name: "entry", fix: "Install node and the CLI under a path without that character" },
  renewCmd: {
    name: "wrapper path",
    fix: "The wrapper is written under your home folder, so use an account whose home folder path has no such character"
  }
} as const satisfies Record<AwsConfigRefusal["field"], { name: string; fix: string }>;

/**
 * The credential_process line for this mount, refused before any mint when the
 * node binary, the CLI entry or (on Windows) the wrapper path cannot be written
 * into it. All three are known before the first network call, so the refusal
 * costs no minted key.
 *
 * `execPath`, `entry` and `platform` are DEFAULTED rather than read inside, so
 * this file keeps the directory's standing property: every function here takes
 * what it needs as a parameter and can be pinned without a real process.
 */
export function directAwsConfig(
  mountId: MountId,
  execPath: string = stableNodePath(),
  entry: string = process.argv[1],
  platform: MountPlatform = mountPlatformOf(process.platform)
): { readonly ok: true; readonly awsConfig: AcceptedAwsConfig } | Blocked {
  const renewCmdFile = sessionPathsFor(mountId).renewCmdFile;
  const config = awsConfigFor({ execPath, entry, mountId }, renewCmdFile, platform);
  // The brand is minted here and nowhere else: `awsConfigFor` has just refused
  // every character its ini reader, shell or cmd.exe would misread.
  // `satisfies` checks the literal first: `as` alone would accept one missing a field.
  if (config.ok) {
    const accepted = { text: config.text, renewCmd: config.renewCmd } satisfies Pick<
      AcceptedAwsConfig,
      "text" | "renewCmd"
    >;
    return { ok: true, awsConfig: accepted as AcceptedAwsConfig };
  }
  const { field, because } = config.refusal;
  const offered = { execPath, entry, renewCmd: renewCmdFile } satisfies Record<
    AwsConfigRefusal["field"],
    string
  >;
  return {
    ok: false,
    block: "renewal-line",
    refusal: failure(
      "local-failed",
      `The credential_process line cannot be written: the ${REFUSED_PATH[field].name} ${offered[field]} contains ${AWS_CONFIG_REFUSAL_TEXT[because]}.`,
      `${REFUSED_PATH[field].fix}, then mount again.${orTheGateway(platform)}`
    )
  };
}
