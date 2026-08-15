import type { Command } from "commander";

import {
  formatUpdateMessage,
  isDerivedCapture,
  readCachedNewerVersion
} from "./util/version-check";

/**
 * THE SCOPE FOOTER — one block, on the bottom of EVERY `--help` screen.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS CLOSES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A reader looks for a verb, does not find one, and records that the PLATFORM
 * cannot do the thing. The CLI's help is a client's verb table and was being
 * read as the platform's route table, and nothing on the screen said otherwise.
 *
 * Two facts make that reading wrong, and neither was reachable from a help
 * screen:
 *
 *  1. THE VERB TABLE IS VERSIONED. A verb that landed this morning is absent
 *     from the build in your hand, and its help said so accurately — `nexus
 *     role tasks` in 0.22.1 printed `READ-ONLY TODAY. There is no "set-tasks"`
 *     while 0.23.0 had shipped four hours earlier. Every sentence there was
 *     true. The sentence that was missing is which version was talking.
 *  2. THE VERB TABLE IS SMALLER THAN THE ROUTE TABLE, at every version. Routes
 *     are served that this CLI has no verb for and never had one for; the
 *     dashboard calls them.
 *  3. AND THE FALLBACK THIS BLOCK OFFERS CANNOT SEE THAT FAMILY. `nexus api`
 *     sends every request to `{baseUrl}/api/public/v1{path}` — the prefix is
 *     prepended in `HttpClient` and no flag removes it — so the routes fact 2
 *     names are precisely the ones the probe cannot address. Sending a reader to
 *     a check that answers nothing, and calling that check the way to disprove
 *     an absence, produced the audit this footer exists to prevent: verb absent,
 *     probe silent, capability recorded as missing, and the product had it all
 *     along on a screen.
 *
 * ── WHY THE STALENESS LINE CANNOT COME FROM `checkForUpdate` ─────────────────
 *
 * `--help` never reaches it. `checkForUpdate` runs in `parseAsync().then()`,
 * and commander's help action calls `process.exit()` before that promise
 * settles — so the ONE surface a reader consults to decide whether a verb
 * exists is the one surface that never says the verb table is stale. Measured
 * with a positive control: `role tasks --help`, `role --help` and `--help` each
 * printed the notice 0 times, while a real command printed it once, and printed
 * it even when the command itself failed.
 *
 * So this reads the cache SYNCHRONOUSLY and fetches nothing. The number is
 * already on disk, written by the last real command; the help screen was simply
 * never shown it. Help stays instant, and there is no network call on a code
 * path that must not have one.
 *
 * ── WHY `afterAll` ON THE ROOT AND NOT A NOTE PER COMMAND ────────────────────
 *
 * Commander fires `afterAll` on the command being helped AND every ancestor, so
 * ONE registration on the root program lands this on every command at every
 * depth. There is nothing to enumerate and nothing to keep in step: a namespace
 * added tomorrow carries it without being listed anywhere.
 *
 * The alternative was a `Notes:` line per read command naming its writer. That
 * is a hand-maintained population — one such line existed, on `role tasks`, and
 * a derivation over the real command tree found 10 more read verbs whose
 * writers their help never names. A fix that has to be remembered per command
 * is the defect wearing a fix's clothes.
 *
 * ── POSITION IS LOAD-BEARING ─────────────────────────────────────────────────
 *
 * `afterAll` puts this BELOW the command's own `Notes:` block, which is where
 * an absence claim lives. A caveat above the claim it qualifies is read first
 * and overridden by what follows it.
 */
export function helpScopeFooter(currentVersion: string): string {
  const newer = readCachedNewerVersion(currentVersion);

  // 🚨 THE VERSION IS NAMED ON A LIVE `--help` AND OMITTED FROM A DERIVED
  // CAPTURE, and that is not a cosmetic split. A committed docs page is
  // compared byte-for-byte against a fresh projection, and the version comes
  // from `packages/cli/package.json` — a file the changesets release writes on
  // `main` and never on `staging`. Naming it there made every generated page
  // stale on every staging→main promotion merge, with no CLI file touched.
  // `asDerivedCapture`'s docblock carries the measurement.
  const client = isDerivedCapture() ? "@agent-nexus/cli" : `@agent-nexus/cli ${currentVersion}`;

  return (
    `\nTHIS IS ONE CLIENT (${client}), NOT THE PLATFORM\n` +
    `  A verb missing here is missing from THIS CLI at THIS VERSION. That is not\n` +
    `  proof the platform cannot do it. Routes are served that this CLI has no\n` +
    `  verb for at any version, and the dashboard calls them.\n` +
    `  Before you record a capability as absent: upgrade, then ask the route\n` +
    `  itself. "nexus api <METHOD> <path>" calls any public API v1 route,\n` +
    `  whether or not a verb for it exists here.\n` +
    `  That probe reaches public/v1 and NOTHING ELSE. The routes above are\n` +
    `  outside it and it cannot address them, so a probe finding nothing is\n` +
    `  still not a capability that is absent. "nexus api --help" says why.\n` +
    (newer === null ? "" : formatUpdateMessage(currentVersion, newer))
  );
}

/**
 * The first line of the footer, without the version.
 *
 * Exported so the gate asserts against ONE string rather than a second copy of
 * the sentence typed into a test — a copy would let the footer be reworded into
 * uselessness with the gate still green.
 */
export const HELP_SCOPE_HEADING = "THIS IS ONE CLIENT (@agent-nexus/cli";

/**
 * Put the footer on every help screen this program can print.
 *
 * Registered on the ROOT program only. See the header for why that reaches
 * every subcommand.
 */
export function registerHelpScopeFooter(program: Command, version: string): void {
  // A callback, not a string: the staleness line is read from the cache at the
  // moment help is printed, so a `nexus <cmd>` that refreshed the cache is
  // reflected by the very next `--help` in the same shell.
  program.addHelpText("afterAll", () => helpScopeFooter(version));
}
