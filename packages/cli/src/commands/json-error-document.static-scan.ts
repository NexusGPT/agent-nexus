/**
 * THE STATIC SIBLING OF THE ONE-DOCUMENT GATE — the branches a driver cannot
 * enter.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHY A SECOND INSTRUMENT, WHEN `json-one-document.test.ts` DRIVES EVERY LEAF
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * That gate is the stronger instrument and stays the primary one: it RUNS every
 * leaf and PARSES what each put on stdout, which is the only way to observe the
 * contract as a caller experiences it. Its limit is not depth. It is REACH.
 *
 * A driven scan can only measure the branch it can reach, and three things it
 * cannot change decide which branch that is:
 *
 *   - **It cannot satisfy an equality.** The SDK stub is a self-similar proxy,
 *     so every field is truthy and no field is a particular string. A command
 *     branching on `result.status === "success"` takes the ELSE arm — or, where
 *     a guard refuses first, never reaches either.
 *   - **It cannot get past a hand-rolled required-option guard.** The argv
 *     synthesizer passes MANDATORY options only, because passing every declared
 *     flag would fire mutually exclusive ones together. A command that declares
 *     `--operation-id` as a plain option and then refuses without it stops at
 *     that refusal, and the whole action body below it is unmeasured.
 *   - **It always passes `--yes`.** Without it a confirmation refuses (by
 *     design), so a destructive command would never reach its printer. Which
 *     means the REFUSAL PATH of every confirmation — the branch a script always
 *     takes — is the one branch the gate structurally cannot drive.
 *
 * Every one of those reads as `clean` or `error-document`. **A branch the
 * instrument cannot enter is not a branch it found compliant**, and a ledger at
 * zero says nothing about any of them.
 *
 * Measured: with both of that gate's ledgers at zero and every leaf green, NINE
 * call sites still failed under `--json` with prose on stderr and an EMPTY
 * stdout — including both halves of one command's own flag pair, where the same
 * action refused `--connection-id` with a document and its adjacent
 * `--access-token` with nothing.
 *
 * ── AND A HAND-WRITTEN CENSUS FOUND SIX OF THE NINE ──────────────────────────
 *
 * `json-failure-doors.test.ts` beside this file is that census: it drives six
 * named doors by hand and asserts one error document on each. It is a good
 * test and it is the reason this file states its own reach in the same breath —
 * because the three it does NOT name were found by nothing but this walk, and
 * all three are in `external-tool`, where the prose sits in a HELPER one call
 * away from the exit:
 *
 *     external-tool delete       printToolHasAttachmentsError, then exit 1
 *     external-tool update       printSpecBreakingChangeError, then exit 1
 *     external-tool update-spec  printSpecBreakingChangeError, then exit 1
 *
 * That is the whole case for a derived population over a written one, measured
 * rather than argued: a hand-listed spec is evidence about the doors somebody
 * thought of, and the three nobody thought of are the three that shipped.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * WHAT THIS CHECKS, AND WHY THE SHAPE IS SYNTACTIC
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * One rule: **a non-zero exit reached after prose went to stderr, with no JSON
 * document emitted on the way.** That is the defect verbatim, and it is a
 * SYNTACTIC pairing — two statements in one scope — so an AST walk reads it
 * directly rather than inferring it. No stub, no runtime, no reachability
 * problem: a branch nobody can drive is read exactly like one everybody drives.
 *
 * This is strictly WEAKER than the driven gate in general (it proves nothing
 * about what a command actually prints) and strictly STRONGER on this one
 * shape. Both, or neither is honest.
 *
 * ── Three properties the rule needs, and each cost a false reading ───────────
 *
 * 1. **EXCLUSIVE BRANCHES DO NOT FOLD INTO EACH OTHER.** `if (ok)
 *    printRecord(x); else { console.error(y); process.exitCode = 1; }` — folding
 *    the THEN arm's document into the ELSE arm marks the defect compliant, and
 *    that arm is `external-tool test-auth`, one of the two findings this gate
 *    was built from. So an `if` / `try` / `switch` / `?:` contributes only its
 *    CONDITION to the sequence; each arm is walked with the state as it stood
 *    BEFORE the branch.
 * 2. **AN EXIT IS COUNTED WHERE IT IS WRITTEN, ONCE.** A deep search from each
 *    enclosing statement finds the same `process.exitCode = 1` at every level
 *    above it, which triples a count and reports one site three times.
 * 3. **"DOES THIS HELPER EMIT A DOCUMENT" IS TRANSITIVE.** `runDeploymentWatch`
 *    writes progress to stderr and returns an exit code; its document comes
 *    from `reportWatchOutcome`, in another file. Classified one level deep it
 *    reads as prose-only and its two compliant call sites read as violations.
 *    So the classification is a fixed point over the call graph.
 *
 * ── The suppression, and it is a real design in this tree ────────────────────
 *
 * A document emitted EARLIER in the same sequence suppresses the report, and
 * that is not leniency — it is `emitDocument`'s FIRST-WINS rule, which this
 * package chose deliberately: the payload keeps stdout, the error goes to
 * stderr, the exit code still says 1. `auth switch` (a success document, then a
 * warning that the switch is shadowed, then exit 1) and `channel
 * whatsapp-template submit-approval` (the template record, then a rejected
 * status, then exit 1) are both that shape on purpose. A rule that called them
 * violations would be describing a CLI nobody wants.
 *
 * `console.log` is NOT stderr prose and never triggers this — the human channel
 * is `console.log`'s job, and under `--json` the printers suppress it
 * themselves.
 *
 * ── THE PARTS ───────────────────────────────────────────────────────────────
 *
 * This file is the rule's DOCUMENT and its public surface; the bodies live in
 * `json-error-document/`, one concern per file.
 *
 * 🚨 EVERY PART IS NAMED `json-error-document.*` ON PURPOSE, AND THE PREFIX IS
 * LOAD-BEARING RATHER THAN DECORATIVE. `isScannable` excludes this scanner's own
 * source by BASE NAME — `!base.startsWith("json-error-document.")` — because
 * this rule describes the defect in prose and in fixtures and would otherwise
 * report itself. A part named `ast.ts` would carry no prefix, so the split would
 * have quietly put the scanner back inside its own population. Keeping the
 * prefix preserves that exclusion verbatim, with no edit to the predicate.
 *
 *   · `.tables.ts`             what counts as prose on stderr, and as a document;
 *   · `.enumerate.ts`          which files this scan reads, and which it refuses;
 *   · `.ast.ts`                the syntactic primitives the rule is built from;
 *   · `.function-facts.ts`     per-function call facts for one file;
 *   · `.prose-only-helpers.ts` the helpers that refuse in prose and never emit;
 *   · `.report.ts`             the finding and the report shapes;
 *   · `.document-follows.ts`   did a document reach stdout on this path;
 *   · `.scan-file.ts`          one file's control-flow walk — the rule itself;
 *   · `.scan-tree.ts`          the drivers over a tree and over given sources.
 * ⚠️ THE EXPORT LIST BELOW IS EXACTLY WHAT THIS FILE EXPORTED BEFORE THE SPLIT,
 * AND DELIBERATELY NOT ONE NAME MORE. Re-exporting every part's helper because
 * the barrel can reach it would widen this module's public surface under cover
 * of a refactor — which is a behaviour change nothing in a green suite reports.
 * A part that needs a sibling's helper imports it directly.
 */

export { sourceFiles } from "./json-error-document/json-error-document.enumerate";
export { proseOnlyHelpers } from "./json-error-document/json-error-document.prose-only-helpers";
export type {
  ProseRefusal,
  StaticScanReport
} from "./json-error-document/json-error-document.report";
export { parse, scanSources, scanTree } from "./json-error-document/json-error-document.scan-tree";
