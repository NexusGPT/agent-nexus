import type { McpCallInputs } from "./call-inputs";
import type { McpCallBody } from "./call-wire";

/**
 * Build the `tools/call` request body from the operator's flags.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🔴 AN ABSENT FLAG OMITS ITS KEY; `--expected-schema-hash` DOES NOT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `credentialId`, `accessCardId` and `cardVariableValues` are spread in only when
 * their flag was passed, because the route's defaults are not the same as the
 * explicit values — the oldest shared credential and the master card are what
 * absence MEANS, and sending a key with `undefined` is not how that is spelled.
 *
 * `expectedSchemaHash` is WRITTEN EVEN WHEN ABSENT, because the SDK's body makes
 * the key required with an OPTIONAL VALUE: declining to pin the contract has to be
 * an act. `undefined` and not `null` — the route spells the field optional, not
 * nullable, and the body is strict, so `null` is a 400.
 *
 * ## The presence test is the FLAG, never the parsed value
 *
 * `cardVariableValues` keys off `flags.cardVariables`, not off whether
 * `inputs.cardVariables` is empty. `resolveMcpCallInputs` returns `{}` both for an
 * absent flag and for `--card-variables '{}'`, and those two are different
 * requests: the second is an operator stating that the named card's variables are
 * deliberately empty.
 */
export function buildMcpCallBody(
  toolName: string,
  flags: {
    readonly credentialId?: string;
    readonly accessCardId?: string;
    readonly cardVariables?: string;
    readonly expectedSchemaHash?: string;
  },
  inputs: McpCallInputs
): McpCallBody {
  return {
    toolName,
    arguments: inputs.toolArguments,
    ...(flags.credentialId === undefined ? {} : { credentialId: flags.credentialId }),
    ...(flags.accessCardId === undefined ? {} : { accessCardId: flags.accessCardId }),
    ...(flags.cardVariables === undefined ? {} : { cardVariableValues: inputs.cardVariables }),
    expectedSchemaHash: flags.expectedSchemaHash
  };
}
