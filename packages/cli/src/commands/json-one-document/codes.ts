import { CLI_MINTED_CODES } from "../../errors";

/**
 * Codes that can ONLY be true if something left this process.
 *
 * Deliberately not the whole non-argument set: `CLI_NOT_FOUND`,
 * `CLI_NOT_AUTHENTICATED` and `CLI_LOCAL_FAILED` are all legitimately decided
 * from local state with no request at all.
 */
export const REMOTE_ONLY_CODES = new Set([
  "CLI_CONNECTION_FAILED",
  "CLI_TIMEOUT",
  "CLI_REMOTE_ERROR",
  "CLI_SDK_ERROR"
]);

/**
 * Every code the CLI is allowed to put on the wire. A stray one is a typo.
 *
 * 🚨 DERIVED FROM `CLI_CODES`, NEVER RETYPED. This was a hand-written list and
 * it was already wrong: `CLI_UPGRADE_NOT_RESOLVED` and
 * `CLI_UPGRADE_NOT_VERIFIED_FOR_YOU` were absent from the day they were minted,
 * and it stayed green because neither reaches this driven scan. A hand list only
 * fails for the next person to add a code that IS drivable, whose correct
 * document is then reported as a typo — which is a gate red nobody can act on
 * without editing the gate.
 *
 * `CLI_ADMIN_ERROR` is the one addition, and it is deliberate: the admin tree
 * mints it in `util/admin-errors.ts`, outside `CLI_CODES`.
 */
export const KNOWN_CODES = new Set([...CLI_MINTED_CODES, "CLI_ADMIN_ERROR"]);

/**
 * The message the harness's network stub throws, verbatim.
 *
 * ⚠️ A SOUND SIGNAL, AND THE ONLY ONE HERE. When this string reaches the error
 * document, the failure is a network failure BY CONSTRUCTION — the harness made
 * it one — so the code must say so. No inference, no false positive.
 */
export const NETWORK_STUB_MESSAGE = "the network is blocked in the one-document gate";
