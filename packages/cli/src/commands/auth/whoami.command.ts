import type { Command } from "commander";

import { AUTH_PROBE_DEFAULT_TIMEOUT_MS, probeCredential, refusalForProbe } from "../../auth-probe";
import { timeoutSecondsToMs } from "../../client";
import { resolveBaseUrl, resolveProfile } from "../../config";
import { reportFailure } from "../../errors";
import { printWhoami } from "./whoami.render";
import { syncIdentityToProfile } from "./whoami.sync-profile";

const WHOAMI_HELP = `
Examples:
  $ nexus auth whoami

Notes:
  Calls the API live to resolve the current org name, org ID, and user email
  for the active profile's key, so you always know which org you're acting on.

  A PROFILE NAME THAT DOES NOT EXIST REPORTS AS "Not logged in". So
  "--profile <typo>" sends you to run "nexus auth login" when you are already
  logged in and only misspelled the name. Before re-authenticating, run
  "nexus auth status --profile <name>" — it distinguishes the two and lists the
  profiles that do exist.`;

/** `nexus auth whoami` */
export function registerAuthWhoamiCommand(auth: Command, program: Command): Command {
  const leaf = auth
    .command("whoami")
    .description("Show the active profile, organization, and authenticated user")
    .addHelpText("after", WHOAMI_HELP)
    .action(async () => {
      const globals = program.optsWithGlobals();
      let resolved;
      try {
        resolved = resolveProfile(globals);
      } catch {
        process.exitCode = reportFailure(
          "not-authenticated",
          "Not logged in.",
          "Run: nexus auth login"
        );
        return;
      }

      // Through the canon, with both globals — see `status.handler.ts`. The
      // bare `resolved.profile.baseUrl ?? resolveBaseUrl()` this replaced
      // dropped `--base-url`, so a live verification could be reported against
      // a host the caller never asked for.
      const baseUrl = resolveBaseUrl(globals.baseUrl, globals.profile);
      const keyHint =
        resolved.profile.apiKey.slice(0, 8) + "..." + resolved.profile.apiKey.slice(-4);

      // whoami is a LIVE verification command: any failure to confirm the key
      // (network error, timeout, or a non-ok server response) must be reported
      // as such — never a false "Authenticated.".
      //
      // 🚨 THE PROBE IS SHARED WITH `auth status` AND IS NOT REIMPLEMENTED HERE.
      // Both verbs answer "is this key good", and this file used to hold the only
      // correct copy while `status` had none. Two copies of that answer is two
      // things to drift, silently, in the direction that reads as fine — so the
      // mapping lives in `auth-probe.ts` and neither verb owns it.
      //
      // Behaviour preserved exactly, with ONE narrowing that the old bare `catch`
      // could not express: a TIMEOUT now reports as `timed-out` rather than as
      // `connection-failed`. They are different facts — a timeout may still be
      // running server-side, an unreachable host is not — and collapsing them is
      // the same defect one layer down.
      const outcome = await probeCredential(baseUrl, resolved.profile.apiKey, {
        // Same form as `status` above, and for the same reason — see the comment
        // there. Both verbs are one probe with one deadline the caller sets.
        signal: AbortSignal.timeout(
          timeoutSecondsToMs(globals.timeout) ?? AUTH_PROBE_DEFAULT_TIMEOUT_MS
        )
      });
      // `null`: `whoami` declares no `--no-verify` and has no way to skip the
      // check — verifying live IS the command. Naming a flag it does not have
      // would point the reader at an invocation commander rejects.
      const whoamiRefusal = refusalForProbe(outcome, resolved.name, baseUrl, null);
      if (whoamiRefusal) {
        process.exitCode = reportFailure(
          whoamiRefusal.cause,
          whoamiRefusal.message,
          whoamiRefusal.hint
        );
        return;
      }

      // `identity` is null on the legacy path: a backend with no `/me`, where the
      // key is still PROVEN good by the fallback probe and there is simply no live
      // identity to report. The stored profile answers for it below.
      const identity = outcome.outcome === "verified" ? (outcome.identity ?? undefined) : undefined;

      syncIdentityToProfile(resolved, identity);

      printWhoami({ resolved, identity, baseUrl, keyHint });
    });
  return leaf;
}
