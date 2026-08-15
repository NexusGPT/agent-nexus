/**
 * THE `--json` LEDGER — every command that breaks either clause of the output
 * contract today.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * TWO CLAUSES, TWO LEDGERS, AND BOTH ARE EMPTY
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `nexus --help` makes two promises about `--json`, and each had its own defect:
 *
 *   READING THE OUTPUT — "--json prints ONE JSON document on STDOUT and nothing
 *   else."  Ten commands printed two, or printed prose.
 *
 *   FAILURE — "Under --json an error is a JSON document on STDOUT:
 *   {"error":{"message","hint"}}."  NINETY-THREE runs of 502 failed with prose
 *   on stderr and an empty stdout — a non-zero exit and nothing to parse.
 *
 * Both are now zero, and the largest share of each was closed by construction
 * rather than by editing call sites: `emitDocument` makes a second document
 * impossible for the printers, and `installArgumentRefusalReporting` routes
 * every commander refusal through `handleError`.
 *
 * These maps stay because the MECHANISM is the point.
 * `json-one-document.test.ts` compares each against a live scan of every leaf
 * and fails in four directions — an unledgered violation, a stale entry, a moved
 * detail, an entry naming a command that no longer exists — so an empty map is
 * the strictest setting of a ratchet, not a placeholder. Adding a line costs a
 * second deliberate edit to a ceiling below, in the same diff, where a reviewer
 * reads it.
 *
 * ⚠️ DELETING A LINE IS NEVER HOW A RED BUILD IS FIXED. A red says a command
 * moved: fix the command, or — if it was renamed — rename the key.
 */

/**
 * Clause 1. Command path -> the one-line cause, as `describeStdout` reports it.
 *
 * A key is the population key: the leaf path, or `<leaf> --dry-run` for the
 * second variant the scan drives.
 */
export const ONE_DOCUMENT_LEDGER: Readonly<Record<string, string>> = {};

/** Clause 1's violation count as measured. Raising it is a visible edit. */
export const LEDGER_CEILING = 0;

/**
 * Clause 2. Command path -> how it told the caller it had failed.
 *
 * `error-prose` (a message on stderr, nothing on stdout), `error-mute` (nothing
 * anywhere) and `error-masked` (a failure whose stdout reads as a success) are
 * the three shapes this records. None reproduces on any run the scan can drive.
 *
 * ⚠️ THAT IS A CLAIM ABOUT THE DRIVEN RUNS, NOT ABOUT THE TREE, AND READING IT
 * AS THE SECOND COST NINE LIVE DEFECTS. This map at zero says nothing about a
 * branch the scan cannot enter — behind an equality, behind a hand-rolled
 * required-option guard, or behind the `--yes` every run passes.
 * `json-error-document.static-scan.ts` is the instrument for those, and its own
 * ledger is the one to read beside this one.
 */
export const ERROR_DOCUMENT_LEDGER: Readonly<Record<string, string>> = {};

/** Clause 2's violation count as measured. Raising it is a visible edit. */
export const ERROR_LEDGER_CEILING = 0;

/**
 * Clause 2b. Failures whose document carries a `code` that contradicts what
 * happened — the label, not the shape.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * A DOCUMENT WITH THE WRONG `code` IS WORSE THAN THE PROSE IT REPLACED
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The whole value of a document over prose is that a machine can branch on it.
 * `refuse()` shipped with `code` optional, defaulting to `CLI_INVALID_ARGUMENTS`
 * — "the invocation was rejected before anything was sent" — and 30 of the 73
 * call sites that adopted it are failures that happened AFTER: a registry that
 * could not be reached, a validation request that answered 500, an `npm install`
 * that failed, a config write that threw. Every one told a script "you passed a
 * bad argument", so a caller branching on `code` stopped retrying a retryable
 * outage. Prose at least does not lie in a field a script trusts.
 *
 * The default is gone: `refuse` has no `code` parameter at all, and everything
 * else goes through `reportFailure(cause, …)` over a closed union. The
 * mislabelling is unrepresentable rather than reviewed.
 *
 * ⚠️ ENTRIES HERE ARE THE INFERRED ARM ONLY. Two of the scan's four miscode
 * tests are SOUND and can never be ledgered — an unknown code, and a failure the
 * network stub itself caused. The other two INFER from a request count, and one
 * of those has a legitimate exception: an argument refusal CAN follow a request,
 * because `auth login` validates the profile NAME after checking the key against
 * the API. A real exception is named here; anything else is the defect.
 */
export const MISCODED_LEDGER: Readonly<Record<string, string>> = {};

/** Clause 2b's violation count as measured. Raising it is a visible edit. */
export const MISCODED_CEILING = 0;

/**
 * Runs no clause could check at all.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THIS NUMBER WAS 153 AND IT IS NOW 1, AND ALMOST NONE OF THAT IS NEW COVERAGE.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The first pass counted 153 runs as an unmeasured shadow: 93 `silent` plus 59
 * `error-path` plus one `undrivable`. That was the honest reading of ONE clause
 * — none of those runs reaches a success payload, because the harness feeds them
 * synthesized arguments a real command rightly refuses.
 *
 * It was the wrong reading of the CONTRACT. Those runs were not unobserved; they
 * were observed on a clause nothing was checking. 59 already answered with a
 * proper error document — measured, and compliant. 93 answered with prose on
 * stderr — measured, and RED. Calling all 153 "unmeasured" flattened a passing
 * majority and a failing majority into one number that looked like ignorance.
 *
 * So the shadow is redefined to what it always should have been: a run checked
 * by NEITHER clause — it produced no document, and it did not fail either.
 * `error-path` leaves the shadow because a compliant error document is a
 * measurement, not an absence.
 *
 * 1 when this landed: one leaf the real root program registers no command for.
 * A CEILING rather than an equality, so improving drivability is never blocked
 * by this file; only losing coverage is.
 */
export const UNCHECKED_CEILING = 1;

/**
 * The floor on runs that reached a real payload document.
 *
 * 347 when this landed. Far enough below that only a broken harness crosses it —
 * the ratchets that bite are the two ceilings above.
 */
export const PAYLOAD_FLOOR = 300;
