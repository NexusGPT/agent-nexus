/**
 * THE ONE-DOCUMENT SCAN — drive every leaf under `--json` and parse its stdout.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * THE INVARIANT, AND THE ONE SHAPE THAT IS EXEMPT FROM IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Under `--json` a command's stdout is ONE parseable JSON document PER TERMINAL
 * RESULT. The root epilogue has promised the first half since NEX-2176 —
 * "--json prints ONE JSON document on STDOUT and nothing else" — and nothing
 * checked it, so 24 commands broke it while the sentence stayed in every
 * `--help`.
 *
 * "Per terminal result" is not a softening. Two commands legitimately produce
 * many values and neither is a defect: `apps logs --follow` emits NDJSON
 * because an array's closing bracket only exists once the stream ends, and a
 * follow does not end; `execution follow` polls and prints per-node progress
 * until the run terminates. A rule that called those violations would be
 * describing a CLI nobody wants. So a streaming command DECLARES itself in
 * {@link STREAMING_LEAVES}, and that list is asserted NON-EMPTY and SMALL by the
 * gate — an exemption nobody can grow quietly is the only kind worth having.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY THE POPULATION IS DERIVED AND THE OUTCOME HAS THREE STATES
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The population is `deriveCommandLeaves()` — the same walk `command-universe`
 * hands the classification gate and the docs generator. A hand-written list of
 * commands beside an evolving CLI goes stale in silence, and a gate over a stale
 * list reads exactly like a gate over a complete one.
 *
 * The outcome is NOT a boolean. A command that never reached a printer produced
 * an empty stdout, and an empty stdout parses no worse than a good document —
 * it just fails `JSON.parse` differently, or not at all. Reporting that as
 * "clean" is how an instrument that read nothing wears a clean result. So each
 * run lands in exactly one {@link Outcome}, and `clean` is reserved for a run
 * that actually produced a payload document. Everything else is counted
 * separately and the gate holds a FLOOR on `clean`.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THE STUB IS, AND WHAT IT CANNOT DO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Every SDK call resolves to a self-similar, depth-bounded proxy over an array:
 * every property read yields another one, so `result.steps.map(...)` works,
 * `Array.isArray` is true, `JSON.stringify` terminates, and — the property that
 * matters — every field is TRUTHY. A truthy field takes the `if` branch, which
 * is the branch that prints the second document. The stub is chosen to be the
 * WORST case for this invariant, not a plausible one.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 THE MODE IS AN OUTPUT OF THE RUN, NEVER AN INPUT TO IT
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `--json` rides in argv and NOTHING here calls `setJsonMode(true)`. The harness
 * used to, and that single statement made the whole PRE-HOOK half of the
 * contract unreachable: JSON mode is decided in the root's `preAction` hook,
 * commander refuses an invalid invocation above the hook chain, and a harness
 * that flipped the flag itself was measuring a world where that cannot happen.
 * Both ledgers read ZERO while `nexus agent get --json` exited 1 with an empty
 * stdout. A gate that supplies the precondition its subject is supposed to
 * establish reports on its own harness.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 🚨 FOUR BRANCHES THIS SCAN STRUCTURALLY CANNOT ENTER, AND THE SIBLINGS THAT
 *    READ THEM
 * ══════════════════════════════════════════════════════════════════════════════
 *
 *   - **An equality.** The stub is a proxy, so no field is a particular string.
 *     A command branching on `result.status === "success"` takes the else arm —
 *     or, where a guard refuses first, never reaches either.
 *   - **A hand-rolled required-option guard.** {@link synthesizeArgv} passes
 *     MANDATORY options only. A command that declares `--operation-id` as a
 *     plain option and then refuses without it stops at that refusal, and its
 *     whole action body is unmeasured.
 *   - **A confirmation's refusal path.** `--yes` rides every run, so the branch
 *     a SCRIPT always takes is the branch this scan never takes.
 *   - **AN ARGV THE SYNTHESIZER NEVER PRODUCES.** {@link synthesizeArgv} fills
 *     every mandatory option and every required positional from its own
 *     declaration, so a missing argument, an unknown command, an unknown option
 *     and an excess argument are removed from this population BY CONSTRUCTION —
 *     and every one of them is a refusal commander decides above the hook chain.
 *     `json-refusal-above-the-hook-chain.test.ts` drives that shadow directly.
 *     The one member of the class this scan does reach is a value outside a
 *     `.choices()` set, because `"stub"` is a legal string and an illegal
 *     choice; those four runs are what caught the defect above.
 *
 * All four read as `clean` or `error-document` here. A branch this instrument
 * cannot enter is not a branch it found compliant, and both ledgers sitting at
 * zero says nothing about any of them: NINE call sites still exited non-zero
 * with an empty stdout while every leaf ran green.
 *
 * `json-error-document.static-scan.ts` is the sibling that reads them. It walks
 * the AST for the syntactic pairing — prose to stderr, then a non-zero exit,
 * no document between — which is readable in a branch nobody can drive exactly
 * as in one everybody drives. Weaker than this scan in general, stronger on
 * that one shape; both, or neither is honest.
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the scan's DOCUMENT and its public surface; the bodies live in
 * `json-one-document/`, one concern per file:
 *
 *   · `leaves.ts`           the three declared exemption lists;
 *   · `outcome.ts`          the five outcomes, the six error outcomes, the report;
 *   · `describe-stdout.ts`  how many documents, and was there prose;
 *   · `synthesize-argv.ts`  an argv built from commander's own declarations;
 *   · `drive-deps.ts`       what one run needs, and the exit neutraliser;
 *   · `sandbox.ts`          running one command with every stream captured;
 *   · `codes.ts`            which codes imply a request left this process;
 *   · `classify-error.ts`   which error clause a FAILED run fell into;
 *   · `drive-one.ts`        one leaf, driven and classified;
 *   · `run-scan.ts`         the population, the loop, and the tallies.
 *
 * 🚨 `driveOne` WAS 220 LINES AND IS THE ONE FUNCTION THIS SPLIT DECOMPOSED
 * rather than merely moved — the 80-line cap armed alongside it leaves no
 * choice. Its sandbox half is `runInSandbox` and its error-clause IIFE is
 * `classifyErrorOutcome`; both bodies are verbatim, and the two orderings
 * `driveOne` documented in its own comments are preserved inside `runInSandbox`
 * rather than spread across the seam.
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. Re-exporting every part's helper because
 * the barrel can reach it would widen this module's public surface under cover
 * of a refactor — which is a behaviour change nothing in a green suite reports.
 * A part that needs a sibling's helper imports it directly.
 */

export { NETWORK_STUB_MESSAGE } from "./json-one-document/codes";
export { describeStdout } from "./json-one-document/describe-stdout";
export type { DriveDeps } from "./json-one-document/drive-deps";
export {
  EXEMPT_LEAVES,
  PAYLOAD_PASSTHROUGH_LEAVES,
  STREAMING_LEAVES
} from "./json-one-document/leaves";
export type { ErrorOutcome, LeafRun, Outcome, ScanReport } from "./json-one-document/outcome";
export { runOneDocumentScan } from "./json-one-document/run-scan";
export {
  placeholderFor,
  synthesizeArgv,
  type Synthesized
} from "./json-one-document/synthesize-argv";
