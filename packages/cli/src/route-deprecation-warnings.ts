import type { DeprecationNotice } from "@agent-nexus/sdk";

import {
  API_DEPRECATION_WARNINGS_ENV,
  OFF,
  reportApiDeprecationOnStderr
} from "./route-deprecation-warnings.report";

/**
 * TELL THE USER THAT AN API ROUTE THEY JUST CALLED IS BEING REMOVED.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THIS IS NOT `./deprecation-notice.ts`, AND THE TWO MUST NOT BE CONFLATED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `./deprecations.ts` + `./deprecation-notice.ts` announce that a CLI COMMAND is
 * going away. That is this package's own stability contract, declared in a table
 * here, rendered into `--help`, and deliberately UNSILENCEABLE — the
 * announcement IS the contract.
 *
 * This file is the other direction entirely: the SERVER telling a client that an
 * HTTP ROUTE is going away, read off `Deprecation` / `Sunset` on the response of
 * a request this binary just made. Nothing in this package declares it, nothing
 * here can predict it, and a published CLI meets it against a server that moved
 * on without it.
 *
 * Same word, two mechanisms, two audiences. Hence the separate module, the
 * separate switch, and the `API` in that switch's name.
 *
 * ── WHY THIS IS THE CLI'S PROBLEM ───────────────────────────────────────────
 *
 * The server already logs a warning of its own and marks the route `deprecated`
 * in the rendered OpenAPI. Both reach US. Neither reaches the person whose
 * script calls the route from a shell every morning — and the headers exist
 * precisely to give that person lead time. This is the half that reaches them.
 * It is the same gap, and the same argument, as `./contract-warnings.ts`.
 *
 * ── WHY ITS OWN SWITCH, AND NOT `NEXUS_CONTRACT_WARNINGS` ───────────────────
 *
 * Different concerns with different stakes. Contract warnings are about payload
 * SHAPE drift — a bug in the API, printed beside data that is still usable — and
 * someone silencing that noise has not asked to stop hearing that a route is
 * being deleted out from under them. One switch would make the quieter signal
 * silence the louder one.
 *
 * 🔴 AND THE NAME IS `NEXUS_API_DEPRECATION_WARNINGS`, NOT
 * `NEXUS_DEPRECATION_WARNINGS`, FOR THE COLLISION ABOVE. The shorter name reads
 * as "silence deprecation warnings", which a reader would reasonably expect to
 * cover the COMMAND deprecations too — and those have no switch at all, by
 * design. A switch that silences one of two things a user cannot tell apart is a
 * switch that lies about what it did.
 *
 * ── WHERE THE REST OF IT LIVES ──────────────────────────────────────────────
 *
 * This file is the surface the call sites reach for: the enablement question and
 * the observer handed to the SDK. Two files sit under it, and the imports run
 * one way only — this file, then report, then render, and never back up.
 *
 * - `./route-deprecation-warnings.report.ts` — the switch's name, the
 *   once-per-process dedupe memory, and the stderr write.
 * - `./route-deprecation-warnings.render.ts` — a notice turned into the words a
 *   reader acts on, including the sign-of-zero rule for "how long is left".
 */

/** Whether the user has switched the warnings off. */
export function apiDeprecationWarningsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[API_DEPRECATION_WARNINGS_ENV] ?? "").trim().toLowerCase() !== OFF;
}

/**
 * The observer handed to the SDK, or `undefined` when the user switched it off.
 *
 * Returning `undefined` rather than a no-op is deliberate and mirrors
 * `createContractReporter`: the transport reads the headers only when an
 * observer is installed, so switching the warnings off also switches off the
 * work behind them.
 */
export function createApiDeprecationReporter(
  env: NodeJS.ProcessEnv = process.env
): ((notice: DeprecationNotice) => void) | undefined {
  if (!apiDeprecationWarningsEnabled(env)) return undefined;
  return (notice) => {
    reportApiDeprecationOnStderr(notice);
  };
}
