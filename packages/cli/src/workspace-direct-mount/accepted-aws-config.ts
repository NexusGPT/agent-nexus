import { failure } from "../errors";
import { awsConfigFor } from "./aws-config";
import { AWS_CONFIG_REFUSAL_TEXT } from "./aws-config-refusal";
import { OR_DROP_DIRECT } from "./or-drop-direct";
import { stableNodePath } from "./stable-node-path";

declare const acceptedAwsConfig: unique symbol;

/**
 * The aws.config text `directAwsConfigOrRefuse` accepted. `mountDirect` writes
 * this to the session directory verbatim, and the brand is what keeps a string
 * that skipped `awsConfigFor`'s refusals out of that write.
 */
export type AcceptedAwsConfig = string & { readonly [acceptedAwsConfig]: true };

/**
 * The credential_process line for this mount, refused before any mint when the
 * node binary or the CLI entry cannot be written into it. Both inputs are known
 * before the first network call, so the refusal costs no minted key.
 *
 * `execPath` and `entry` are DEFAULTED rather than read inside, the same shape
 * `stableNodePath` uses, so this file keeps the directory's standing property:
 * every function here takes what it needs as a parameter and can be pinned
 * without a real process.
 */
export function directAwsConfigOrRefuse(
  mountId: string,
  execPath: string = stableNodePath(),
  entry: string = process.argv[1]
): AcceptedAwsConfig {
  const config = awsConfigFor({ execPath, entry, mountId });
  // The brand is minted here and nowhere else: `awsConfigFor` has just refused
  // every character its ini reader or shell would misread.
  if (config.ok) return config.text as AcceptedAwsConfig;
  const { field, because } = config.refusal;
  const offending = field === "execPath" ? execPath : entry;
  throw failure(
    "local-failed",
    `The credential_process line cannot be written: the ${field} ${offending} contains ${AWS_CONFIG_REFUSAL_TEXT[because]}.`,
    `Install node and the CLI under a path without that character, then mount again.${OR_DROP_DIRECT}`
  );
}
