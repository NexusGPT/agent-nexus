import type { ContractReport } from "@agent-nexus/sdk";

import { printWarning } from "./output";

/**
 * Tell the user when the server answered with a shape the API does not publish.
 *
 * ## Why this is the CLI's problem and not only the server's
 *
 * `printRecord`, `printTable` and `printList` emit the SDK's payload verbatim
 * under `--json`, so the CLI's documented output contract is, at run time,
 * whatever the server sent. Three instruments in the Nexus repository already
 * compare parts of that chain, and every one of them reads a SINGLE COMMIT —
 * the backend's response interceptor, the SDK's compile-time contract gate, and
 * a handler-shape scan.
 *
 * The case none of them can reach is the ordinary state of an installed CLI: a
 * published binary talking to a server that moved on without it. The backend's
 * interceptor does notice a drift, and reports it to SENTRY — to us, never to
 * the person whose `--json` output just changed shape. This is the half that
 * reaches them.
 *
 * ## Why it is on by default
 *
 * A warning users learn to ignore is worse than silence, so the default was
 * decided by MEASUREMENT rather than by preference. Swept against staging over
 * every reachable Public API v1 GET route: 132 reads scored across 90 routes,
 * ZERO false positives, and the single mismatch it did report was a real
 * contract violation (`GET /documents/:id` publishes `size` as `number | null`
 * and sends a decimal string, because the column is a Prisma `BigInt?`).
 *
 * ## What it deliberately does not say
 *
 * Only a MISMATCH. The SDK also reports `unchecked` — a route publishing no
 * response schema, a 204, an empty body, a stream — and those are facts about
 * the CONTRACT, not about this run. Printing them would put a line on almost
 * every command and teach the reader to stop looking.
 */

/**
 * The switch, and it is NAMED IN THE WARNING ITSELF.
 *
 * A suppression switch nobody can find is not a suppression switch. Anyone who
 * reads the last line of the warning knows how to turn it off without leaving
 * the terminal, and it is guessable from the text alone.
 */
export const CONTRACT_WARNINGS_ENV = "NEXUS_CONTRACT_WARNINGS";

/** The one value that silences it. Anything else — unset included — warns. */
const OFF = "off";

/**
 * Routes already reported in this process.
 *
 * A list command checks every element it decodes, and a drifted field is
 * drifted in all of them — without this, one `nexus document list` prints the
 * same sentence fifty times and the user learns the warning is noise. Keyed by
 * the route AND its issues, so a SECOND, different drift on the same route is
 * still reported.
 */
const alreadyReported = new Set<string>();

/** Clears the dedupe memory. For tests; the CLI is one command per process. */
export function resetContractWarnings(): void {
  alreadyReported.clear();
}

/** Whether the user has switched the warnings off. */
export function contractWarningsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[CONTRACT_WARNINGS_ENV] ?? "").trim().toLowerCase() !== OFF;
}

/**
 * The reporter handed to the SDK, or `undefined` when the user switched it off.
 *
 * Returning `undefined` rather than a no-op function is deliberate: the SDK
 * consults its route manifest ONLY when a reporter is installed, so switching
 * the warnings off also switches off the work behind them.
 */
export function createContractReporter(
  env: NodeJS.ProcessEnv = process.env
): ((report: ContractReport) => void) | undefined {
  if (!contractWarningsEnabled(env)) return undefined;

  return (report) => {
    // `unchecked` is a statement about the contract, not about this run.
    if (report.state !== "mismatch") return;

    const issues = report.issues ?? [];
    const key = `${report.route} ${issues.map((i) => `${i.at}:${i.message}`).join("|")}`;
    if (alreadyReported.has(key)) return;
    alreadyReported.add(key);

    const hidden = (report.issueCount ?? issues.length) - issues.length;

    printWarning(
      `the server answered ${report.method} ${report.path} with a shape the API does not publish`,
      ...issues.map((issue) => `${issue.at || "<payload>"}: ${issue.message}`),
      ...(hidden > 0 ? [`...and ${hidden} more`] : []),
      `This is a bug in the API, not in your command — the data above is printed unchanged.`,
      `Silence these warnings with ${CONTRACT_WARNINGS_ENV}=${OFF}`
    );
  };
}
