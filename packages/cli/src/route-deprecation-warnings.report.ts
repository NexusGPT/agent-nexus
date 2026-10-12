import type { DeprecationNotice } from "@agent-nexus/sdk";

import { printWarning } from "./output";
import { remaining, routeOf } from "./route-deprecation-warnings.render";

/**
 * WRITE A ROUTE-RETIREMENT WARNING TO STDERR, ONCE PER PROCESS.
 *
 * Split out of `./route-deprecation-warnings.ts`, which holds the orientation
 * argument for this whole concern — including why it is not the CLI's own
 * command-deprecation machinery — and the observer the SDK is handed. This file
 * holds the switch's name, the dedupe memory that makes the warning once per
 * schedule rather than once per response, and the write itself. The words come
 * from `./route-deprecation-warnings.render.ts`.
 *
 * 🔴 THE SWITCH'S NAME LIVES HERE AND NOT BESIDE THE ENABLEMENT QUESTION,
 * because the warning's own last line is built from it. Holding it in the
 * surface module would make this file import upward from the module that
 * imports it, and the three files run one way only: surface → report → render.
 */

/**
 * The switch, and it is NAMED IN THE WARNING ITSELF.
 *
 * A suppression switch nobody can find is not a suppression switch. Anyone who
 * reads the last line of the warning can turn it off without leaving the
 * terminal. Followed from `./contract-warnings.ts`, which took the same
 * position for the same reason.
 */
export const API_DEPRECATION_WARNINGS_ENV = "NEXUS_API_DEPRECATION_WARNINGS";

/**
 * The one value that silences it. Anything else — unset included — warns.
 *
 * Exported so the enablement question in `./route-deprecation-warnings.ts` asks
 * it against this literal rather than a second copy of the word, which would be
 * free to drift from the one the warning prints.
 */
export const OFF = "off";

/**
 * Signals already reported in this process.
 *
 * 🔴 KEYED BY THE ROUTE **AND** THE HEADER PAIR, NEVER BY A SINGLE FLAG. The
 * server announces retirement per route with its OWN schedule, and more than one
 * schedule is live at a time. A once-per-process boolean prints the first
 * schedule it meets and swallows every later one — so a command touching two
 * route groups would report one sunset date and silently drop the other, which
 * is this warning's own failure mode reproduced inside it.
 *
 * The pair is in the key and not just the route, so a route whose schedule MOVES
 * is announced again rather than collapsing into the stale one.
 *
 * debt: the key uses the request PATH, so a route carrying an id in its path
 *       (`/agents/<id>/versions`) is a distinct key per id — a caller looping
 *       over fifty agents gets fifty identical lines.
 *       Upgrade trigger: the SDK notice carrying the matched ROUTE PATTERN,
 *       which the v1 response-contract manifest already resolves for the
 *       contract reporter. Key on that instead and the lines collapse to one
 *       per (pattern, schedule).
 */
const alreadyReported = new Set<string>();

/** Clears the dedupe memory. For tests; the CLI is one command per process. */
export function resetApiDeprecationWarnings(): void {
  alreadyReported.clear();
}

/**
 * Write one route-retirement warning to stderr.
 *
 * ⚠️ STDERR, and never stdout, on every path including when nobody passed
 * `--json`. `--json` promises exactly one parseable document on stdout, so a
 * warning written there breaks every `| jq` in every script this CLI was put
 * into — and it breaks it on the announcement that existed to give that script
 * time to prepare, which would make the announcement the breaking change. Not
 * conditioned on `isJsonMode()` either: the unattended caller in a script is the
 * one who most needs to find out, and stderr is where this package already puts
 * the profile banner, progress and retry notices.
 *
 * `now` is injected so a gate can pin the "in N days" arithmetic. The CLI passes
 * nothing.
 *
 * Exported for the gate that asserts the stream, and called through
 * `createApiDeprecationReporter` in `./route-deprecation-warnings.ts`
 * everywhere else.
 */
export function reportApiDeprecationOnStderr(
  notice: DeprecationNotice,
  now: Date = new Date()
): void {
  const route = routeOf(notice);
  const key = `${route}\n${notice.deprecation ?? ""}\n${notice.sunset ?? ""}`;
  if (alreadyReported.has(key)) return;
  alreadyReported.add(key);

  const lines: string[] = [];

  if (notice.sunset !== undefined) {
    lines.push(
      notice.sunsetAt === undefined
        ? `Sunset: ${notice.sunset}`
        : `Sunset: ${notice.sunset} (${remaining(notice.sunsetAt, now)})`
    );
  } else {
    // A `Deprecation` with no `Sunset` is a legitimate half-announcement: the
    // route is going, the date is not chosen yet. Saying so beats implying a
    // deadline the server did not state.
    lines.push("No sunset date has been announced yet.");
  }

  if (notice.deprecation !== undefined) {
    lines.push(
      notice.deprecatedAt === undefined
        ? `Deprecation: ${notice.deprecation}`
        : `Deprecated since ${notice.deprecatedAt.toISOString()}`
    );
  }

  lines.push(
    "The server sent this — move off this route before the sunset date.",
    `Silence these warnings with ${API_DEPRECATION_WARNINGS_ENV}=${OFF}`
  );

  printWarning(`${route} is DEPRECATED and is scheduled for removal`, ...lines);
}
