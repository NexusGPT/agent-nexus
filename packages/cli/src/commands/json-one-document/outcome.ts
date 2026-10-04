/**
 * What one driven run produced, and what the whole scan reports.
 *
 * The outcome is NOT a boolean: `clean` is reserved for a run that actually
 * produced a payload document, so an instrument that read nothing cannot wear a
 * clean result.
 */

/** How one driven run ended. Five states, and only one of them is protection. */
export type Outcome =
  /** stdout held exactly one JSON document that is not an error envelope. */
  | "clean"
  /** stdout did not parse as a single JSON document. THE DEFECT. */
  | "violation"
  /** stdout held one document and it was `{error:…}` — the command failed early. */
  | "error-path"
  /** stdout was empty. The command printed nothing, or printed only to stderr. */
  | "silent"
  /** the run did not finish inside the budget, or the harness could not start it. */
  | "undrivable";

/**
 * THE SECOND CLAUSE, AND IT IS A SEPARATE AXIS FROM {@link Outcome}.
 *
 * The root epilogue makes TWO promises about `--json`, not one:
 *
 *   READING THE OUTPUT — "--json prints ONE JSON document on STDOUT"
 *   FAILURE            — "EVERY failure exits 1. Under --json an error is a JSON
 *                         document on STDOUT: {"error":{"message","hint","code"}}"
 *
 * A command can satisfy the first and break the second: refusing a bad argument
 * with `console.error("Error: --body is required.")` and `process.exitCode = 1`
 * leaves stdout EMPTY, which is one document by no reasonable reading and
 * unparseable by every consumer. `Outcome` calls that `silent`, because stdout
 * is where it looks. This axis is what separates a command that printed nothing
 * because it SUCCEEDED quietly from one that printed nothing because it REFUSED.
 */
export type ErrorOutcome =
  /** The run did not fail. Says nothing about the error path. */
  | "not-an-error"
  /** Failed, and stdout held exactly one `{error:…}` document. THE CONTRACT. */
  | "error-document"
  /** Failed with prose on stderr and NOTHING on stdout. THE DEFECT. */
  | "error-prose"
  /** Failed with nothing on either stream. Worse — no message at all. */
  | "error-mute"
  /** Failed, and stdout held a non-error document. Reads as a success. */
  | "error-masked"
  /**
   * Failed with a proper document carrying the WRONG `code`. THE SECOND DEFECT.
   *
   * A document exists so a machine can branch on it, and a `code` that says
   * `CLI_INVALID_ARGUMENTS` for a connectivity failure is worse than the prose
   * it replaced: prose does not lie in a field a script trusts. A caller
   * branching on it stops retrying a retryable outage and tells a user to check
   * their flags.
   */
  | "error-miscoded";

export interface LeafRun {
  /** The population key: the leaf path, plus ` --dry-run` for the second variant. */
  readonly key: string;
  readonly leaf: string;
  readonly argv: readonly string[];
  readonly outcome: Outcome;
  /** For a violation: what stdout actually was. One line, safe to print. */
  readonly detail: string;
  readonly errorOutcome: ErrorOutcome;
  /** For an error-path defect: the first line the caller was given, on stderr. */
  readonly errorDetail: string;
  /** The `code` on the error document, when there was one. */
  readonly errorCode: string | undefined;
  /**
   * How many requests the harness's stubbed seams were asked to make.
   *
   * The only mechanical signal for "did anything leave this process before it
   * failed". Zero means every failure on this run was decided locally.
   */
  readonly requestsAttempted: number;
  /**
   * Did commander itself refuse the invocation?
   *
   * Separated because the REMEDY differs. A commander refusal is one class with
   * one fix at one place — the parse boundary. A hand-rolled `console.error`
   * inside an action is N fixes at N call sites.
   */
  readonly refusedByCommander: boolean;
}

export interface ScanReport {
  readonly leafCount: number;
  readonly runs: readonly LeafRun[];
  readonly violations: readonly LeafRun[];
  readonly counts: Readonly<Record<Outcome, number>>;
  /** Runs whose argv carried at least one synthesized value. Sanity on the synthesizer. */
  readonly runsWithSynthesizedArgs: number;
  /** Every run that FAILED, by how it told the caller. The second clause. */
  readonly errorCounts: Readonly<Record<ErrorOutcome, number>>;
  /** Failures that broke the error clause: prose, silence, or a masked failure. */
  readonly errorViolations: readonly LeafRun[];
  /** Failures that produced a document whose `code` contradicts what happened. */
  readonly miscoded: readonly LeafRun[];
  /** How many of those were commander's own refusal — one class, one fix. */
  readonly commanderRefusals: number;
}
